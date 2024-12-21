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
    sampleRate,
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

  // Helper function to encode a sample using midpoint encoding
  function encodeMidpoint(
    baseValue: number,
    sample: number,
    maxValue: number
  ): number {
    // Convert sample from [-1, 1] to [0, 1]
    const normalizedSample = (sample + 1) / 2;
    // Calculate target midpoint value
    const targetMidpoint = normalizedSample * maxValue;
    // Calculate new value that creates the desired midpoint with the base value
    return Math.min(
      Math.max(0, Math.round(2 * targetMidpoint - baseValue)),
      255
    );
  }

  for (let i = 0; i < data.length; i += 8) {
    // Process pairs of pixels
    const isBottomHalf = stereo && i >= midPoint;
    const { isSkipped, encodedIndex } = indexData(i, data);
    const currentBuffer = isBottomHalf ? rightChannel : leftChannel;
    const currentIndex = isBottomHalf ? rightAudioIndex : leftAudioIndex;

    if (!isSkipped && encodedIndex + 7 < data.length) {
      if (currentIndex >= currentBuffer.length) {
        data[encodedIndex + 3] = 250;
        continue;
      }

      if (bitDepth === 8) {
        for (let j = 0; j < 3 && currentIndex + j < currentBuffer.length; j++) {
          const sample = currentBuffer[currentIndex + j];
          const baseValue = data[encodedIndex + j];
          data[encodedIndex + j + 4] = encodeMidpoint(baseValue, sample, 255);
        }
        if (isBottomHalf) {
          rightAudioIndex += 3;
        } else {
          leftAudioIndex += 3;
        }
      } else if (bitDepth === 16) {
        if (currentIndex < currentBuffer.length) {
          const sample = currentBuffer[currentIndex];
          const cyclePosition = Math.floor(currentIndex / 3) % 3;

          // Encode 16-bit value using two color components
          const baseValue1 = data[encodedIndex + (cyclePosition % 3)];
          const baseValue2 = data[encodedIndex + ((cyclePosition + 1) % 3)];

          data[encodedIndex + 4 + (cyclePosition % 3)] = encodeMidpoint(
            baseValue1,
            sample,
            255
          );
          data[encodedIndex + 4 + ((cyclePosition + 1) % 3)] = encodeMidpoint(
            baseValue2,
            sample,
            255
          );
        }
        if (isBottomHalf) {
          rightAudioIndex++;
        } else {
          leftAudioIndex++;
        }
      } else if (bitDepth === 24) {
        if (currentIndex < currentBuffer.length) {
          const sample = currentBuffer[currentIndex];
          // Encode using all three color components
          for (let j = 0; j < 3; j++) {
            const baseValue = data[encodedIndex + j];
            data[encodedIndex + j + 4] = encodeMidpoint(baseValue, sample, 255);
          }
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
  const metadata = decodeMetadata(imageData);

  if (metadata.type !== StegaContentType.AUDIO) {
    throw new Error("Invalid image type - expected audio encoding");
  }

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

  // Helper function to decode a sample using midpoint values
  function decodeMidpoint(
    value1: number,
    value2: number,
    maxValue: number
  ): number {
    // Calculate midpoint between the two values
    const midpoint = (value1 + value2) / 2;
    // Convert from [0, maxValue] to [-1, 1]
    return 2 * (midpoint / maxValue) - 1;
  }

  let leftSampleIndex = 0;
  let rightSampleIndex = 0;

  for (let i = 0; i < data.length; i += 8) {
    // Process pairs of pixels
    const isBottomHalf = stereo && i >= midPoint;
    const { isSkipped, encodedIndex } = indexData(i, data);
    const currentSamples = isBottomHalf ? rightSamples : leftSamples;
    const currentIndex = isBottomHalf ? rightSampleIndex : leftSampleIndex;

    if (
      !isSkipped &&
      encodedIndex + 7 < data.length &&
      data[encodedIndex + 3] === 255
    ) {
      if (bitDepth === 8) {
        for (let j = 0; j < 3; j++) {
          const sample = decodeMidpoint(
            data[encodedIndex + j],
            data[encodedIndex + j + 4],
            255
          );
          if (sample !== 0) currentSamples.push(sample);
        }
        if (isBottomHalf) {
          rightSampleIndex += 3;
        } else {
          leftSampleIndex += 3;
        }
      } else if (bitDepth === 16) {
        const cyclePosition = Math.floor(currentIndex / 3) % 3;

        const sample = decodeMidpoint(
          data[encodedIndex + (cyclePosition % 3)],
          data[encodedIndex + 4 + (cyclePosition % 3)],
          255
        );

        if (sample !== 0) currentSamples.push(sample);
        if (isBottomHalf) {
          rightSampleIndex++;
        } else {
          leftSampleIndex++;
        }
      } else if (bitDepth === 24) {
        const samples: number[] = [];
        for (let j = 0; j < 3; j++) {
          samples.push(
            decodeMidpoint(
              data[encodedIndex + j],
              data[encodedIndex + j + 4],
              255
            )
          );
        }
        const sample = samples.reduce((a, b) => a + b) / 3;
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
