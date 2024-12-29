import * as StegaMetadata from "./StegaMetadata";
import {
  createCanvasAndContext,
  createCanvasAndContextForImageWithMinimums,
  fillCanvasWithImage,
  skippedAndIndicesFromIndexGenerator,
} from "./utilities";

// This mixed order is very important. A-Za-z0-9 translates to a visible difference.
// First char being an = is important as it will be for the trailing pixels
const CHARACTER_STRING_BASE64 =
  "=+/Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0KkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";

// Splitting messages with these characters
const MESSAGE_BREAK_CHARACTER_BASE64 = "=";
// NULL non printing character
const MESSAGE_BREAK_CHARACTER_RAW = String.fromCharCode(0);

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
  const encodedMessages = messages.map(
    initialStringFormatterForEncoding(encoding)
  );

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

  const encoder = stringEncoderFromEncoding(encoding);

  for (let i = 0, j = 0; i < imageData.data.length; i++) {
    const { isSkipped, encodedIndex, sourceIndex } = indexData(
      i,
      imageData.data
    );

    if (!isSkipped) {
      if (j < message.length) {
        const char = message.charAt(j);
        imageData.data[encodedIndex] = encoder(
          char,
          imageData.data[sourceIndex]
        );
        j++;
      } else {
        message = tmpMessages.shift() || "";
        j = 0;
        imageData.data[encodedIndex] = encoder(
          null,
          imageData.data[sourceIndex]
        );
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

  const decoder = stringDecoderFromEncoding(encoding);

  for (let i = 0; i < imageData.data.length; i++) {
    const { isSkipped, encodedIndex, sourceIndex } = indexData(
      i,
      imageData.data
    );
    if ((i + 1) % 4 !== 0 && !isSkipped) {
      const value = decoder(
        imageData.data[encodedIndex],
        imageData.data[sourceIndex]
      );
      if (value) {
        message.push(value);
      } else {
        const string = message.join("").trim();
        if (string.length) {
          messages.push(string);
          message = [];
        }
      }
    }
  }

  const string = message.join("").trim();
  if (string.length) {
    messages.push(string);
  }

  const decodedMessages =
    encoding === "base64"
      ? messages.map((msg) => convertBase64ToString(msg))
      : messages.map((msg) => convertRawToString(msg));

  return decodedMessages;
}

function stringEncoderFromEncoding(encoding: Stega64Encoding) {
  switch (encoding) {
    case "base64":
      return encodeBase64;
    case "none":
    default:
      return encodeRaw;
  }
}

function stringDecoderFromEncoding(encoding: Stega64Encoding) {
  switch (encoding) {
    case "base64":
      return decodeBase64;
    case "none":
    default:
      return decodeRaw;
  }
}

function initialStringFormatterForEncoding(encoding: Stega64Encoding) {
  switch (encoding) {
    case "base64":
      return formatInitialStringForBase64;
    case "none":
    default:
      return formatInitialStringForRaw;
  }
}

/**
 * Encoders encode new line or value based on a source value.
 * If character is null, it returns a string for a new line.
 */

// Base64 Encoder
function encodeBase64(character: string | null, sourceValue: number) {
  return encode64ValueForKeyValue(
    convertBase64CharToInt(
      character !== null ? character : MESSAGE_BREAK_CHARACTER_BASE64
    ),
    sourceValue
  );

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
   * Gets the Stega64 integer value for a Base64 character.
   */
  function convertBase64CharToInt(character?: string) {
    return character ? CHARACTER_STRING_BASE64.indexOf(character) : 0;
  }
}

// Raw Encoder
function encodeRaw(character: string | null, sourceValue: number) {
  return encodeRawValue(
    character !== null ? character : MESSAGE_BREAK_CHARACTER_RAW,
    sourceValue
  );

  function encodeRawValue(char: string, keyValue: number) {
    const value = char.charCodeAt(0);
    return (value + keyValue) % 256;
  }
}

/**
 * Decoders decode string or null for a new line
 */

// Base64 Decoder
function decodeBase64(
  encodedValue: number,
  sourceValue: number
): string | null {
  const decodedValue = decode64ValueForKeyValue(encodedValue, sourceValue);
  const value = convertIntToBase64Char(decodedValue);
  return value === MESSAGE_BREAK_CHARACTER_BASE64 ? null : value;

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

  /**
   * Gets the Base64 character for a Stega64 integer.
   * @param character
   * @returns index of character
   */
  function convertIntToBase64Char(int: number) {
    return int === CHARACTER_STRING_BASE64.length
      ? null
      : CHARACTER_STRING_BASE64.charAt(int);
  }
}

// Raw Decoder
function decodeRaw(encodedValue: number, sourceValue: number): string | null {
  const decodedValue = decodeRawValue(encodedValue, sourceValue);
  const value = convertRawChar(decodedValue);
  return value === MESSAGE_BREAK_CHARACTER_RAW ? null : value;

  function decodeRawValue(encodedValue: number, keyValue: number) {
    return (encodedValue - keyValue + 256) % 256;
  }

  function convertRawChar(value: number) {
    return String.fromCharCode(value);
  }
}

/**
 * Format a string for a raw encoding.
 */
function formatInitialStringForRaw(string: string) {
  return string;
}

/**
 * Convert a raw encoded string to a string.
 */
function convertRawToString(raw: string) {
  return raw;
}

/**
 * Convert a string to a safe base64 encoded string.
 */
function formatInitialStringForBase64(string: string) {
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
