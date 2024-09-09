// This mixed order is very important. A-Za-z0-9 translates to a visible difference.
// First char being an = is important as it will be for the trailing pixels
const STEGA64_CHARACTER_STRING =
  "=+/Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0KkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";

// Splitting messages with this character
const STEGA64_MESSAGE_BREAK_CHARACTER = "=";

/**
 * Encode messages into an image.
 */
export function encode({
  source,
  messages,
  minWidth = 0,
  minHeight = 0,
}: {
  /**
   * The image or canvas element to use as a source.
   * Aspect ratio will be preserved.
   */
  source: HTMLImageElement | HTMLCanvasElement;
  /**
   * An array of messages to store in the image.
   * Each will be base64 encoded.
   */
  messages: string[];
  /**
   * Minimum width for the final image.
   */
  minWidth?: number;
  /**
   * Minimum height for the final image.
   */
  minHeight?: number;
}): HTMLCanvasElement {
  const sourceWidth = imageOrCanvasIsImage(source)
    ? source.naturalWidth
    : source.width;
  const sourceHeight = imageOrCanvasIsImage(source)
    ? source.naturalHeight
    : source.height;
  const sourceAspectRatio = sourceHeight / sourceWidth;
  const { canvas: sourceCanvas, context: sourceContext } =
    createCanvasAndContext(sourceWidth, sourceHeight);
  fillCanvasWithImage(sourceCanvas, sourceContext, source);
  const sourceImageData = sourceContext.getImageData(
    0,
    0,
    sourceWidth,
    sourceHeight
  );
  let transparent = 0;
  for (let i = 0; i < sourceImageData.data.length; i += 4) {
    if (sourceImageData.data[i + 3] !== 255) {
      transparent++;
    }
  }
  const percentageTransparent = transparent / (sourceWidth * sourceHeight);

  const encodedMessages = messages.map(convertStringToBase64);
  const stringLength =
    encodedMessages.length +
    encodedMessages.reduce<number>((agg, message) => agg + message.length, 0);

  const minPixelCount =
    Math.ceil((stringLength / 3) * 2) * (1 / (1 - percentageTransparent));

  const { canvas, context } = createCanvasAndContextForImageWithMinimums(
    source,
    minPixelCount,
    minWidth,
    minHeight,
    sourceAspectRatio
  );

  fillCanvasWithImage(canvas, context, source);

  // Getting image data of original image
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  const indexData = indicesAndSkippedFromIndexGenerator(canvas.width);

  const tmpMessages = [...encodedMessages];
  let message = tmpMessages.shift() || "";

  // Stepping through the image data
  for (let i = 0, j = 0; i < imageData.data.length; i++) {
    const { isSkipped, encodedIndex, sourceIndex } = indexData(
      i,
      imageData.data
    );
    if (!isSkipped) {
      // Processing the current message
      if (j < message.length) {
        const char = message.charAt(j);
        const value = convertBase64CharToInt(char);
        const encodedValue = encodeValueForKeyValue(
          value,
          imageData.data[sourceIndex]
        );
        imageData.data[encodedIndex] = encodedValue;
        j++;
      } else {
        // Moving to the next message
        message = tmpMessages.shift() || "";
        j = 0;
        const value = convertBase64CharToInt(STEGA64_MESSAGE_BREAK_CHARACTER);
        const encodedValue = encodeValueForKeyValue(
          value,
          imageData.data[sourceIndex]
        );
        imageData.data[encodedIndex] = encodedValue;
      }
    }
  }

  // The final image data
  const { canvas: canvasOutput, context: contextOutput } =
    createCanvasAndContext();
  canvasOutput.width = canvas.width;
  canvasOutput.height = canvas.height;
  contextOutput.putImageData(imageData, 0, 0);

  return canvasOutput;
}

/**
 * Decode messages from an image.
 */
export function decode({
  source,
}: {
  /**
   * The image with message inside it.
   */
  source: HTMLImageElement | HTMLCanvasElement;
}) {
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

  // The decoded messages
  const messages: string[] = [];
  let message: string[] = [];

  // A function to get us info from an index
  const indexData = indicesAndSkippedFromIndexGenerator(canvas.width);

  // Stepping through the image data
  for (let i = 0; i < imageData.data.length; i++) {
    const { isSkipped, encodedIndex, sourceIndex } = indexData(
      i,
      imageData.data
    );

    if ((i + 1) % 4 !== 0) {
      if (!isSkipped) {
        const decodedValue = decodeValueForKeyValue(
          imageData.data[encodedIndex],
          imageData.data[sourceIndex]
        );
        const value = convertIntToBase64Char(decodedValue);
        if (value === STEGA64_MESSAGE_BREAK_CHARACTER) {
          if (message.length) {
            messages.push(message.join("").trim());
            message = [];
          }
        } else if (value !== null) {
          message.push(value);
        }
      }
    }
  }
  if (message.length) {
    messages.push(message.join("").trim());
  }

  return messages.map(convertBase64ToString);
}

