# STGC format specification

Version 1. Magic bytes `STGC` (0x53 0x54 0x47 0x43).

A STGC file is a PNG. All data lives in pixel values — no custom chunks, no
metadata fields. A PNG decoder that knows nothing about STGC will display a
normal image. A STGC decoder recovers audio and any other payloads by reading
pixel values directly.

## Image structure

```
border pixels     : frame of B pixels on every side (B ≥ 1)
interior pixels   : everything inside the border frame
```

Interior pixels are divided into two interleaved roles by their coordinates
relative to the interior origin (0,0):

```
data pixel   : y%2==0 → x%2==1 ; y%2==1 → x%2==0   (checkerboard)
key pixel    : all other interior pixels
```

The keymap determines which key pixel pairs with each data pixel (see §Keymaps).
The combine op determines how a payload byte maps to the difference between them
(see §Combine ops).

Border pixels carry the header in their alpha channel. All interior pixels have
alpha = 255. This keeps interior RGB data safe from PNG alpha premultiplication.

## Border / header encoding

### Border width B

```
pixel (0,0) alpha = B    if B ≤ 255  (single-byte form)
pixel (0,0) alpha = 0    sentinel for two-byte form:
  border_pixel[1].alpha = B & 0xff
  border_pixel[2].alpha = (B >> 8) & 0xff
```

Border pixels are enumerated in raster order (top row left→right, then left
column top→bottom, then right column top→bottom, then bottom row left→right).

### STGC header bytes

The header is written into the alpha channel of consecutive border pixels,
centered in the bottom row. Zero bytes are clamped to 1 on encode; the XOR
checksum at the end allows the original zeros to be recovered on decode.

```
bytes 0–3    magic  0x53 0x54 0x47 0x43  ("STGC")
byte  4      version = 1
bytes 5–8    interiorByteLength  UInt32LE
byte  9      entryCount  UInt8
byte  10     descLen  UInt8  (descriptor byte length; always < 256)
byte  11     reserved = 0
bytes 12..   descriptor: \x01-separated "key=value" pairs (see §Descriptor)
last byte    XOR checksum of all preceding header bytes
```

Total header size = 12 + descLen + 1 bytes.

### Descriptor

`\x01`-separated `key=value` pairs with a trailing `\x01`. Keys present:

| key        | always? | value                                                             |
| ---------- | ------- | ----------------------------------------------------------------- |
| `combine`  | yes     | combine op name (default `xor`)                                   |
| `keymap`   | yes     | keymap name (default `adjacent`)                                  |
| `traversal`| yes     | traversal name (default `raster`)                                 |
| `seed`     | if `fisher-yates` | uint32 seed                                         |
| `a`        | if `angle` | integer a parameter                                           |
| `b`        | if `angle` | integer b parameter                                           |
| `kx`       | if `offset` keymap | signed integer x offset (torus-wrapped)            |
| `ky`       | if `offset` keymap | signed integer y offset (torus-wrapped)            |
| `ch`       | non-default channel plan | slot token e.g. `r.additive+g.xor`        |
| `pad`      | aligned plan with pad > 0 | alignment gap byte count              |
| `pack`     | if `aligned` or `mono` | `aligned` or `mono`                          |

The default channel plan (packed, r→g→b, one shared combine op) omits `ch`,
`pad`, and `pack`, keeping the header compact and byte-identical to
pre-channel-plan output.

## Interior byte stream

Interior pixels carry the byte stream using the channel plan (§Channel plan).
The traversal order (§Traversals) determines the sequence of data pixels.

Stream layout:

```
[entry table]          N records (see below), one per entry
[pad bytes]            zero-filled; count stored in descriptor `pad`
                       aligns first payload to a pixel boundary (aligned plans only)
[payload 0]
[payload 1]
...
[payload N-1]
```

Entry table record (each entry, in order):

