/**
 * Can make this more complex in the future.
 * Creating a vertical format.
 * Simplest would be horizontal canvas rotated, or more complexwith different orientations.
 * Storing metadata in border? Would require border.
 *    Metadata to include:
 *      Stega64.charString used for base64 int conversion (this order makes a visual difference!)
 *      Pixel patterns (perhaps you can do other patterns with more images).
 *      A title?
 * Perhaps noise border is an option, and text borders with color is another option?
 */
/**
 * Encoded pixels in both images, one is less half the other is more half, decoding is finding the middle
 */

type Stega64Pattern = "column" | "row" | "cross";

export class Stega64 {
  static decode(image: HTMLImageElement | HTMLCanvasElement) {
    const relativeWidth =
      "naturalWidth" in image ? image.naturalWidth : image.width;
    const relativeHeight =
      "naturalHeight" in image ? image.naturalHeight : image.height;

    if (relativeWidth === relativeHeight) {
      return Stega64.decodeSquare(image, relativeWidth);
    } else {
      return Stega64.decodeRotated(image, relativeWidth, relativeHeight);
    }
  }

  static decodeSquare(
    image: HTMLImageElement | HTMLCanvasElement,
    diameter: number
  ) {
    // Detect border from square... we need metadata
    const [
      { canvas: metadataCanvas, context: metadataContext },
      { canvas, context },
    ] = [Stega64.newCanvasAndContext(), Stega64.newCanvasAndContext()];
    metadataCanvas.width = metadataCanvas.height = diameter;
    metadataContext.drawImage(image, 0, 0);

    // Retrieving metadata from center four pixels
    const metadataImageData = metadataContext.getImageData(
      Math.floor(diameter / 2) - 1,
      Math.floor(diameter / 2) - 1,
      2,
      2
    );
    // Border size is a three character hex in the first two pixels.
    const borderValues = [
      Stega64.base64CharFromInt(
        Stega64.valueFromEncodedValueAndKeyValue(
          metadataImageData.data[4],
          metadataImageData.data[0]
        )
      ),
      Stega64.base64CharFromInt(
        Stega64.valueFromEncodedValueAndKeyValue(
          metadataImageData.data[5],
          metadataImageData.data[1]
        )
      ),
      Stega64.base64CharFromInt(
        Stega64.valueFromEncodedValueAndKeyValue(
          metadataImageData.data[6],
          metadataImageData.data[2]
        )
      ),
    ];
    const pattern = Stega64.numberToPattern(
      Stega64.valueFromEncodedValueAndKeyValue(
        metadataImageData.data[12],
        metadataImageData.data[8]
      )
    );

    // We still have two channels on two pixels for 16 more bits of storage
    const border = Stega64.convertHexToNumber(borderValues.join(""));

    // Now we know the true dimensions
    canvas.width = canvas.height = diameter - border * 2;

    context.drawImage(
      image,
      border,
      border,
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // Image data ignoring border, for processing.
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    // The decoded message
    const message: string[] = [];

    // A function to get us info from an index
    const indexData = Stega64.indicesAndSkippedFromIndexGenerator(
      canvas,
      Stega64.getCenterPixelIndices(canvas.width, canvas.height),
      pattern
    );

    // Stepping through the image data
    for (let i = 0; i < imageData.data.length; i++) {
      const { isSkipped, encodedIndex, sourceIndex } = indexData(i);

      if ((i + 1) % 4 !== 0) {
        if (!isSkipped) {
          const decodedValue = Stega64.valueFromEncodedValueAndKeyValue(
            imageData.data[encodedIndex],
            imageData.data[sourceIndex]
          );
          const value = Stega64.base64CharFromInt(decodedValue);
          if (value !== null) {
            message.push(value);
          }
        }
      }
    }

    return message.join("").trim();
  }

  static decodeRotated(
    image: HTMLImageElement | HTMLCanvasElement,
    width: number,
    height: number
  ) {
    const [
      { canvas: canvas1, context: context1 },
      { canvas: canvas2, context: context2 },
    ] = [Stega64.newCanvasAndContext(), Stega64.newCanvasAndContext()];

    const halfDimension = Math.max(width, height) / 2;
    const border = Math.min(width, height) - halfDimension;
    const sourceDimension = Math.min(width, height) - border * 2;

    canvas1.width =
      canvas2.width =
      canvas1.height =
      canvas2.height =
        sourceDimension;

    // Drawing first image
    context1.drawImage(
      image,
      border,
      border,
      sourceDimension,
      sourceDimension,
      0,
      0,
      sourceDimension,
      sourceDimension
    );

    // Unrotating the image
    context2.save();
    context2.translate(canvas2.width, canvas2.height);
    context2.rotate((180 * Math.PI) / 180);
    context2.drawImage(
      image,
      border + sourceDimension,
      border,
      sourceDimension,
      sourceDimension,
      0,
      0,
      sourceDimension,
      sourceDimension
    );
    context2.restore();

    const imageDataOne = context1.getImageData(
      0,
      0,
      sourceDimension,
      sourceDimension
    );
    const imageDataTwo = context2.getImageData(
      0,
      0,
      sourceDimension,
      sourceDimension
    );

    const string: string[] = [];
    for (let i = 0; i < imageDataOne.data.length; i++) {
      if ((i + 1) % 4 !== 0) {
        const pxIndex = Math.floor(i / 4);
        // const pxOffset = i % 4;
        const row = Math.floor(pxIndex / sourceDimension);
        const col = pxIndex % sourceDimension;
        const isOffset =
          row % 2 === 0
            ? col % 2 === 0
              ? true
              : false
            : col % 2 === 0
            ? false
            : true;
        const encodedValue = isOffset
          ? imageDataTwo.data[i]
          : imageDataOne.data[i];
        const keyValue = isOffset ? imageDataOne.data[i] : imageDataTwo.data[i];
        const base64Char = Stega64.base64CharFromInt(
          Stega64.valueFromEncodedValueAndKeyValue(encodedValue, keyValue)
        );
        if (base64Char !== null) string.push(base64Char);
      }
    }
    return string.join("").trim();
  }

  static encodeSquare({
    image,
    message,
    pattern,
    border = 0,
  }: {
    image: HTMLImageElement | HTMLCanvasElement;
    message: string;
    pattern: Stega64Pattern;
    border?: number;
  }): HTMLCanvasElement {
    // Max border size is 4095.
    border = Math.min(Stega64.convertHexToNumber("FFF"), border);

    const [
      { canvas, context },
      { canvas: canvasOutput, context: contextOutput },
    ] = [
      Stega64.newCanvasAndContext(),
      Stega64.newCanvasAndContext(),
      Stega64.newCanvasAndContext(),
    ];
    let diameter = Math.ceil(Math.sqrt((message.length / 3 + 16) * 2));
    if (diameter % 2 !== 0) {
      diameter += 1;
    }

    canvasOutput.height = canvasOutput.width = diameter + border * 2;
    canvas.height = canvas.width = diameter;

    Stega64.fillCanvasWithImage(canvasOutput, contextOutput, image);
    context.drawImage(
      canvasOutput,
      border,
      border,
      diameter,
      diameter,
      0,
      0,
      diameter,
      diameter
    );

    // Getting image data of original image
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    // Center four pixels hold metadata
    const centerIndices = Stega64.getCenterPixelIndices(
      canvas.width,
      canvas.height
    );

    // A function to get us info from an index
    const indexData = Stega64.indicesAndSkippedFromIndexGenerator(
      canvas,
      centerIndices,
      pattern
    );

    // Stepping through the image data
    for (let i = 0, j = 0; i < imageData.data.length; i++) {
      const { isSkipped, encodedIndex, sourceIndex } = indexData(i);
      if ((i + 1) % 4 !== 0) {
        if (!isSkipped) {
          const char = message.charAt(j);
          const value = Stega64.intFromBase64Char(char);
          const encodedValue = Stega64.encodedValueFromKeyValue(
            value,
            imageData.data[sourceIndex]
          );
          imageData.data[encodedIndex] = encodedValue;
          j++;
        }
      } else {
        imageData.data[i] = 255;
      }
    }

    // Authoring metadata in center
    const [source1, write1, source2, write2] = centerIndices;
    // Border size is a three character hex in the first two pixels.
    const characters = Stega64.convertNumberToHex(border, 3).split("");
    characters.forEach((character, i) => {
      imageData.data[write1 + i] = Stega64.encodedValueFromKeyValue(
        Stega64.intFromBase64Char(character),
        imageData.data[source1 + i]
      );
    });
    imageData.data[write2] = Stega64.encodedValueFromKeyValue(
      Stega64.patternToNumber(pattern),
      imageData.data[source2]
    );

    // Putting final image data
    contextOutput.putImageData(imageData, border, border);

    return canvasOutput;
  }

  static encode({
    image,
    message,
    border = 0,
  }: {
    image: HTMLImageElement | HTMLCanvasElement;
    message: string;
    border?: number;
  }): HTMLCanvasElement {
    const [
      { canvas: canvas1, context: context1 },
      { canvas: canvas2, context: context2 },
      { canvas: canvasOutput, context: contextOutput },
    ] = [
      Stega64.newCanvasAndContext(),
      Stega64.newCanvasAndContext(),
      Stega64.newCanvasAndContext(),
    ];
    const diameter = Math.ceil(Math.sqrt(message.length / 3));
    canvas1.height = canvas1.width = canvas2.height = canvas2.width = diameter;

    Stega64.fillCanvasWithImage(canvas2, context2, image);

    // Getting image data of original image
    const imageData1 = context2.getImageData(
      0,
      0,
      canvas2.width,
      canvas2.height
    );
    // Duplicate the image data for our second bucket of pixels
    const imageData2 = context1.createImageData(
      imageData1.width,
      imageData1.height
    );
    imageData2.data.set(imageData1.data);

    // Stepping through the image data
    for (let i = 0, j = 0; i < imageData1.data.length; i++) {
      const pxIndex = Math.floor(i / 4);
      const row = Math.floor(pxIndex / canvas1.width);
      const col = pxIndex % canvas1.width;
      const isOffset =
        row % 2 === 0
          ? col % 2 === 0
            ? true
            : false
          : col % 2 === 0
          ? false
          : true;
      if ((i + 1) % 4 !== 0) {
        const char = message.charAt(j);
        const value = Stega64.intFromBase64Char(char);
        const encodedValue = Stega64.encodedValueFromKeyValue(
          value,
          imageData1.data[i]
        );
        imageData2.data[i] = isOffset ? imageData1.data[i] : encodedValue;
        imageData1.data[i] = isOffset ? encodedValue : imageData1.data[i];
        j++;
      } else {
        imageData2.data[i] = imageData1.data[i] = 255;
      }
    }

    // Drawing first half of the data to temp context
    context2.putImageData(imageData1, 0, 0);

    // Modifying the output canvas dimensions for final form
    canvasOutput.width = (diameter + border) * 2;
    canvasOutput.height = diameter + border * 2;
    // Drawing background
    Stega64.fillCanvasWithImage(canvasOutput, contextOutput, canvas2);
    // Randomizing the pixels in the bg
    Stega64.randomizeCanvasPixels(canvasOutput, contextOutput);
    // Rotating canvas
    contextOutput.save();
    contextOutput.translate(canvas1.width, canvas1.height);
    contextOutput.rotate((180 * Math.PI) / 180);
    // Drawing itself rotated for mirrorlike bottom half
    contextOutput.drawImage(
      canvas1,
      0,
      0,
      canvas1.width / 2,
      canvas1.height,
      0,
      0,
      canvas1.width / 2,
      canvas1.height
    );
    contextOutput.restore();

    // Rotating canvas
    contextOutput.save();
    contextOutput.translate(canvasOutput.width, canvasOutput.height);
    contextOutput.rotate((180 * Math.PI) / 180);
    // Drawing the two halves of data
    contextOutput.drawImage(canvas2, border, border);
    contextOutput.restore();
    contextOutput.putImageData(imageData2, border, border);

    return canvasOutput;
  }

  static convertStringToBase64(string: any) {
    return btoa(encodeURIComponent(string));
  }
  static convertBase64ToString(base64: any) {
    return decodeURIComponent(atob(base64.replace(/=+$/, "")));
  }

  static convertNumberToHex(number: number, maxLength = 3) {
    return number.toString(16).padStart(maxLength, "0");
  }
  static convertHexToNumber(hex: string) {
    return parseInt(hex, 16);
  }

  static getImageFromImageUrl(imageUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = imageUrl;
      image.onload = (_) => resolve(image);
      image.onerror = reject;
    });
  }

  static createImageDropReader({
    element,
    onSuccess,
    onFailure,
    onDragEnter,
    onDragLeave,
    onDrop,
  }: {
    element: HTMLElement;
    onSuccess: (image: HTMLImageElement) => void;
    onFailure?: (message: string) => void;
    onDragEnter?: () => void;
    onDragLeave?: () => void;
    onDrop?: () => void;
  }) {
    element.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    element.addEventListener("dragenter", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (onDragEnter) onDragEnter();
    });
    element.addEventListener("dragleave", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (onDragLeave) onDragLeave();
    });

    element.addEventListener("drop", (event) => {
      event.preventDefault();

      if (onDrop) onDrop();

      const fileInput = document.createElement("input");
      fileInput.accept = "image/png";
      fileInput.type = "file";

      const files = event.dataTransfer?.files;
      if (files?.length) {
        fileInput.files = files;
      }
      const file = fileInput.files?.item(0);

      if (file && file.type === "image/png") {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = (e) => {
          const preview = document.createElement("img");
          if (e.target?.result) {
            preview.onload = () => onSuccess(preview);
            if (onFailure)
              preview.onerror = () =>
                onFailure(`Could not load image for ${file.name}`);
            preview.src = e.target.result.toString();
          }
        };
        if (onFailure)
          reader.onerror = () => onFailure(`Could not load file ${file.name}`);
      } else if (onFailure) {
        onFailure(
          file
            ? `File ${file.name} (${file.type}) is wrong type`
            : "Could not find a file"
        );
      }
    });
  }

  private static getCenterPixelIndices(width: number, height: number) {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);
    return [
      width * 4 * halfH - halfW * 4 - 4,
      width * 4 * halfH - halfW * 4,
      width * 4 * (halfH + 1) - halfW * 4 - 4,
      width * 4 * (halfH + 1) - halfW * 4,
    ];
  }

  private static indicesAndSkippedFromIndexGenerator(
    canvas: HTMLCanvasElement,
    centerIndices: number[],
    pattern: Stega64Pattern
  ) {
    // Whether we are alternating x or y
    const patternIsCross = pattern === "cross";
    const patternIsColumn = pattern === "column";
    const patternIsRow = pattern === "row";

    return (i: number) => {
      const pxIndex = Math.floor(i / 4);
      const row = Math.floor(pxIndex / canvas.width);
      const evenRow = row % 2 === 0;
      const nextI = i + 4;
      // Skipped pixels contain the saved data, and are set in a prior loop.
      const sourceIndex = patternIsCross
        ? evenRow
          ? nextI
          : i
        : patternIsColumn
        ? i
        : i;
      const encodedIndex = patternIsCross
        ? evenRow
          ? i
          : nextI
        : patternIsColumn
        ? nextI
        : i - canvas.width * 4;

      // Skipping the reserved pixels, or pixels set in prior loop
      const isSkipped =
        centerIndices.includes(pxIndex * 4) ||
        (patternIsRow ? row % 2 === 0 : pxIndex % 2 !== 0);

      return {
        isSkipped,
        encodedIndex,
        sourceIndex,
      };
    };
  }

  private static patternToNumber(pattern: Stega64Pattern) {
    return Stega64.patterns.indexOf(pattern);
  }

  private static numberToPattern(number: number) {
    return Stega64.patterns[number];
  }

  private static get patterns(): Stega64Pattern[] {
    return ["cross", "column", "row"];
  }

  private static fillCanvasWithImage(
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    image: HTMLImageElement | HTMLCanvasElement
  ) {
    const imageRatio = image.height / image.width;
    const canvasRatio = canvas.height / canvas.width;
    if (imageRatio > canvasRatio) {
      const h = canvas.width * imageRatio;
      context.drawImage(image, 0, (canvas.height - h) / 2, canvas.width, h);
    } else {
      const w = (canvas.width * canvasRatio) / imageRatio;
      context.drawImage(image, (canvas.width - w) / 2, 0, w, canvas.height);
    }
  }

  private static newCanvasAndContext(willReadFrequently = false): {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
  } {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", {
      colorSpace: "display-p3",
      willReadFrequently,
    }) as CanvasRenderingContext2D;
    context.imageSmoothingEnabled = false;
    return { canvas, context };
  }

  private static randomizeCanvasPixels(
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D
  ) {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const maxIndex = imageData.width * imageData.height;
    for (let i = 0; i < maxIndex; i++) {
      const index1 = i * 4;
      const index2 = Math.floor(maxIndex * Math.random()) * 4;
      for (let j = 0; j < 4; j++) {
        const newValue = imageData.data[index2 + j];
        imageData.data[index2 + j] = imageData.data[index1 + j];
        imageData.data[index1 + j] = newValue;
      }
    }
    context.putImageData(imageData, 0, 0);
  }

  private static encodedValueFromKeyValue(value: number, keyValue: number) {
    // return (keyValue + value * 4) % 256;
    // if (keyValue > 128) return keyValue  - value;
    if (keyValue > 170) return keyValue - value;
    if (keyValue > 85) return keyValue + (value - 32);
    return keyValue + value;
  }

  private static valueFromEncodedValueAndKeyValue(
    encodedValue: number,
    keyValue: number
  ) {
    // return Math.floor(((encodedValue - keyValue + 256) % 256) / 4);
    // if (keyValue > 128) return keyValue - encodedValue;
    if (keyValue > 170) return keyValue - encodedValue;
    if (keyValue > 85) return encodedValue + 32 - keyValue;
    return encodedValue - keyValue;
  }

  private static intFromBase64Char(char?: string) {
    return char ? Stega64.charString.indexOf(char) : 0;
  }

  private static base64CharFromInt(int: number) {
    return int === Stega64.charString.length
      ? null
      : Stega64.charString.charAt(int);
  }

  // This mixed order is very important. A-Za-z0-9 translates to a visible difference.
  // First char being an = is important as it will be for the trailing pixels
  private static get charString() {
    return "=+/Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0KkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";
  }
}

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
