import {
  decodeMetadata,
  encodeMetadata,
  StegaContentType,
  StegaMetadataAudio,
} from "./StegaMetadata";
import {
  createCanvasAndContext,
  createCanvasAndContextForImageWithMinimums,
  skippedAndIndicesFromIndexGenerator,
} from "./utilities";

type BitDepth = 8 | 16 | 24;
const defaultBitDepth: BitDepth = 8;

interface EncodeOptions {
  source: HTMLImageElement;
  audioBuffers: Float32Array[];
  sampleRate: number;
  bitDepth?: BitDepth;
  aspectRatio?: number;
}

interface DecodeOptions {
  source: HTMLImageElement | HTMLCanvasElement;
}

export function encode({
  source,
  audioBuffers,
  aspectRatio,
  sampleRate,
  bitDepth = defaultBitDepth,
}: EncodeOptions) {
  const stereo = audioBuffers.length > 1;
  const leftChannel = audioBuffers[0];
  const rightChannel = stereo ? audioBuffers[1] : audioBuffers[0];

  // For stereo, we need twice the space as we're encoding two channels
  const messageLength =
    (stereo ? 2 : 1) *
    (stereo
      ? Math.max(...audioBuffers.map((a) => a.length))
      : leftChannel.length) *
    (bitDepth / 8);

  const { canvas, context } = createCanvasAndContextForImageWithMinimums({
    source,
    messageLength,
    minHeight: 0,
    minWidth: 0,
    aspectRatio,
  });

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  // Add metadata before encoding audio
  const metadata: StegaMetadataAudio = {
    type: StegaContentType.AUDIO,
    sampleRate, // We'll need to add audioContext to EncodeOptions
    bitDepth,
    channels: stereo ? 2 : 1,
  };

  // Encode metadata into the image
  encodeMetadata(imageData, metadata);

  const data = imageData.data;
  let leftAudioIndex = 0;
  let rightAudioIndex = 0;

  // Calculate the row where we switch from left to right channel
  const midPoint = stereo
    ? Math.floor(canvas.height / 2) * canvas.width * 4
    : data.length;

  const indexData = skippedAndIndicesFromIndexGenerator(
    canvas.width,
    canvas.height
  );

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

export function decode({ source }: DecodeOptions) {
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

  // Decode metadata first
  const metadata = decodeMetadata(imageData);

  console.log(metadata);

  if (metadata.type !== StegaContentType.AUDIO) {
    throw new Error("Invalid image type - expected audio encoding");
  }

  // Use metadata values instead of parameters
  const bitDepth = metadata.bitDepth || defaultBitDepth;
  const stereo = metadata.channels === 2 || false;

  const data = imageData.data;
  const leftSamples: number[] = [];
  const rightSamples: number[] = [];

  const midPoint = stereo
    ? Math.floor(canvas.height / 2) * canvas.width * 4
    : data.length;
  const indexData = skippedAndIndicesFromIndexGenerator(
    canvas.width,
    canvas.height
  );
  const bottomIndexData = skippedAndIndicesFromIndexGenerator(
    canvas.width,
    canvas.height
  );

  let leftSampleIndex = 0;
  let rightSampleIndex = 0;

  for (let i = 0; i < data.length; i += 4) {
    const isBottomHalf = stereo && i >= midPoint;
    const { isSkipped, encodedIndex } = isBottomHalf
      ? bottomIndexData(i - midPoint, data)
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