```
2 bytes    mimetypeLen  UInt16LE
M bytes    mimetype     ASCII
2 bytes    nameLen      UInt16LE
N bytes    name         UTF-8
4 bytes    payloadLen   UInt32LE
```

Payloads follow the table concatenated in entry order.

### Audio entries

Audio payloads are raw PCM, signed big-endian (MSB first) for 16- and 24-bit.
The mimetype carries format metadata following RFC 2586:

```
audio/L<bits>; rate=<hz>; channels=<n>[; layout=<layout>][; block=<size>]
```

Examples:
```
audio/L16; rate=22050; channels=1
audio/L8; rate=11600; channels=1
audio/L16; rate=44100; channels=2; layout=interleaved
```

`layout` is omitted when `planar` (default). `block` is present only when
`layout=block`.

**PCM encoding:** samples are unsigned offset-binary, MSB first per sample.

| bits | range          | encoding                       |
| ---- | -------------- | ------------------------------ |
| 8    | 0–255          | single byte; 128 = silence     |
| 16   | 0–65535        | two bytes, big-endian; 32768 ≈ silence |
| 24   | 0–16777215     | three bytes, big-endian; 8388608 ≈ silence |

**Channel layouts** for multi-channel audio:

| layout        | description                                                   |
| ------------- | ------------------------------------------------------------- |
| `planar`      | all samples for channel 0, then all for channel 1, …          |
| `interleaved` | ch0, ch1, ch0, ch1, … (sample-by-sample)                      |
| `block`       | interleaved in blocks of `blockSize` samples per channel      |

## Payload integrity

There is no checksum on individual entries or payloads. A single corrupted
pixel silently alters audio. This is deliberate: pixel-level edits, JPEG
re-saves, or color grading affect the recovered audio directly, making the
image and its sound physically coupled. Treat degradation as an aesthetic
property of the format.

The header XOR checksum exists only to recover zero-clamped bytes — not as a
data-integrity guard.

## Combine ops

Each combine op is a reversible mapping between (audio_byte, key_channel_value)
and (encoded_data_channel_value). Some ops also modify the key pixel
(noted below).

| name          | data pixel value                  | key pixel     | notes                                          |
| ------------- | --------------------------------- | ------------- | ---------------------------------------------- |
| `xor`         | `audio ^ key`                     | unchanged     |                                                |
| `additive`    | `(audio + key) & 0xff`            | unchanged     |                                                |
| `subtractive` | `(key - audio + 256) & 0xff`      | unchanged     |                                                |
| `midpoint`    | `(audio + key) >> 1`              | `key & ~1 \| audio & 1` | LSB of key carries audio LSB  |
| `difference`  | `(modKey - audio + 256) & 0xff`   | spread symmetrically around midpoint |             |
| `bitshift`    | rotate `audio` left by `key & 7`  | unchanged     | shift amount recoverable from unchanged key    |
| `noise`       | mirror below audio at same distance | moved to `audio + floor(space/2)` | uses existing pixel contrast |
| `echo`        | `audio` verbatim                  | `origKey ^ audio` | key becomes a high-contrast XOR ghost     |
| `signed`      | `(audio + key + 128) & 0xff`      | unchanged     | silence (128) leaves data pixel = key; amplitude displaces ± |
| `veil`        | `(audio + 3·modKey) >> 2`         | `key & ~3 \| audio & 3` | 25% blend; low 2 bits of key carry audio low 2 bits |
| `whisper`     | `(data & 0xf0) \| (audio >> 4)`   | `key & 0xf0 \| audio & 0x0f` | high nibbles of both pixels preserved; max delta 15 |

Decode (recover audio from encoded image):

