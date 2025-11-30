# Steganography

Encoding data into images and decoding it back. [./demo](./demo/) has some examples of how to use the library.

Origin: [ja-k-e/stega](https://github.com/ja-k-e/stega).

## Usage

### Encoding

```typescript
import { StegaCassette } from "@another-machine/amplib-steganography";

const canvas = StegaCassette.encode({
  source: image, // HTMLImageElement | HTMLCanvasElement
  audioBuffers: [leftChannel, rightChannel], // Float32Array[]
  sampleRate: 44100,
  bitDepth: 16,
  encoding: "additive",
});
```

### Decoding

```typescript
import { StegaCassette } from "@another-machine/amplib-steganography";

const audioBuffers = StegaCassette.decode({
  source: image, // HTMLImageElement | HTMLCanvasElement
  bitDepth: 16,
  channels: 2,
  encoding: "additive",
});
```

### Multiple Files

You can also encode and decode multiple files at once by using the `sources` property instead of `source`.

```typescript
const canvases = StegaCassette.encode({
  sources: [image1, image2],
  // ...
});

const audioBuffers = StegaCassette.decode({
  sources: [image1, image2],
  // ...
});
```

## TODO

- decoding pair of images for base 64
