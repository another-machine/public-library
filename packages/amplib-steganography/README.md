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
| `Stegassette`  | Multi-payload STGC format: audio + arbitrary entries, self-describing alpha header, 11 combine ops, 9 traversals, 6 keymaps. See [Stegassette.md](./Stegassette.md) for format details. |
| `StegaAnimator`| Animates an encoded image on a canvas                                                                                                                                                  |

The pre-STGC modules below still ship, but both consumers are gone —
`machines/sonic-pixels` is retired, and the iOS `StegaKit` that ported this API to
Swift is archived at `_archive/stega-player`. They stay for now because this is a
published package and dropping them is a breaking change, not because anything here
needs them. They are no longer documented on the site, and new work should use
`Stegassette`.

| Module          | Description                                        |
| --------------- | -------------------------------------------------- |
| `Stega64`       | Text messages encoded in image pixels              |
| `StegaCassette` | Audio encoded in image pixels                      |
| `StegaBinary`   | Arbitrary binary data encoded in image pixels      |
| `StegaKey`      | Key image creation for keyed encoding              |
| `StegaMetadata` | Metadata sidecar encoded in image border pixels    |

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
  traversal: "raster", // 9 traversal patterns
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

### Node.js (read/write PNG files)

```typescript
import { Stegassette, readPng, writePng } from "@amplib/steganography/node";

const img = await readPng("input.png");
const out = Stegassette.encodeImageData({ source: img, entries: [audioEntry] });
await writePng("output.png", out);
const { entries } = Stegassette.decodeImageData({ source: out });
```

### StegaCassette (pre-STGC)

```typescript
import { StegaCassette } from "@amplib/steganography";

const canvas = StegaCassette.encode({
  source: image, // HTMLImageElement | HTMLCanvasElement
  audioBuffers: [leftChannel, rightChannel], // Float32Array[]
  sampleRate: 44100,
  bitDepth: 16,
  encoding: "additive",
});

const audioBuffers = StegaCassette.decode({
  source: image,
  bitDepth: 16,
  channels: 2,
  encoding: "additive",
});
```