| name          | decode formula                                   |
| ------------- | ------------------------------------------------ |
| `xor`         | `data ^ key`                                     |
| `additive`    | `(data - key) & 0xff`                            |
| `subtractive` | `(key - data + 256) & 0xff`                      |
| `midpoint`    | `(data * 2 - key) & 0xff`                        |
| `difference`  | `(key - data + 256) & 0xff`                      |
| `bitshift`    | rotate `data` right by `key & 7`                 |
| `noise`       | `round(abs(data - key) / 2 + min(data, key))`    |
| `echo`        | `data` (audio is stored verbatim in data pixel)  |
| `signed`      | `(data - key + 128) & 0xff`                      |
| `veil`        | `(4 * data - 3 * key) & 0xff`                    |
| `whisper`     | `((data & 0x0f) << 4) \| (key & 0x0f)`           |

## Keymaps

For a data pixel at interior coordinates `(dx, dy)` in an interior of size
`(IW, IH)`, the keymap returns the interior coordinates of its key pixel:

| name       | key pixel location                                                    |
| ---------- | --------------------------------------------------------------------- |
| `adjacent` | one pixel left on even rows, one right on odd rows                    |
| `poles`    | diagonally opposite corner (180° rotation), then find nearest key    |
| `mirror-x` | horizontally flipped, then find nearest key                           |
| `mirror-y` | vertically flipped, then find nearest key                             |
| `offset`   | data position + `(kx, ky)` (torus-wrapped), then snap to nearest key pixel; `kx`/`ky` stored in descriptor |
| `rotate`   | 90° clockwise rotation (aspect-normalized), then snap to nearest key pixel |

## Traversals

Traversal defines the order data pixels are visited when writing or reading the
byte stream. Stored as a `Uint32Array` of interior-local linear indices
`v = ly * IW + lx`; recover coordinates with `lx = v % IW`, `ly = v / IW | 0`.

| name            | order                                                              |
| --------------- | ------------------------------------------------------------------ |
| `raster`        | left-to-right, top-to-bottom                                       |
| `boustrophedon` | alternating left→right / right→left rows                           |
| `spiral`        | clockwise from top-left                                            |
| `angle`         | sorted by `a·x + b·y`; params `a` and `b` in descriptor           |
| `fisher-yates`  | seeded LCG shuffle of raster order; seed in descriptor             |
| `center-out`    | sorted by Euclidean distance from image center                     |
| `hilbert`       | Hilbert curve order                                                |
| `polar`         | clockwise angular sweep from 12 o'clock; radius ascending within a ray; integer-only comparator (no trig) |
| `bayer`         | ordered-dither (Bayer matrix) order; every prefix of the path is a uniform sample of the plane |

## Channel plan

A channel plan specifies which RGB channels carry payload bytes and which
combine op applies to each. Channels not in the plan pass through the source
image unchanged.

Default plan (omitted from descriptor): packed, r→g→b, all three channels,
one shared combine op. This is the densest packing (3 payload bytes per pixel)
and matches all output produced before channel plans were introduced.

Non-default plans are serialized as a slot token in the descriptor `ch` key:

```
r.additive+g.xor+b.subtractive   (three slots, one per channel, in order)
r.xor                             (red only; green and blue pass through)
b.additive+r.xor                  (blue first, then red; green untouched)
```

**Packing modes:**

| mode      | description                                                                       |
| --------- | --------------------------------------------------------------------------------- |
| `packed`  | active channels are an ordered subset of [r,g,b]; stream flows continuously       |
| `aligned` | channel count = min(bytesPerSample, 3); one audio sample always lands in one pixel |
| `mono`    | one stream byte is broadcast to all three channels (1 byte/pixel); each channel decodes independently to the same value, producing a pure-luminance ghost |

`aligned` pads the entry table to a pixel boundary so the byte-within-sample →
channel assignment is identical for every pixel. Pad byte count is stored in
the descriptor `pad` key.

`mono` does not emit a `ch` descriptor key. The decoder recognises `pack=mono`
and rebuilds the three-slot plan automatically.

## Reference decoder

`decode-audio.js` is a minimal reference implementation (Node.js, ~70 lines)
that reads a STGC PNG and writes the raw PCM of the first audio entry to
stdout. It depends only on `pngjs` (for PNG decode) and `steg-core.js`.
