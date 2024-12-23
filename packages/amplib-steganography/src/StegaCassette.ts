import * as StegaMetadata from "./StegaMetadata";
import {
  createCanvasAndContext,
  createCanvasAndContextForImageWithMinimums,
  skippedAndIndicesFromIndexGenerator,
} from "./utilities";

export type StegaCassetteBitDepth = 8 | 16 | 24;
export type StegaCassetteEncoding = "additive" | "midpoint";
export type StegaCassetteChannels = 1 | 2;

interface EncodeOptions {
  source: HTMLImageElement;
  audioBuffers: Float32Array[];
  sampleRate: number;
  bitDepth: StegaCassetteBitDepth;
  encoding: StegaCassetteEncoding;
  encodeMetadata?: boolean;
  aspectRatio?: number;
}

export interface DecodeOptions {
  source: HTMLImageElement | HTMLCanvasElement;
  bitDepth: StegaCassetteBitDepth;
  channels: StegaCassetteChannels;
  encoding: StegaCassetteEncoding;
}

export function encode({
  source,
  audioBuffers,
  sampleRate,
  bitDepth,
  encoding,
  encodeMetadata,
  aspectRatio,
}: EncodeOptions) {
  const stereo = audioBuffers.length > 1;
  const leftChannel = audioBuffers[0];
  const rightChannel = stereo ? audioBuffers[1] : audioBuffers[0];

  const messageLength =
    (stereo ? 2 : 1) *
    (stereo
      ? Math.max(...audioBuffers.map((a) => a.length))
      : leftChannel.length) *
    (bitDepth / 8);

  const initialCanvas = createCanvasAndContextForImageWithMinimums({
    source,
    messageLength,
    minHeight: 0,
    minWidth: 0,
    aspectRatio,
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
        },
      })
    : initialCanvas.canvas;

  const context = canvas.getContext("2d")!;

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  const data = imageData.data;
  let leftAudioIndex = 0;
  let rightAudioIndex = 0;

  const midPoint = stereo
    ? Math.floor(canvas.height / 2) * canvas.width * 4
    : data.length;

  const indexData = skippedAndIndicesFromIndexGenerator(canvas.width);

  for (let i = 0; i < data.length; i += 4) {
    const isBottomHalf = stereo && i >= midPoint;
    const { isSkipped, encodedIndex } = indexData(i, data);
    const currentBuffer = isBottomHalf ? rightChannel : leftChannel;
    const currentIndex = isBottomHalf ? rightAudioIndex : leftAudioIndex;

    if (!isSkipped) {
      if (currentIndex >= currentBuffer.length) {
        data[encodedIndex + 3] = 250;
        continue;
      }

      if (bitDepth === 8) {
        for (let j = 0; j < 3 && currentIndex + j < currentBuffer.length; j++) {
          const sample = currentBuffer[currentIndex + j];
          const value = Math.floor((sample + 1) * 127.5);
          data[encodedIndex + j] = value;
        }
        if (isBottomHalf) {
          rightAudioIndex += 3;
        } else {
          leftAudioIndex += 3;
        }
      } else if (bitDepth === 16) {
        if (currentIndex < currentBuffer.length) {
          const cyclePosition = Math.floor(currentIndex / 3) % 3;
          const sample = currentBuffer[currentIndex];
          const value = Math.floor((sample + 1) * 32767.5);

          if (cyclePosition === 0) {
            data[encodedIndex] = Math.floor(value / 255);
            data[encodedIndex + 1] = value % 255;
          } else if (cyclePosition === 1) {
            data[encodedIndex + 2] = Math.floor(value / 255);
            data[encodedIndex] = value % 255;
          } else {
            data[encodedIndex + 1] = Math.floor(value / 255);
            data[encodedIndex + 2] = value % 255;
          }
        }
        if (isBottomHalf) {
          rightAudioIndex++;
        } else {
          leftAudioIndex++;
        }
      } else if (bitDepth === 24) {
        if (currentIndex < currentBuffer.length) {
          const sample = currentBuffer[currentIndex];
          const value = Math.floor((sample + 1) * 8388607.5);
          data[encodedIndex] = (value >> 16) & 0xff;
          data[encodedIndex + 1] = (value >> 8) & 0xff;
          data[encodedIndex + 2] = value & 0xff;
          if (isBottomHalf) {
            rightAudioIndex++;
          } else {
            leftAudioIndex++;
          }
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
  const indexData = skippedAndIndicesFromIndexGenerator(canvas.width);

  let leftSampleIndex = 0;
  let rightSampleIndex = 0;

  for (let i = 0; i < data.length; i += 4) {
    const isBottomHalf = stereo && i >= midPoint;
    const { isSkipped, encodedIndex } = isBottomHalf
      ? indexData(i - midPoint, data)
      : indexData(i, data);
    const currentSamples = isBottomHalf ? rightSamples : leftSamples;
    const currentIndex = isBottomHalf ? rightSampleIndex : leftSampleIndex;

    if (!isSkipped && data[encodedIndex + 3] === 255) {
      if (bitDepth === 8) {
        for (let j = 0; j < 3; j++) {
          const sample = data[encodedIndex + j] / 127.5 - 1;
          if (sample !== 0) currentSamples.push(sample);
        }
        if (isBottomHalf) {
          rightSampleIndex += 3;
        } else {
          leftSampleIndex += 3;
        }
      } else if (bitDepth === 16) {
        const cyclePosition = Math.floor(currentIndex / 3) % 3;
        let sample;

        if (cyclePosition === 0) {
          const value = data[encodedIndex] * 255 + data[encodedIndex + 1];
          sample = value / 32767.5 - 1;
        } else if (cyclePosition === 1) {
          const value = data[encodedIndex + 2] * 255 + data[encodedIndex];
          sample = value / 32767.5 - 1;
        } else {
          const value = data[encodedIndex + 1] * 255 + data[encodedIndex + 2];
          sample = value / 32767.5 - 1;
        }

        if (sample !== 0) currentSamples.push(sample);
        if (isBottomHalf) {
          rightSampleIndex++;
        } else {
          leftSampleIndex++;
        }
      } else if (bitDepth === 24) {
        const value =
          (data[encodedIndex] << 16) |
          (data[encodedIndex + 1] << 8) |
          data[encodedIndex + 2];
        const sample = value / 8388607.5 - 1;

        if (sample !== 0) currentSamples.push(sample);
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
