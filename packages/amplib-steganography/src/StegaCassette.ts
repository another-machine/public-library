import * as StegaMetadata from "./StegaMetadata";
import {
  createCanvasAndContext,
  createCanvasAndContextForImageWithMinimums,
  getContext,
  skippedAndIndicesFromIndexGenerator,
} from "./utilities";

export type StegaCassetteBitDepth = 8 | 16 | 24;
export type StegaCassetteEncoding =
  | "additive"
  | "subtractive"
  | "difference"
  | "noise"
  | "additive-columns"
  | "subtractive-columns"
  | "difference-columns"
  | "noise-columns"
  | "additive-rows"
  | "subtractive-rows"
  | "difference-rows"
  | "noise-rows"
  | "additive-quarters"
  | "subtractive-quarters"
  | "difference-quarters"
  | "noise-quarters";
export type StegaCassetteChannels = 1 | 2;

interface EncodeOptions {
  source:
    | HTMLImageElement
    | HTMLCanvasElement
    | (HTMLImageElement | HTMLCanvasElement)[];
  audioBuffers: Float32Array[];
  sampleRate: number;
  bitDepth: StegaCassetteBitDepth;
  encoding: StegaCassetteEncoding;
  encodeMetadata?: boolean;
  aspectRatio?: number;
  borderWidth?: number;
  music?: { bpm: number; semitones: number };
}

export interface DecodeOptions {
  source:
    | HTMLImageElement
    | HTMLCanvasElement
    | (HTMLImageElement | HTMLCanvasElement)[];
  bitDepth: StegaCassetteBitDepth;
  channels: StegaCassetteChannels;
  encoding: StegaCassetteEncoding;
  borderWidth?: number;
}

