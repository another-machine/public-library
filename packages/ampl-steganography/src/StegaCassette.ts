interface StegaCassetteParams {
  audioContext: AudioContext;
  sampleRate: number;
}
export class StegaCassette {
  audioContext: AudioContext;
  sampleRate: number;

  constructor({ audioContext, sampleRate }: StegaCassetteParams) {
    this.audioContext = audioContext;
    this.sampleRate = sampleRate;
  }

  async loadAudioBufferFromAudioUrl(url: string) {
    const response = await fetch(url);
    const audioData = await response.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(audioData);
    // Resample the audio to sample rate
    const resampledBuffer = await this.resampleAudioBuffer(audioBuffer);

    // console.log(`Original audio duration: ${audioBuffer.duration} seconds`);
    // console.log(`Original sample rate: ${audioBuffer.sampleRate} Hz`);
    // console.log(`Resampled audio duration: ${resampledBuffer.duration} seconds`);
    // console.log(`Resampled sample rate: ${resampledBuffer.sampleRate} Hz`);

    return resampledBuffer.getChannelData(0);
  }

  async resampleAudioBuffer(audioBuffer: AudioBuffer) {
    const offlineCtx = new OfflineAudioContext(
      1,
      audioBuffer.duration * this.sampleRate,
      this.sampleRate
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();
    return offlineCtx.startRendering();
  }

  encode(image: HTMLImageElement, audioBuffer: Float32Array) {
    const { canvas, context } = StegaCassette.canvasForImageAtPixelCount(
      image,
      2 * Math.ceil(audioBuffer.length / 3)
    );

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let audioIndex = 0;

    for (let i = 0; i < data.length; i += 8) {
      const pixelIndex = Math.floor(i / 4);
      const row = Math.floor(pixelIndex / canvas.width);
      const col = pixelIndex % canvas.width;
      const isEvenRow = row % 2 === 0;

      data[i + 3] = 255; // A is fully opaque
      data[i + 7] = 255; // A is fully opaque

      if (audioIndex < audioBuffer.length) {
        const keyIndex = isEvenRow ? 0 : 4;
        const encodedIndex = isEvenRow ? 4 : 0;
        const rSample = StegaCassette.encodeFloatTo8Bit(
          data[i + keyIndex + 0],
          audioBuffer[audioIndex]
        );
        const gSample = StegaCassette.encodeFloatTo8Bit(
          data[i + keyIndex + 1],
          audioBuffer[audioIndex + 1] || 0
        );
        const bSample = StegaCassette.encodeFloatTo8Bit(
          data[i + keyIndex + 2],
          audioBuffer[audioIndex + 2] || 0
        );

        data[i + encodedIndex + 0] = rSample;
        data[i + encodedIndex + 1] = gSample;
        data[i + encodedIndex + 2] = bSample;

        audioIndex += 3;
      }
    }

    context.putImageData(imageData, 0, 0);

    return canvas;
  }

  decode(image: HTMLImageElement) {
    const { canvas, context } = StegaCassette.canvasAndContext(
      image.naturalWidth,
      image.naturalHeight
    );
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const audioSamples: number[] = [];

    for (let i = 0; i < data.length; i += 8) {
      const pixelIndex = Math.floor(i / 4);
      const row = Math.floor(pixelIndex / canvas.width);
      const col = pixelIndex % canvas.width;
      const isEvenRow = row % 2 === 0;
      const keyIndex = isEvenRow ? 0 : 4;
      const encodedIndex = isEvenRow ? 4 : 0;

      const rSample = StegaCassette.decodeBitToFloat(
        data[i + keyIndex + 0],
        data[i + encodedIndex + 0]
      );
      const gSample = StegaCassette.decodeBitToFloat(
        data[i + keyIndex + 1],
        data[i + encodedIndex + 1]
      );
      const bSample = StegaCassette.decodeBitToFloat(
        data[i + keyIndex + 2],
        data[i + encodedIndex + 2]
      );

      if (rSample !== 0) audioSamples.push(rSample);
      if (gSample !== 0) audioSamples.push(gSample);
      if (bSample !== 0) audioSamples.push(bSample);
    }

    return new Float32Array(audioSamples);
  }

  async play(decodedAudio: Float32Array) {
    // Resume the AudioContext if it was suspended
    await this.audioContext.resume();

    // Create an AudioBuffer with 1 channel, length of decoded audio, and sample rate
    const decodedBuffer = this.audioContext.createBuffer(
      1,
      decodedAudio.length,
      this.sampleRate
    );

    // Copy the decoded audio data into the buffer
    decodedBuffer.getChannelData(0).set(decodedAudio);

    // Create a BufferSourceNode
    const source = this.audioContext.createBufferSource();
    source.buffer = decodedBuffer;

    // Connect the source to the AudioContext's destination (speakers)
    source.connect(this.audioContext.destination);

    // Start playing the audio
    source.start();
  }

  private static canvasAndContext(width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    return { canvas, context };
  }

  private static canvasForImageAtPixelCount(
    image: HTMLImageElement | HTMLCanvasElement,
    requiredPixelCount: number
  ) {
    const aspectRatio = StegaCassette.imageOrCanvasIsImage(image)
      ? image.naturalHeight / image.naturalWidth
      : image.height / image.width;
    const newWidth = Math.sqrt(requiredPixelCount / aspectRatio);
    const { canvas, context } = StegaCassette.canvasAndContext(
      newWidth,
      newWidth * aspectRatio
    );
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { canvas, context };
  }

  private static imageOrCanvasIsImage(
    image: HTMLImageElement | HTMLCanvasElement
  ): image is HTMLImageElement {
    return image.tagName === "IMAGE";
  }

  private static decodeBitToFloat(keyValue: number, bitValue: number) {
    const difference = (bitValue - keyValue + 256) % 256;
    if (difference % 2 === 0) {
      return difference / 255;
    } else {
      return (difference / 255) * -1;
    }
    // return (((bitValue - keyValue + 256) % 256) / 255) * 2 - 1;
  }

  private static encodeFloatTo8Bit(keyValue: number, sample: number) {
    const even = Math.floor((Math.abs(sample) * 255) / 2) * 2;
    if (sample > 0) {
      return (keyValue + even) % 256;
    } else {
      return (keyValue + even + 1) % 256;
    }

    // return (keyValue + Math.floor(((sample + 1) / 2) * 255)) % 256;
  }
}
