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
  | "noise";
export type StegaCassetteChannels = 1 | 2;

interface EncodeOptions {
  source: HTMLImageElement;
  audioBuffers: Float32Array[];
  sampleRate: number;
  bitDepth: StegaCassetteBitDepth;
  encoding: StegaCassetteEncoding;
  encodeMetadata?: boolean;
  aspectRatio?: number;
  borderWidth?: number;
}

export interface DecodeOptions {
  source: HTMLImageElement | HTMLCanvasElement;
  bitDepth: StegaCassetteBitDepth;
  channels: StegaCassetteChannels;
  encoding: StegaCassetteEncoding;
  borderWidth?: number;
}

export function encode({
  source,
  audioBuffers,
  sampleRate,
  bitDepth,
  encoding,
  encodeMetadata,
  aspectRatio,
  borderWidth = 0,
}: EncodeOptions) {
  const stereo = audioBuffers.length > 1;
  const leftChannel = audioBuffers[0];
  const rightChannel = stereo ? audioBuffers[1] : audioBuffers[0];

  const samples =
    audioBuffers.length * Math.max(...audioBuffers.map((a) => a.length));
  const messageLength = samples * (bitDepth / 8);

  const initialCanvas = createCanvasAndContextForImageWithMinimums({
    source,
    messageLength,
    minHeight: 0,
    minWidth: 0,
    aspectRatio,
    borderWidth,
  });

  const canvas = encodeMetadata
    ? StegaMetadata.encode({
        source: initialCanvas.canvas,
        metadata: {
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

  const midPoint = stereo
    ? Math.floor(canvas.height / 2) * canvas.width * 4
    : data.length;

  const indexData = skippedAndIndicesFromIndexGenerator(
    canvas.width,
    canvas.height,
    borderWidth
  );
  const encoder =
    encoding === "additive"
      ? encodeAdditive
      : encoding === "subtractive"
      ? encodeSubtractive
      : encoding === "difference"
      ? encodeDifference
      : encodeNoise;

  const increment = bitDepth === 16 ? 16 : 4;

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

export function decode({
  source,
  encoding,
  bitDepth,
  channels = 1,
  borderWidth = 0,
}: DecodeOptions) {
  const relativeWidth =
    "naturalWidth" in source ? source.naturalWidth : source.width;
  const relativeHeight =
    "naturalHeight" in source ? source.naturalHeight : source.height;

  const { canvas, context } = createCanvasAndContext(
    relativeWidth,
    relativeHeight
  );
  context.drawImage(source, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  const stereo = channels === 2;

  const data = imageData.data;
  const leftSamples: number[] = [];
  const rightSamples: number[] = [];

  const midPoint = stereo
    ? Math.floor(canvas.height / 2) * canvas.width * 4
    : data.length;
  const indexData = skippedAndIndicesFromIndexGenerator(
    canvas.width,
    canvas.height,
    borderWidth
  );
  const decoder =
    encoding === "additive"
      ? decodeAdditive
      : encoding === "subtractive"
      ? decodeSubtractive
      : encoding === "difference"
      ? decodeDifference
      : decodeNoise;

  let leftSampleIndex = 0;
  let rightSampleIndex = 0;

  const increment = bitDepth === 16 ? 16 : 4;

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
          if (sample !== 0) currentSamples.push(sample);
        }
        if (isBottomHalf) {
          rightSampleIndex += 3;
        } else {
          leftSampleIndex += 3;
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

        if (isBottomHalf) {
          rightSampleIndex += 3;
        } else {
          leftSampleIndex += 3;
        }
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

        if (isBottomHalf) {
          rightSampleIndex++;
        } else {
          leftSampleIndex++;
        }
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
  if (byteEncode < byteSource) {
    return byteEncode + 256 - byteSource;
  }
  return byteEncode - byteSource;
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
  const stepA = Math.ceil(space * 0.5);
  const stepB = Math.floor(space * 0.5);
  return [(value - stepA + 256) % 256, (value + stepB) % 256];
}

function decodeNoise(byteEncode: number, byteSource: number): number {
  return Math.round(
    Math.abs(byteEncode - byteSource) / 2 + Math.min(byteEncode, byteSource)
  );
}
