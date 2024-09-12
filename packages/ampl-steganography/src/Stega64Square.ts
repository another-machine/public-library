/**
 * Can make this more complex in the future.
 * Creating a vertical format.
 * Simplest would be horizontal canvas rotated, or more complexwith different orientations.
 * Storing metadata in border? Would require border.
 *    Metadata to include:
 *      Stega64Square.charString used for base64 int conversion (this order makes a visual difference!)
 *      Pixel patterns (perhaps you can do other patterns with more images).
 *      A title?
 * Perhaps noise border is an option, and text borders with color is another option?
 */
/**
 * Encoded pixels in both images, one is less half the other is more half, decoding is finding the middle
 */

export type Stega64SquarePattern = "column" | "row" | "cross";

export class Stega64Square {
  static decode(source: HTMLImageElement | HTMLCanvasElement) {
    const relativeWidth =
      "naturalWidth" in source ? source.naturalWidth : source.width;
    const _relativeHeight =
      "naturalHeight" in source ? source.naturalHeight : source.height;
    const diameter = relativeWidth;

    // Detect border from square... we need metadata
    const [
      { canvas: metadataCanvas, context: metadataContext },
      { canvas, context },
    ] = [
      Stega64Square.newCanvasAndContext(),
      Stega64Square.newCanvasAndContext(),
    ];
    metadataCanvas.width = diameter;
    metadataCanvas.height = diameter;
    console.log(metadataCanvas);
    metadataContext.drawImage(source, 0, 0);

    // Retrieving metadata from center four pixels
    const metadataImageData = metadataContext.getImageData(
      Math.floor(diameter / 2) - 1,
      Math.floor(diameter / 2) - 1,
      2,
      2
    );
    // Border size is a three character hex in the first two pixels.
    const borderValues = [
      Stega64Square.base64CharFromInt(
        Stega64Square.valueFromEncodedValueAndKeyValue(
          metadataImageData.data[4],
          metadataImageData.data[0]
        )
      ),
      Stega64Square.base64CharFromInt(
        Stega64Square.valueFromEncodedValueAndKeyValue(
          metadataImageData.data[5],
          metadataImageData.data[1]
        )
      ),
      Stega64Square.base64CharFromInt(
        Stega64Square.valueFromEncodedValueAndKeyValue(
          metadataImageData.data[6],
          metadataImageData.data[2]
        )
      ),
    ];
    const pattern = Stega64Square.numberToPattern(
      Stega64Square.valueFromEncodedValueAndKeyValue(
        metadataImageData.data[12],
        metadataImageData.data[8]
      )
    );

    // We still have two channels on two pixels for 16 more bits of storage
    const border = Stega64Square.convertHexToNumber(borderValues.join(""));

    // Now we know the true dimensions
    canvas.width = canvas.height = diameter - border * 2;

    context.drawImage(
      source,
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
    const indexData = Stega64Square.skippedAndIndicesFromIndexGenerator(
      canvas,
      Stega64Square.getCenterPixelIndices(canvas.width, canvas.height),
      pattern
    );

    // Stepping through the image data
    for (let i = 0; i < imageData.data.length; i++) {
      const { isSkipped, encodedIndex, sourceIndex } = indexData(i);

      if ((i + 1) % 4 !== 0) {
        if (!isSkipped) {
          const decodedValue = Stega64Square.valueFromEncodedValueAndKeyValue(
            imageData.data[encodedIndex],
            imageData.data[sourceIndex]
          );
          const value = Stega64Square.base64CharFromInt(decodedValue);
          if (value !== null) {
            message.push(value);
          }
        }
      }
    }

    return message.join("").trim();
  }

  static encode({
    image,
    message,
    pattern,
    border = 0,
  }: {
    image: HTMLImageElement | HTMLCanvasElement;
    message: string;
    pattern: Stega64SquarePattern;
    border?: number;
  }): HTMLCanvasElement {
    // Max border size is 4095.
    border = Math.min(Stega64Square.convertHexToNumber("FFF"), border);

    const [
      { canvas, context },
      { canvas: canvasOutput, context: contextOutput },
    ] = [
      Stega64Square.newCanvasAndContext(),
      Stega64Square.newCanvasAndContext(),
      Stega64Square.newCanvasAndContext(),
    ];
    let diameter = Math.ceil(Math.sqrt((message.length / 3 + 16) * 2));
    if (diameter % 2 !== 0) {
      diameter += 1;
    }

    canvasOutput.height = canvasOutput.width = diameter + border * 2;
    canvas.height = canvas.width = diameter;

    Stega64Square.fillCanvasWithImage(canvasOutput, contextOutput, image);
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
    const centerIndices = Stega64Square.getCenterPixelIndices(
      canvas.width,
      canvas.height
    );

    // A function to get us info from an index
    const indexData = Stega64Square.skippedAndIndicesFromIndexGenerator(
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
          const value = Stega64Square.intFromBase64Char(char);
          const encodedValue = Stega64Square.encodedValueFromKeyValue(
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
    const characters = Stega64Square.convertNumberToHex(border, 3).split("");
    characters.forEach((character, i) => {
      imageData.data[write1 + i] = Stega64Square.encodedValueFromKeyValue(
        Stega64Square.intFromBase64Char(character),
        imageData.data[source1 + i]
      );
    });
    imageData.data[write2] = Stega64Square.encodedValueFromKeyValue(
      Stega64Square.patternToNumber(pattern),
      imageData.data[source2]
    );

    // Putting final image data
    contextOutput.putImageData(imageData, border, border);

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

  private static skippedAndIndicesFromIndexGenerator(
    canvas: HTMLCanvasElement,
    centerIndices: number[],
    pattern: Stega64SquarePattern
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

  private static patternToNumber(pattern: Stega64SquarePattern) {
    return Stega64Square.patterns.indexOf(pattern);
  }

  private static numberToPattern(number: number) {
    return Stega64Square.patterns[number];
  }

  private static get patterns(): Stega64SquarePattern[] {
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
    return char ? Stega64Square.charString.indexOf(char) : 0;
  }

  private static base64CharFromInt(int: number) {
    return int === Stega64Square.charString.length
      ? null
      : Stega64Square.charString.charAt(int);
  }

  // This mixed order is very important. A-Za-z0-9 translates to a visible difference.
  // First char being an = is important as it will be for the trailing pixels
  private static get charString() {
    return "=+/Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0KkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";
  }
}