/**
 * Load an image by url.
 */
export function loadImageFromImageUrl(
  imageUrl: string
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = imageUrl;
    image.onload = (_) => resolve(image);
    image.onerror = reject;
  });
}

/**
 * Convert a string to a safe base64 encoded string.
 */
function convertStringToBase64(string: string) {
  return btoa(encodeURIComponent(string));
}

/**
 * Convert a save base64 encoded string to a string.
 */
function convertBase64ToString(base64: string) {
  return decodeURIComponent(atob(base64.replace(/=+$/, "")));
}

/**
 * Gets the Stega64 integer value for a Base64 character.
 */
function convertBase64CharToInt(character?: string) {
  return character ? STEGA64_CHARACTER_STRING.indexOf(character) : 0;
}

/**
 * Gets the Base64 character for a Stega64 integer.
 * @param character
 * @returns index of character
 */
function convertIntToBase64Char(int: number) {
  return int === STEGA64_CHARACTER_STRING.length
    ? null
    : STEGA64_CHARACTER_STRING.charAt(int);
}

/**
 * Returns the encoded value for the value and the key value.
 */
function encodeValueForKeyValue(value: number, keyValue: number) {
  // return (keyValue + value * 4) % 256;
  // if (keyValue > 128) return keyValue  - value;
  if (keyValue > 170) return keyValue - value;
  if (keyValue > 85) return keyValue + (value - 32);
  return keyValue + value;
}

/**
 * Returns the decoded value for the encoded value and the key value.
 */
function decodeValueForKeyValue(encodedValue: number, keyValue: number) {
  // return Math.floor(((encodedValue - keyValue + 256) % 256) / 4);
  // if (keyValue > 128) return keyValue - encodedValue;
  if (keyValue > 170) return keyValue - encodedValue;
  if (keyValue > 85) return encodedValue + 32 - keyValue;
  return encodedValue - keyValue;
}

/**
 * Drawing a source at a size considering minimum pixel count, width, and height, as well as an aspect ratio.
 */
function createCanvasAndContextForImageWithMinimums(
  source: HTMLImageElement | HTMLCanvasElement,
  minPixelCount: number,
  minWidth: number,
  minHeight: number,
  aspectRatio: number
) {
  const dimensions = canvasWidthAndHeight({
    minWidth,
    minHeight,
    minPixelCount,
    aspectRatio,
  });

  const { canvas, context } = createCanvasAndContext(
    dimensions.width,
    dimensions.height
  );
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

/**
 * Getting a precise width and height filling minimum requirements.
 */
function canvasWidthAndHeight({
  minWidth,
  minHeight,
  minPixelCount,
  aspectRatio,
}: {
  minWidth: number;
  minHeight: number;
  minPixelCount: number;
  /**
   * Expressed as height / width
   */
  aspectRatio: number;
}) {
  let width = Math.max(minWidth, Math.sqrt(minPixelCount / aspectRatio));
  let height = width * aspectRatio;

  if (height < minHeight) {
    height = minHeight;
    width = height / aspectRatio;
  }

  return {
    width: Math.ceil(width),
    height: Math.ceil(height),
  };
}

/**
 * Creating a canvas and context.
 */
function createCanvasAndContext(
  width?: number,
  height?: number,
  willReadFrequently?: boolean
) {
  const canvas = document.createElement("canvas");
  canvas.width = width || 0;
  canvas.height = height || 0;
  const context = canvas.getContext("2d", {
    colorSpace: "display-p3",
    willReadFrequently,
  }) as CanvasRenderingContext2D;
  context.imageSmoothingEnabled = false;
  return { canvas, context };
}

/**
 * Draw an image on a canvas with "center" position and "cover" fit.
 */
function fillCanvasWithImage(
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

/**
 * Generates a function that returns information about how to handle an image data index
 */
function indicesAndSkippedFromIndexGenerator(width: number) {
  const widthIsOdd = width % 2 !== 0;
  return (i: number, data: Uint8ClampedArray) => {
    const pxIndex = Math.floor(i / 4);
    const row = Math.floor(pxIndex / width);
    const evenRowCheck = widthIsOdd || row % 2 === 0;
    const nextI = i + 4;
    const isOpaque = data[pxIndex * 4 + 3] === 255;
    // Skipped pixels contain the saved data, and are set in a prior loop.
    const sourceIndex = evenRowCheck ? nextI : i;
    const encodedIndex = evenRowCheck ? i : nextI;
    // Skipping pixels set in prior loop or last col for odd width images
    const isSkipped = !isOpaque || pxIndex % 2 !== 0 || (i + 1) % 4 === 0;

    return {
      isSkipped,
      encodedIndex,
      sourceIndex,
    };
  };
}

/**
 * Whether or not an image or canvas is an image.
 */
function imageOrCanvasIsImage(
  imageOrCanvas: HTMLImageElement | HTMLCanvasElement
): imageOrCanvas is HTMLImageElement {
  return imageOrCanvas.tagName === "IMAGE";
}
