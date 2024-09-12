import {
  createCanvasAndContext,
  createCanvasAndContextForImageWithMinimums,
  skippedAndIndicesFromIndexGenerator,
} from "./utilities";

export function encode({
  source,
  audioBuffer,
}: {
  source: HTMLImageElement;
  audioBuffer: Float32Array;
}) {
  const { canvas, context } = createCanvasAndContextForImageWithMinimums({
    source,
    messageLength: audioBuffer.length,
    minHeight: 0,
    minWidth: 0,
  });

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let audioIndex = 0;

  const indexData = skippedAndIndicesFromIndexGenerator(canvas.width);

  for (let i = 0; i < data.length; i++) {
    const { isSkipped, encodedIndex, sourceIndex } = indexData(i, data);
    if (!isSkipped && audioIndex < audioBuffer.length) {
      data[encodedIndex] = encodeFloatTo8Bit(
        data[sourceIndex],
        audioBuffer[audioIndex]
      );
      audioIndex++;
    }
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

export function decode({ source }: { source: HTMLImageElement }) {
  const { canvas, context } = createCanvasAndContext(
    source.naturalWidth,
    source.naturalHeight
  );
  context.drawImage(source, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const audioSamples: number[] = [];
  const indexData = skippedAndIndicesFromIndexGenerator(canvas.width);

  for (let i = 0; i < data.length; i++) {
    const { isSkipped, encodedIndex, sourceIndex } = indexData(i, data);
    if (!isSkipped) {
      const sample = decodeBitToFloat(data[sourceIndex], data[encodedIndex]);
      if (sample !== 0) audioSamples.push(sample);
    }
  }

  return new Float32Array(audioSamples);
}

function decodeBitToFloat(keyValue: number, bitValue: number) {
  const factor = 1; // could maybe do subtract or add conditionally
  const difference = (bitValue - keyValue * factor + 256) % 256;
  if (difference % 2 === 0) {
    return difference / 255;
  } else {
    return (difference / 255) * -1;
  }

  // return (((bitValue - keyValue + 256) % 256) / 255) * 2 - 1;
}

function encodeFloatTo8Bit(keyValue: number, sample: number) {
  const factor = 1; // could maybe do subtract or add conditionally
  const even = Math.floor((Math.abs(sample) * 255) / 2) * 2;
  if (sample > 0) {
    return (keyValue + even * factor + 256) % 256;
  } else {
    return (keyValue + even * factor + 256 + 1) % 256;
  }

  // return (keyValue + Math.floor(((sample + 1) / 2) * 255)) % 256;
}
