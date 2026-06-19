# Stegassette — STGC Format Reference

`Stegassette` implements the **STGC steganography format**: a self-describing, paired-pixel scheme built on four orthogonal transform axes. Each axis is chosen independently, persisted in a border-pixel alpha channel header, and recovered automatically on decode — no separate sidecar file required.

---

## The four axes

| Axis | Default | Description |
|------|---------|-------------|
| **traversal** | `raster` | Order in which data pixels are visited |
| **keymap** | `adjacent` | How each data pixel finds its paired key pixel |
| **combine** | `xor` | How the payload byte is mixed with the key pixel channel value |
| **channel plan** | packed r→g→b | Which RGB channels carry which bytes, and at what density |

A cover image encodes against itself (self-keying): `decode(img, img)`. The cover is also its own key, so nothing extra is stored.

---

## Combine ops

All 11 combine ops operate per-channel on unsigned 8-bit values (mod 256).

| Name | Lossless | Decode formula | Notes |
|------|----------|---------------|-------|
| `xor` | ✓ | `e ^ k` | Default; cheap, balanced bit scatter |
| `additive` | ✓ | `(e - k + 256) % 256` | Additive shift |
| `subtractive` | ✓ | `(k - e + 256) % 256` | Subtractive shift |
| `bitshift` | ✓ | `((e << 4) \| (e >> 4)) ^ k` | Nibble-swap before XOR |
| `signed` | ✓ | `((e - k + 384) % 256) - 128` | Signed additive |
| `echo` | ✓ | `e ^ (k >> 1)` | Half-shifted XOR; also modifies key pixel |
| `veil` | ✓ | `(e + k * 2) % 256` | Key-weighted addition; also modifies key |
| `whisper` | ✓ | `(e - k * 2 + 512) % 256` | Key-weighted subtraction; also modifies key |
| `midpoint` | ✗ | `(e * 2 - k + 256) % 256` | Artistic; key pixel is shifted to midpoint |
| `difference` | ✗ | `(e - k + 256) % 256` | Artistic; key drifts on encode |
| `noise` | ✗ | `(e ^ (k * 31 + 7)) % 256` | Artistic; pseudo-random scatter |

"Lossless" means the decode formula is an exact inverse of encode — `COMBINE(ENCODE_OP(a, k), k) === a` for all `a`, `k`. Artistic ops produce visually interesting results but cannot guarantee byte-exact payload recovery and should only be used for demonstration or exploration.

`echo`, `veil`, and `whisper` also apply `KEY_MOD` — the key pixel's channel value is mutated during encode to reflect the pair relationship. This makes them sensitive to key pixel ordering.

---

## Keymaps

Each data pixel `(dx, dy)` in interior-local coordinates finds its key pixel via:

| Name | Key pixel location | Notes |
|------|--------------------|-------|
| `adjacent` | Same row: `dx-1` if row is even, `dx+1` if odd | Always a direct neighbor; never wraps |
| `poles` | `(IW-1-dx, IH-1-dy)` | Diagonally opposite corner |
| `mirror-x` | `(IW-1-dx, dy)` | Horizontal mirror |
| `mirror-y` | `(dx, IH-1-dy)` | Vertical mirror |
| `rotate` | `(IH-1-dy, dx)` (rotated 90°) | Rotation mapping |
| `offset` | `(dx + kx, dy + ky)` mod interior size | Parameterized; `kx` and `ky` stored in header |

All keymap targets are snapped to the nearest key pixel if they accidentally land on a data pixel.

---

## Traversals

Traversals determine the order data pixels are written/read. All return a `Uint32Array` of linear indices `v = y * W + x` (full-canvas coordinates).

| Name | Pattern | Params |
|------|---------|--------|
| `raster` | Left-to-right, top-to-bottom | — |
| `boustrophedon` | Snake (alternates direction each row) | — |
| `spiral` | Outside-in clockwise spiral | — |
| `center-out` | Expanding squares from center | — |
| `polar` | Angular sweep from center | — |
| `bayer` | Bayer matrix order (dispersed) | — |
| `hilbert` | Hilbert space-filling curve | — |
| `angle` | Diagonal lines at slope `a/b` | `a`, `b` (integers, stored in header) |
| `fisher-yates` | Pseudorandom permutation | `seed` (32-bit uint, stored in header) |

`fisher-yates` with a random seed is the closest Stegassette has to encryption — payloads look random without the seed. The seed is stored in the header, so an attacker who can read the header can still recover the ordering.

---

## Channel plans

A channel plan controls how many bytes are extracted per pixel and via which color channels.

| Mode | Bytes per pixel | Description |
|------|----------------|-------------|
| `packed` | 3 | R, G, B each carry one independent byte (default) |
| `aligned` | 1 | One byte per pixel (stored in one chosen channel; R by default) |
| `mono` | 1 | One byte broadcast to R = G = B |

