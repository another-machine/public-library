# Steganography

Encoding data into images and decoding it back.

Origin: [ja-k-e/stega](https://github.com/ja-k-e/stega).

## Modules

`Stegassette` is the current format and the only one carried by the
[published docs](https://amplib.app/steganography), alongside `StegaAnimator`
and the helper functions. It subsumes what the pre-STGC modules each did
separately — text, audio, and arbitrary bytes are all just entries.

| Module         | Description                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Stegassette`  | Multi-payload STGC format: audio + arbitrary entries, self-describing alpha header, 11 combine ops, 10 traversals, 6 keymaps. See [Stegassette.md](./Stegassette.md) for format details. |
| `Stegaprint`   | STGP format: survives JPEG re-encoding. Block-DCT carriers, a visible fiducial border, ~160× less capacity. Phases 0–1 built. See [Stegaprint.md](./Stegaprint.md).                     |
| `StegaAnimator`| Animates an encoded image on a canvas                                                                                                                                                  |

`Stegassette` needs pixels back exactly as written, so it does not survive a
JPEG re-save: its header is in an alpha channel JPEG does not have, and the
combine ops encode payload at the spatial frequency an 8×8 quantizer discards
first. Use `Stegaprint` when the image will be re-encoded, at roughly 160× less
capacity.

The pre-STGC modules — `Stega64`, `StegaCassette`, `StegaBinary`, `StegaKey`,
and `StegaMetadata` — were removed in 1.0. Their consumers were already gone:
`machines/sonic-pixels` is retired, and the iOS `StegaKit` that ported the API
to Swift is archived at `_archive/stega-player`. They were kept only because
dropping them was a breaking change. `Stegassette` supersedes all of them.

To keep using them, pin `@amplib/steganography@^0.1.0`; that line is not
maintained. The 1.0 surface is `Stegassette`, `StegaAnimator`, and the file and
audio helpers.

## Usage

### Stegassette

```typescript
import { Stegassette } from "@amplib/steganography";

// Build an audio entry from decoded PCM channels
const audioEntry = Stegassette.buildAudioEntry({
  channels: [leftChannel, rightChannel], // Float32Array[]
  sampleRate: 44100,
  bitsPerSample: 16,
});

// Encode into an image
const canvas = Stegassette.encode({
  source: image, // HTMLImageElement | HTMLCanvasElement
  entries: [audioEntry],
  combine: "xor", // 11 combine ops available
  traversal: "raster", // 10 traversal patterns
  keymap: "adjacent", // 6 keymaps
});

// Decode — self-keying, no separate key image needed
const { entries, opts } = Stegassette.decode({ source: canvas });
const { channels, sampleRate } = Stegassette.parseAudioEntry(entries[0]);
```

An entry is a mimetype, an optional name, and bytes — a string is encoded as
UTF-8 — so text needs no separate module:

```typescript
const canvas = Stegassette.encode({
  source: image,
  entries: [{ mimetype: "text/plain", name: "message.txt", data: "Hello world" }],
});

const { entries } = Stegassette.decode({ source: canvas });
const message = new TextDecoder().decode(entries[0].data);
```

### Stegaprint

Entries carry a type enum rather than a mimetype string, and lengths are counted
in 16-byte chunks — fixed-width records are why the format needs no error
correction on its own structure. The canvas is sized by the payload unless you
force it.

```typescript
import { Stegaprint } from "@amplib/steganography";

const image = Stegaprint.encode({
  source: img,
  entries: [
    { type: Stegaprint.EntryType.Text, name: "message.txt", data: "Hello world" },
  ],
});
// image is StegaImageData — encode it to JPEG yourself (canvas.toBlob, sharp, …)

const { entries, header, registered } = Stegaprint.decode(jpegDecodedPixels);
const message = new TextDecoder().decode(entries[0].data);
```

`registered` reports whether the corner marks read; `entries[i].crcOk` reports
whether a payload still matches its recorded checksum. Neither causes a decode to
fail — a damaged payload is a legitimate outcome, and the caller decides.

To target a fixed output size (video frames, or replacing an existing asset), ask
what fits first:

```typescript
const { bytes } = Stegaprint.capacity(1920, 1080);   // ~19 KB
Stegaprint.encode({ source: img, entries, width: 1920, height: 1080 });
```

### Node.js (read/write PNG files)

```typescript
import { Stegassette, readPng, writePng } from "@amplib/steganography/node";

const img = await readPng("input.png");
const out = Stegassette.encodeImageData({ source: img, entries: [audioEntry] });
await writePng("output.png", out);
const { entries } = Stegassette.decodeImageData({ source: out });
```

