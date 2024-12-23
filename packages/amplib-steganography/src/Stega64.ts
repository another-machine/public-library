import * as StegaMetadata from "./StegaMetadata";
import {
  createCanvasAndContext,
  createCanvasAndContextForImageWithMinimums,
  fillCanvasWithImage,
  skippedAndIndicesFromIndexGenerator,
} from "./utilities";

// This mixed order is very important. A-Za-z0-9 translates to a visible difference.
// First char being an = is important as it will be for the trailing pixels
const STEGA64_CHARACTER_STRING =
  "=+/Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0KkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";

// Splitting messages with this character
const STEGA64_MESSAGE_BREAK_CHARACTER = "=";

export type Stega64Encoding = "base64" | "none";

/**
 * Encode messages into an image.
 */
export function encode({
  source,
  messages,
  encoding,
  encodeMetadata,
  minWidth = 0,
  minHeight = 0,
}: {
  source: HTMLImageElement | HTMLCanvasElement;
  messages: string[];
  encoding: Stega64Encoding;
  encodeMetadata: boolean;
  minWidth?: number;
  minHeight?: number;
}): HTMLCanvasElement {
  const encodedMessages = messages.map(convertStringToBase64);
  const messageLength =
    encodedMessages.length +
    encodedMessages.reduce<number>((agg, message) => agg + message.length, 0);

  minWidth = Math.max(minWidth || 0, StegaMetadata.PATTERN_LENGTH);
  const initialCanvas = createCanvasAndContextForImageWithMinimums({
    source,
    messageLength,
    minWidth,
    minHeight,
  });

  fillCanvasWithImage(initialCanvas.canvas, initialCanvas.context, source);

  const canvas = encodeMetadata
    ? StegaMetadata.encode({
        source: initialCanvas.canvas,
        metadata: {
          type: StegaMetadata.StegaContentType.STRING,
          messageCount: messages.length,
          encoding,
        },
      })
    : initialCanvas.canvas;
  const context = canvas.getContext("2d")!;

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  const indexData = skippedAndIndicesFromIndexGenerator(canvas.width);

  const tmpMessages = [...encodedMessages];
  let message = tmpMessages.shift() || "";

  for (let i = 0, j = 0; i < imageData.data.length; i++) {
    const { isSkipped, encodedIndex, sourceIndex } = indexData(
      i,
      imageData.data
    );

    if (!isSkipped) {
      if (j < message.length) {
        const char = message.charAt(j);
        const value = convertBase64CharToInt(char);
        const encodedValue = encode64ValueForKeyValue(
          value,
          imageData.data[sourceIndex]
        );
        imageData.data[encodedIndex] = encodedValue;
        j++;
      } else {
        message = tmpMessages.shift() || "";
        j = 0;
        const value = convertBase64CharToInt(STEGA64_MESSAGE_BREAK_CHARACTER);
        const encodedValue = encode64ValueForKeyValue(
          value,
          imageData.data[sourceIndex]
        );
        imageData.data[encodedIndex] = encodedValue;
      }
    }
  }

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
  encoding,
}: {
  source: HTMLImageElement | HTMLCanvasElement;
  encoding: Stega64Encoding;
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

  const messages: string[] = [];
  let message: string[] = [];

  const indexData = skippedAndIndicesFromIndexGenerator(canvas.width);

  for (let i = 0; i < imageData.data.length; i++) {
    const { isSkipped, encodedIndex, sourceIndex } = indexData(
      i,
      imageData.data
    );
    if ((i + 1) % 4 !== 0) {
      if (!isSkipped) {
        const decodedValue = decode64ValueForKeyValue(
          imageData.data[encodedIndex],
          imageData.data[sourceIndex]
        );
        const value = convertIntToBase64Char(decodedValue);
        if (value === STEGA64_MESSAGE_BREAK_CHARACTER) {
          const string = message.join("").trim();
          if (string.length) {
            messages.push(string);
            message = [];
          }
        } else if (value !== null) {
          message.push(value);
        }
      }
    }
  }
  const string = message.join("").trim();
  if (string.length) {
    messages.push(string);
  }

  const decodedMessages = messages.map((msg) => convertBase64ToString(msg));

  return decodedMessages;
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
  try {
    return decodeURIComponent(atob(base64.replace(/=+$/, "")));
  } catch (e) {
    console.log({ base64 });
  }
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
 * Value must be between 0 and 64
 */
function encode64ValueForKeyValue(value: number, keyValue: number) {
  // return (keyValue + value * 4) % 256;
  // if (keyValue > 128) return keyValue  - value;
  if (keyValue > 170) return keyValue - value;
  if (keyValue > 85) return keyValue + (value - 32);
  return keyValue + value;
}

/**
 * Returns the decoded value for the encoded value and the key value.
 * Value must be between 0 and 64
 */
function decode64ValueForKeyValue(encodedValue: number, keyValue: number) {
  // return Math.floor(((encodedValue - keyValue + 256) % 256) / 4);
  // if (keyValue > 128) return keyValue - encodedValue;
  if (keyValue > 170) return keyValue - encodedValue;
  if (keyValue > 85) return encodedValue + 32 - keyValue;
  return encodedValue - keyValue;
}