Custom plans can mix per-channel combine ops:

```
ch=r.additive+g.xor+b.subtractive
```

When the plan is the default (packed, r→g→b, one shared combine), no `ch` field appears in the header.

---

## Alpha-channel header

The STGC header is hidden in the **alpha channel of border pixels** — never in the interior RGB — so it survives pre-multiplied-alpha pipelines and is invisible to casual inspection (alpha is typically rendered as fully-opaque).

### Layout

```
[MAGIC: 4B]  [VERSION: 1B]  [B_LO: 1B]  [B_HI: 1B]  [DESC_LEN: 2B LE]
[INTERIOR_BYTES: 4B LE]  [ENTRY_COUNT: 1B]  [PAD: 1B]  [CHECKSUM: 1B XOR]
[DESCRIPTOR: desc_len bytes]  [NUL: 1B]
```

- **MAGIC** = `53 54 47 43` ("STGC" in ASCII)
- **VERSION** = `01`
- **B_LO / B_HI** = border width as two separate bytes so neither is zero (zero is clamped to 1 in PNG alpha)
- **CHECKSUM** = XOR of all preceding bytes in the fixed header (bytes 0–10); used to recover up to two zero-clamped bytes in the variable descriptor
- **DESCRIPTOR** = newline-separated `key=value` pairs (SOH `\x01` as separator): `combine`, `keymap`, `traversal`, and optional `seed`/`a`/`b`/`kx`/`ky`/`ch`/`pad`/`pack`

### Zero-clamping recovery

PNG alpha stores `0` as transparent and some renderers pre-multiply RGBA, crushing non-opaque alpha to zero. The decoder performs brute-force zero recovery: if the checksum fails, it tries all combinations of zero-clamped bytes (up to 2^20 candidates) until the XOR checksum matches.

---

## Entry table

The interior byte stream begins with a compact entry table followed by padding (if any) and the concatenated payloads:

```
[TABLE][PAD][PAYLOAD_0][PAYLOAD_1]...
```

Each table record:

```
[MIME_LEN: 2B LE]  [MIMETYPE: mime_len bytes]
[NAME_LEN: 2B LE]  [NAME: name_len bytes]
[DATA_LEN: 4B LE]
```

Payloads are written contiguously after the table. The `dataOffset` in a `DecodedEntry` is an absolute byte offset into the stream, computed from the table records.

---

## Audio entries (RFC-2586)

Audio payloads use MIME types in RFC-2586 format:

```
audio/L16; rate=44100; channels=2
audio/L8; rate=22050; channels=1
audio/L24; rate=48000; channels=2; layout=interleaved; blockSize=512
```

- **Lxx** = unsigned offset-binary PCM at `xx` bits per sample, big-endian (MSB first so the coarsest amplitude byte lands in the most-visible R channel)
- **rate** = sample rate in Hz
- **channels** = channel count
- **layout** = `planar` (default) or `interleaved` or `block`
- **blockSize** = block size in samples (only for `block` layout)

### PCM encoding

| Bits | Bytes/sample | Encode | Decode |
|------|-------------|--------|--------|
| 8 | 1 | `round((s + 1) × 127.5)` clamped to [0, 255] | `(b − 128) / 128` |
| 16 | 2 | `round(s × 32767.5 + 32767.5)` MSB first | `(b − 32768) / 32768` |
| 24 | 3 | `round(s × 8388607.5 + 8388607.5)` MSB first | `(b − 8388608) / 8388608` |

`s` is a float in [−1, 1]. 8-bit has ~1% quantization error due to offset mismatch between encode and decode.

---

## API quick reference

```typescript
import { Stegassette } from "@amplib/steganography";

// Build an audio entry
const entry = Stegassette.buildAudioEntry({
  channels: [Float32Array, Float32Array],  // per-channel PCM
  sampleRate: 44100,
  bitsPerSample: 16,  // 8 | 16 | 24
  name: "track.pcm",  // optional
});

// Encode into an image (browser)
const canvas = Stegassette.encode({
  source,         // HTMLImageElement | HTMLCanvasElement
  entries: [entry],
  combine: "xor",         // default
  keymap: "adjacent",     // default
  traversal: "raster",    // default
  border: 1,
});

// Decode (browser) — self-keying, no separate key image needed
const { entries, opts } = Stegassette.decode({ source: canvas });

// Parse audio back out
const { channels, sampleRate } = Stegassette.parseAudioEntry(entries[0]);

// Encode/decode in Node (separate entry point)
import { Stegassette, readPng, writePng } from "@amplib/steganography/node";
const img = await readPng("input.png");
const out = Stegassette.encodeImageData({ source: img, entries });
await writePng("output.png", out);
const { entries: decoded } = Stegassette.decodeImageData({ source: out });
```
