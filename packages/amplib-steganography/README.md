# Steganography

Encoding data into images and decoding it back.

Origin: [ja-k-e/stega](https://github.com/ja-k-e/stega).

## Modules

| Module          | Description                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Stega64`       | Text messages encoded in image pixels                                                                                                                                                   |
| `StegaCassette` | Audio encoded in image pixels (legacy; see Stegassette for the newer format)                                                                                                            |
| `StegaBinary`   | Arbitrary binary data encoded in image pixels                                                                                                                                           |
| `StegaKey`      | Key image creation for keyed encoding                                                                                                                                                   |
| `StegaMetadata` | Metadata sidecar encoded in image border pixels                                                                                                                                         |
| `Stegassette`   | Multi-payload STGC format: audio + arbitrary entries, self-describing alpha header, 11 combine ops, 9 traversals, 6 keymaps. See [Stegassette.md](./Stegassette.md) for format details. |

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

### Node.js (read/write PNG files)

```typescript
import { Stegassette, readPng, writePng } from "@amplib/steganography/node";

const img = await readPng("input.png");
const out = Stegassette.encodeImageData({ source: img, entries: [audioEntry] });
await writePng("output.png", out);
const { entries } = Stegassette.decodeImageData({ source: out });
```

### StegaCassette (legacy)

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