export function encode(
  options: EncodeOptions
): HTMLCanvasElement | HTMLCanvasElement[] {
  const {
    source,
    audioBuffers,
    sampleRate,
    bitDepth,
    encoding,
    encodeMetadata,
    aspectRatio,
    borderWidth = 0,
    music,
  } = options;

  if (Array.isArray(source)) {
    const count = source.length;
    const splitBuffers = audioBuffers.map((channel) => {
      const splits = Array.from({ length: count }, () => [] as number[]);
      for (let i = 0; i < channel.length; i++) {
        splits[i % count].push(channel[i]);
      }
      return splits.map((s) => new Float32Array(s));
    });

    const buffersPerImage = Array.from({ length: count }, (_, i) => {
      return audioBuffers.map(
        (_, channelIndex) => splitBuffers[channelIndex][i]
      );
    });

    return buffersPerImage.map((buffers, i) => {
      return encode({
        ...options,
        source: source[i],
        audioBuffers: buffers,
      }) as HTMLCanvasElement;
    });
  }

  const stereo = audioBuffers.length > 1;
  const leftChannel = audioBuffers[0];
  const rightChannel = stereo ? audioBuffers[1] : audioBuffers[0];

  const samples =
    audioBuffers.length * Math.max(...audioBuffers.map((a) => a.length));
  const messageLength = samples * (bitDepth / 8);

  const initialCanvas = createCanvasAndContextForImageWithMinimums({
    source: source as HTMLImageElement | HTMLCanvasElement,
    messageLength,
    minHeight: 0,
    minWidth: 0,
    aspectRatio,
    borderWidth,
  });

  const canvas = encodeMetadata
    ? StegaMetadata.encode({
        source: initialCanvas.canvas,
        metadata: music
          ? {
              type: StegaMetadata.StegaContentType.MUSIC,
              sampleRate,
              bitDepth,
              channels: stereo ? 2 : 1,
              encoding,
              borderWidth,
              bpm: music.bpm,
              semitones: music.semitones,
            }
          : {
              type: StegaMetadata.StegaContentType.AUDIO,
              sampleRate,
              bitDepth,
              channels: stereo ? 2 : 1,
              encoding,
              borderWidth,
            },
      })
    : initialCanvas.canvas;

  const context = getContext(canvas);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  const data = imageData.data;
  let leftAudioIndex = 0;
  let rightAudioIndex = 0;

  const isSpatial =
    encoding.endsWith("-columns") ||
    encoding.endsWith("-rows") ||
    encoding.endsWith("-quarters");
  const increment = bitDepth === 16 ? (isSpatial ? 8 : 16) : 4;

  const midPoint =
    encoding.endsWith("-rows") || encoding.endsWith("-quarters")
      ? Math.floor(data.length / 4)
      : Math.floor(data.length / 2);

  const indexData = encoding.endsWith("-columns")
    ? splitColumnsIndicesFromIndexGenerator(
        canvas.width,
        canvas.height,
        borderWidth,
        bitDepth
      )
    : encoding.endsWith("-rows")
    ? splitRowsIndicesFromIndexGenerator(
        canvas.width,
        canvas.height,
        borderWidth,
        bitDepth
      )
    : encoding.endsWith("-quarters")
    ? splitQuartersIndicesFromIndexGenerator(
        canvas.width,
        canvas.height,
        borderWidth,
        bitDepth
      )
    : skippedAndIndicesFromIndexGenerator(
        canvas.width,
        canvas.height,
        borderWidth
      );
  const encoder = encoding.startsWith("additive")
    ? encodeAdditive
    : encoding.startsWith("subtractive")
    ? encodeSubtractive
    : encoding.startsWith("difference")
    ? encodeDifference
    : encodeNoise;

  for (let i = 0; i < data.length; i += increment) {
    const isBottomHalf = stereo && i >= midPoint;
    const {
      isSkipped,
      encodedIndex,
      encodedIndexNext,
      sourceIndex,
      sourceIndexNext,
    } = indexData(i, data);
    const currentBuffer = isBottomHalf ? rightChannel : leftChannel;
    const currentIndex = isBottomHalf ? rightAudioIndex : leftAudioIndex;

    if (!isSkipped) {
      if (currentIndex >= currentBuffer.length) {
        data[encodedIndex + 3] = 250;
        if (bitDepth === 16) data[encodedIndexNext + 3] = 250;
        continue;
      }

      if (bitDepth === 8) {
        for (let j = 0; j < 3 && currentIndex + j < currentBuffer.length; j++) {
          const sample = currentBuffer[currentIndex + j];
          const value = Math.floor((sample + 1) * 127.5);
          const [valueEncoded, valueSource] = encoder(
            data[encodedIndex + j],
            data[sourceIndex + j],
            value
          );
          data[encodedIndex + j] = valueEncoded;
          data[sourceIndex + j] = valueSource;
        }
        data[encodedIndex + 3] = 255;
        data[sourceIndex + 3] = 255;

        if (isBottomHalf) {
          rightAudioIndex += 3;
        } else {
          leftAudioIndex += 3;
        }
      } else if (bitDepth === 16) {
        const sample1 = currentBuffer[currentIndex] || 0;
        const sample2 = currentBuffer[currentIndex + 1] || 0;
        const sample3 = currentBuffer[currentIndex + 2] || 0;

        const value1 = Math.floor((sample1 + 1) * 32767.5);
        const value2 = Math.floor((sample2 + 1) * 32767.5);
        const value3 = Math.floor((sample3 + 1) * 32767.5);

        /**
         * Four pixels, twelve total channels (6 encode, 6 decode).
         * Sample 1 high in 1R, decoded by 3R
         * Sample 1 low in 1G, decoded by 3G
         * Sample 2 high in 1B, decoded by 3B
         * Sample 2 low in 2R, decoded by 4R
         * Sample 3 high in 2G, decoded by 4G
         * Sample 3 low in 2B, decoded by 4B
         */

        /**
         * Getting the values to set from the encoder
         */
        const [
          [valueEncoded1a, valueSource1a],
          [valueEncoded1b, valueSource1b],
          [valueEncoded2a, valueSource2a],
          [valueEncoded2b, valueSource2b],
          [valueEncoded3a, valueSource3a],
          [valueEncoded3b, valueSource3b],
        ] = [
          encoder(
            data[encodedIndex],
            data[sourceIndex],
            Math.floor(value1 / 256)
          ),
          encoder(data[encodedIndex + 1], data[sourceIndex + 1], value1 % 256),
          encoder(
            data[encodedIndex + 2],
            data[sourceIndex + 2],
            Math.floor(value2 / 256)
          ),
          encoder(data[encodedIndexNext], data[sourceIndexNext], value2 % 256),
          encoder(
            data[encodedIndexNext + 1],
            data[sourceIndexNext + 1],
            Math.floor(value3 / 256)
          ),
          encoder(
            data[encodedIndexNext + 2],
            data[sourceIndexNext + 2],
            value3 % 256
          ),
        ];

        /**
         * Setting the values provided by the encoder
         * For four pixels. Two encoded, Two source.
         * Hardcoding 255 alpha channel.
         * Decoder ignores any transparency.
         */

        // First pixel. Alternating odd and even depending on row.
        data[encodedIndex] = valueEncoded1a;
        data[sourceIndex] = valueSource1a;
        data[encodedIndex + 1] = valueEncoded1b;
        data[sourceIndex + 1] = valueSource1b;
        data[encodedIndex + 2] = valueEncoded2a;
        data[sourceIndex + 2] = valueSource2a;
        data[encodedIndex + 3] = 255;
        data[sourceIndex + 3] = 255;

        // Next pixel. Alternating odd and even depending on row.
        data[encodedIndexNext] = valueEncoded2b;
        data[sourceIndexNext] = valueSource2b;
        data[encodedIndexNext + 1] = valueEncoded3a;
        data[sourceIndexNext + 1] = valueSource3a;
        data[encodedIndexNext + 2] = valueEncoded3b;
        data[sourceIndexNext + 2] = valueSource3b;
        data[encodedIndexNext + 3] = 255;
        data[sourceIndexNext + 3] = 255;

        if (isBottomHalf) {
          rightAudioIndex += 3; // Processed 3 samples
        } else {
          leftAudioIndex += 3; // Processed 3 samples
        }
      } else if (bitDepth === 24) {
        const sample = currentBuffer[currentIndex];
        const value = Math.floor((sample + 1) * 8388607.5);

        /**
         * Two pixels, six total channels (3 encode, 3 decode).
         * Sample 1 high in 1R, decoded by 2R
         * Sample 1 mid in 1G, decoded by 2G
         * Sample 1 low in 1B, decoded by 2B
         */

        /**
         * Getting the values to set from the encoder
         */

        const [
          [valueEncoded1a, valueSource1a],
          [valueEncoded1b, valueSource1b],
          [valueEncoded1c, valueSource1c],
        ] = [
          encoder(data[encodedIndex], data[sourceIndex], (value >> 16) & 0xff),
          encoder(
            data[encodedIndex + 1],
            data[sourceIndex + 1],
            (value >> 8) & 0xff
          ),
          encoder(data[encodedIndex + 2], data[sourceIndex + 2], value & 0xff),
        ];

        /**
         * Setting the value provided by the encoder
         * For two pixels. One encoded, One source.
         * Hardcoding 255 alpha channel.
         * Decoder ignores any transparency.
         */

        data[encodedIndex] = valueEncoded1a;
        data[sourceIndex] = valueSource1a;
        data[encodedIndex + 1] = valueEncoded1b;
        data[sourceIndex + 1] = valueSource1b;
        data[encodedIndex + 2] = valueEncoded1c;
        data[sourceIndex + 2] = valueSource1c;
        data[encodedIndex + 3] = 255;
        data[sourceIndex + 3] = 255;

        if (isBottomHalf) {
          rightAudioIndex++;
        } else {
          leftAudioIndex++;
        }
      }
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

export function decode(options: DecodeOptions): Float32Array[] {
  const { source, encoding, bitDepth, channels = 1, borderWidth = 0 } = options;

  if (Array.isArray(source)) {
    const decodedBuffers = source.map((s) => decode({ ...options, source: s }));

    const combinedChannels: Float32Array[] = [];
    const channelCount = decodedBuffers[0].length;
    const count = source.length;

    for (let c = 0; c < channelCount; c++) {
      const channelParts = decodedBuffers.map((d) => d[c]);
      const totalLength = channelParts.reduce(
        (acc, part) => acc + part.length,
        0
      );
      const result = new Float32Array(totalLength);

      for (let i = 0; i < count; i++) {
        const part = channelParts[i];
        for (let j = 0; j < part.length; j++) {
          const targetIndex = j * count + i;
          if (targetIndex < totalLength) {
            result[targetIndex] = part[j];
          }
        }
      }
      combinedChannels.push(result);
    }
    return combinedChannels;
  }

  const singleSource = source as HTMLImageElement | HTMLCanvasElement;
  const relativeWidth =
    "naturalWidth" in singleSource
      ? singleSource.naturalWidth
      : singleSource.width;
  const relativeHeight =
    "naturalHeight" in singleSource
      ? singleSource.naturalHeight
      : singleSource.height;

  const { canvas, context } = createCanvasAndContext(
    relativeWidth,
    relativeHeight
  );
  context.drawImage(singleSource, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  const stereo = channels === 2;

  const data = imageData.data;
  const leftSamples: number[] = [];
  const rightSamples: number[] = [];

  const indexData = encoding.endsWith("-columns")
    ? splitColumnsIndicesFromIndexGenerator(
        canvas.width,
        canvas.height,
        borderWidth,
        bitDepth
      )
    : encoding.endsWith("-rows")
    ? splitRowsIndicesFromIndexGenerator(
        canvas.width,
        canvas.height,
        borderWidth,
        bitDepth
      )
    : encoding.endsWith("-quarters")
    ? splitQuartersIndicesFromIndexGenerator(
        canvas.width,
        canvas.height,
        borderWidth,
        bitDepth
      )
    : skippedAndIndicesFromIndexGenerator(
        canvas.width,
        canvas.height,
        borderWidth
      );
  const decoder = encoding.startsWith("additive")
    ? decodeAdditive
    : encoding.startsWith("subtractive")
    ? decodeSubtractive
    : encoding.startsWith("difference")
    ? decodeDifference
    : decodeNoise;

  const isSpatial =
    encoding.endsWith("-columns") ||
    encoding.endsWith("-rows") ||
    encoding.endsWith("-quarters");
  const increment = bitDepth === 16 ? (isSpatial ? 8 : 16) : 4;

  const midPoint =
    encoding.endsWith("-rows") || encoding.endsWith("-quarters")
      ? Math.floor(data.length / 4)
      : Math.floor(data.length / 2);

  for (let i = 0; i < data.length; i += increment) {
    const isBottomHalf = stereo && i >= midPoint;
    const {
      isSkipped,
      encodedIndex,
      encodedIndexNext,
      sourceIndex,
      sourceIndexNext,
    } = indexData(i, data);
    const currentSamples = isBottomHalf ? rightSamples : leftSamples;

    if (!isSkipped && data[encodedIndex + 3] === 255) {
      if (bitDepth === 8) {
        for (let j = 0; j < 3; j++) {
          const value = decoder(data[encodedIndex + j], data[sourceIndex + j]);
          const sample = value / 127.5 - 1;
          if (sample !== 0) {
            currentSamples.push(sample);
          }
        }
      } else if (bitDepth === 16) {
        /**
         * Decoding three values from four pixels.
         */
        const samples = [
          decoder(data[encodedIndex], data[sourceIndex]) * 256 +
            decoder(data[encodedIndex + 1], data[sourceIndex + 1]),
          decoder(data[encodedIndex + 2], data[sourceIndex + 2]) * 256 +
            decoder(data[encodedIndexNext], data[sourceIndexNext]),
          decoder(data[encodedIndexNext + 1], data[sourceIndexNext + 1]) * 256 +
            decoder(data[encodedIndexNext + 2], data[sourceIndexNext + 2]),
        ].map((value) => value / 32767.5 - 1);

        currentSamples.push(...samples);
      } else if (bitDepth === 24) {
        /**
         * Decoding one sample from two pixels.
         */
        const value =
          (decoder(data[encodedIndex], data[sourceIndex]) << 16) |
          (decoder(data[encodedIndex + 1], data[sourceIndex + 1]) << 8) |
          decoder(data[encodedIndex + 2], data[sourceIndex + 2]);
        const sample = value / 8388607.5 - 1;

        currentSamples.push(sample);
      }
    }
  }

  return stereo
    ? [new Float32Array(leftSamples), new Float32Array(rightSamples)]
    : [new Float32Array(leftSamples)];
}

function encodeAdditive(
  _byteEncode: number,
  byteSource: number,
  value: number
): [number, number] {
  return [(byteSource + value) % 256, byteSource];
}

function decodeAdditive(byteEncode: number, byteSource: number): number {
  if (byteEncode < byteSource) {
    return byteEncode + 256 - byteSource;
  }
  return byteEncode - byteSource;
}

function encodeSubtractive(
  _byteEncode: number,
  byteSource: number,
  value: number
): [number, number] {
  return [(byteSource - value + 256) % 256, byteSource];
}

function decodeSubtractive(byteEncode: number, byteSource: number): number {
  if (byteSource < byteEncode) {
    return byteSource + 256 - byteEncode;
  }
  return byteSource - byteEncode;
}

/**
 * Using existing values to travel the least distance,
 * return values for each byte where the mid point is the value 0-255.
 */
function encodeDifference(
  byteEncode: number,
  byteSource: number,
  value: number
): [number, number] {
  if (byteSource < byteEncode) {
    byteSource += 256;
  }
  const middle = Math.round((byteSource - byteEncode) / 2 + byteEncode);
  const distanceA = Math.ceil(value / 2);
  const distanceB = Math.floor(value / 2);

  return [(middle - distanceA + 256) % 256, (middle + distanceB) % 256];
}

function decodeDifference(byteEncode: number, byteSource: number): number {
  if (byteSource < byteEncode) {
    return byteSource + 256 - byteEncode;
  }
  return byteSource - byteEncode;
}

/**
 * Using source image as input for noise generation
 */
function encodeNoise(
  byteEncode: number,
  byteSource: number,
  value: number
): [number, number] {
  const space = Math.abs(byteEncode - byteSource);
  const maxSpace = 2 * Math.min(value, 255 - value);
  const usedSpace = Math.min(space, maxSpace);
  const stepA = Math.ceil(usedSpace * 0.5);
  const stepB = Math.floor(usedSpace * 0.5);
  return [(value - stepA + 256) % 256, (value + stepB) % 256];
}

function decodeNoise(byteEncode: number, byteSource: number): number {
  return Math.round(
    Math.abs(byteEncode - byteSource) / 2 + Math.min(byteEncode, byteSource)
  );
}

function splitColumnsIndicesFromIndexGenerator(
  width: number,
  height: number,
  borderWidth: number,
  bitDepth: number
) {
  const midX = width / 2;
  // Valid left range: [borderWidth, midX - borderWidth/2)
  const leftEnd = Math.ceil(midX - borderWidth / 2);

  return (i: number, data: Uint8ClampedArray) => {
    const pxIndex = Math.floor(i / 4);
    const y = Math.floor(pxIndex / width);
    const x = pxIndex % width;

    const isBorder =
      y < borderWidth ||
      y >= height - borderWidth ||
      x < borderWidth ||
      x >= width - borderWidth; // Right border check

    // Check if x is in left valid region
    // For 16-bit, we need x+1 to be valid and not overlap with pairX
    // pairX = width - 1 - x
    // We need x + 1 < pairX => x + 1 < width - 1 - x => 2x < width - 2 => x < width/2 - 1
    const effectiveLeftEnd =
      bitDepth === 16 ? Math.min(leftEnd, Math.floor(width / 2) - 1) : leftEnd;
    const isLeft = x < effectiveLeftEnd;

    const pairX = width - 1 - x;

    // Indices
    const index1 = i;
    const index2 = (y * width + pairX) * 4;

    // Next indices (for 16-bit)
    // We use x+1 and pairX-1
    const index1Next = i + 4;
    const index2Next = (y * width + (pairX - 1)) * 4;

    // Alternate based on x to checker
    // For 16-bit, we step 2 pixels at a time, so x parity doesn't change within a row (for even widths).
    // We use x/2 to get the step index.
    const effectiveX = bitDepth === 16 ? x / 2 : x;
    const swap = (Math.floor(effectiveX) + y) % 2 !== 0;

    const encodedIndex = swap ? index2 : index1;
    const sourceIndex = swap ? index1 : index2;

    const encodedIndexNext = swap ? index2Next : index1Next;
    const sourceIndexNext = swap ? index1Next : index2Next;

    const isSkipped = isBorder || !isLeft;
    const isOpaque1 = data[index1 + 3] === 255;
    const isOpaque2 = data[index2 + 3] === 255;

    return {
      isSkipped: isSkipped || !isOpaque1 || !isOpaque2,
      encodedIndex,
      sourceIndex,
      encodedIndexNext,
      sourceIndexNext,
    };
  };
}

function splitRowsIndicesFromIndexGenerator(
  width: number,
  height: number,
  borderWidth: number,
  bitDepth: number
) {
  const midY = height / 2;
  // Valid top range: [borderWidth, midY - borderWidth/2)
  const topEnd = Math.ceil(midY - borderWidth / 2);

  return (i: number, data: Uint8ClampedArray) => {
    const pxIndex = Math.floor(i / 4);
    const y = Math.floor(pxIndex / width);
    const x = pxIndex % width;

    const isBorder =
      y < borderWidth ||
      y >= height - borderWidth ||
      x < borderWidth ||
      x >= width - borderWidth;

    // Check if y is in top valid region
    const isTop = y < topEnd;

    const pairY = height - 1 - y;

    // Indices
    const index1 = i;
    const index2 = (pairY * width + x) * 4;

    // Next indices (for 16-bit)
    const nextI = i + 4;
    const pxIndexNext = Math.floor(nextI / 4);
    const yNext = Math.floor(pxIndexNext / width);
    const xNext = pxIndexNext % width;
    const pairYNext = height - 1 - yNext;
    const index2Next = (pairYNext * width + xNext) * 4;

    // Alternate based on x to checker
    // For 16-bit, we step 2 pixels at a time, so x parity doesn't change within a row (for even widths).
    // We use x/2 to get the step index.
    const effectiveX = bitDepth === 16 ? x / 2 : x;
    const swap = (Math.floor(effectiveX) + y) % 2 !== 0;

    const encodedIndex = swap ? index2 : index1;
    const sourceIndex = swap ? index1 : index2;

    const encodedIndexNext = swap ? index2Next : nextI;
    const sourceIndexNext = swap ? nextI : index2Next;

    const isSkipped = isBorder || !isTop;
    const isOpaque1 = data[index1 + 3] === 255;
    const isOpaque2 = data[index2 + 3] === 255;

    return {
      isSkipped: isSkipped || !isOpaque1 || !isOpaque2,
      encodedIndex,
      sourceIndex,
      encodedIndexNext,
      sourceIndexNext,
    };
  };
}

function splitQuartersIndicesFromIndexGenerator(
  width: number,
  height: number,
  borderWidth: number,
  bitDepth: number
) {
  const midY = height / 2;
  // Valid top range: [borderWidth, midY - borderWidth/2)
  const topEnd = Math.ceil(midY - borderWidth / 2);

  return (i: number, data: Uint8ClampedArray) => {
    const pxIndex = Math.floor(i / 4);
    const y = Math.floor(pxIndex / width);
    const x = pxIndex % width;

    const isBorder =
      y < borderWidth ||
      y >= height - borderWidth ||
      x < borderWidth ||
      x >= width - borderWidth ||
      // Vertical gap (horizontal line)
      (y >= midY - borderWidth / 2 && y < midY + borderWidth / 2) ||
      // Horizontal gap (vertical line)
      (x >= width / 2 - borderWidth / 2 && x < width / 2 + borderWidth / 2);

    // Check if y is in top valid region
    const isTop = y < topEnd;

    const pairX = width - 1 - x;
    const pairY = height - 1 - y;

    // Indices
    const index1 = i;
    const index2 = (pairY * width + pairX) * 4;

    // Next indices (for 16-bit)
    const nextI = i + 4;
    const pxIndexNext = Math.floor(nextI / 4);
    const yNext = Math.floor(pxIndexNext / width);
    const xNext = pxIndexNext % width;
    const pairXNext = width - 1 - xNext;
    const pairYNext = height - 1 - yNext;
    const index2Next = (pairYNext * width + pairXNext) * 4;

    // Alternate based on x to checker
    // For 16-bit, we step 2 pixels at a time, so x parity doesn't change within a row (for even widths).
    // We use x/2 to get the step index.
    const effectiveX = bitDepth === 16 ? x / 2 : x;
    const swap = (Math.floor(effectiveX) + y) % 2 !== 0;

    const encodedIndex = swap ? index2 : index1;
    const sourceIndex = swap ? index1 : index2;

    const encodedIndexNext = swap ? index2Next : nextI;
    const sourceIndexNext = swap ? nextI : index2Next;

    const isSkipped = isBorder || !isTop;
    const isOpaque1 = data[index1 + 3] === 255;
    const isOpaque2 = data[index2 + 3] === 255;

    return {
      isSkipped: isSkipped || !isOpaque1 || !isOpaque2,
      encodedIndex,
      sourceIndex,
      encodedIndexNext,
      sourceIndexNext,
    };
  };
}
