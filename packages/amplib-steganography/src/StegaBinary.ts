import * as StegaMetadata from "./StegaMetadata";
import * as StegaKey from "./StegaKey";
import {
  createCanvasAndContext,
  dimensionsFromSource,
  getContext,
} from "./utilities";

export interface EncodeOptions {
  /** Source image to use as visual base for the encoded image border */
  source: HTMLImageElement | HTMLCanvasElement;
  /** Binary data to encode */
  data: Uint8Array;
  /** MIME type of the data (e.g., "application/pdf", "audio/mp3") */
  mimeType: string;
  /** Border width in pixels (must be >= 1 for metadata). Ignored if key is a pre-created key image. */
  borderWidth?: number;
  /** Target aspect ratio (uses source ratio if undefined) */
  aspectRatio?: number;
  /**
   * Key mode for encoding:
   * - `true` or `undefined`: Create a key from the source image (default keyed mode)
   * - `false`: Keyless mode - encoded image can be decoded without a key
   * - Pre-created key image (from StegaKey.create()): Use this key for encoding.
   *   The key's embedded metadata (borderWidth, sessionId) will be used.
   *   Key pixels will tile if smaller than needed for encoding.
   */
  key?: boolean | HTMLImageElement | HTMLCanvasElement;
  /**
   * Optional session ID for pairing key and encoded images.
   * If not provided, a random one will be generated for keyed mode.
   * Ignored in keyless mode (sessionId will be 0).
   * Ignored if key is a pre-created key image (uses the key's embedded sessionId).
   */
  sessionId?: number;
}

export interface EncodeResultKeyless {
  /** The encoded image containing the binary data */
  encoded: HTMLCanvasElement;
}

export interface EncodeResultSidecar {
  /** The key image (clean source, needed for decoding) */
  key: HTMLCanvasElement;
  /** The encoded image containing the binary data */
  encoded: HTMLCanvasElement;
  /** The session ID linking key and encoded images */
  sessionId: number;
}

export type EncodeResult = EncodeResultKeyless | EncodeResultSidecar;

export interface DecodeOptions {
  /** The encoded image containing binary data */
  encoded: HTMLImageElement | HTMLCanvasElement;
  /**
   * The key image for sidecar key mode.
   * Not required if the encoded image was created in keyless mode (sessionId = 0).
   * If the key is smaller than the encoded image, it will be tiled/looped.
   */
  key?: HTMLImageElement | HTMLCanvasElement;
}

export interface DecodeResult {
  /** The MIME type of the decoded data */
  mimeType: string;
  /** The decoded binary data */
  data: Uint8Array;
}

/**
 * Generate a random 32-bit session ID (non-zero).
 */
function generateSessionId(): number {
  let id = 0;
  while (id === 0) {
    id = crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return id;
}

/**
 * Calculate required canvas dimensions to fit the payload.
 */
function calculateDimensions(
  payloadLength: number,
  sourceWidth: number,
  sourceHeight: number,
  borderWidth: number,
  aspectRatio?: number
): { width: number; height: number } {
  const targetAspectRatio =
    aspectRatio === undefined ? sourceWidth / sourceHeight : aspectRatio;

  // Each pixel stores 3 bytes (RGB), alpha stays at 255
  const pixelsNeeded = Math.ceil(payloadLength / 3);

  // Account for border: usable area is (width - 2*border) * (height - 2*border)
  // We need: (w - 2b) * (h - 2b) >= pixelsNeeded
  // With aspect ratio: w = h * ratio
  // So: (h*ratio - 2b) * (h - 2b) >= pixelsNeeded

  let height = Math.ceil(Math.sqrt(pixelsNeeded / targetAspectRatio));
  let width = Math.ceil(height * targetAspectRatio);

  // Ensure we have enough space after accounting for border
  while (
    (width - 2 * borderWidth) * (height - 2 * borderWidth) <
    pixelsNeeded
  ) {
    height++;
    width = Math.ceil(height * targetAspectRatio);
  }

  // Ensure minimum dimensions for metadata
  width = Math.max(width, StegaMetadata.PATTERN_LENGTH);
  height = Math.max(height, StegaMetadata.PATTERN_LENGTH);

  return { width, height };
}

/**
 * Create a canvas with the source image drawn at the target dimensions.
 */
function createScaledCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  width: number,
  height: number
): HTMLCanvasElement {
  const { width: sourceWidth, height: sourceHeight } =
    dimensionsFromSource(source);
  const { canvas, context } = createCanvasAndContext(width, height);

  // Cover behavior: scale to fill, crop excess
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const scaledWidth = sourceWidth * scale;
  const scaledHeight = sourceHeight * scale;
  const x = (width - scaledWidth) / 2;
  const y = (height - scaledHeight) / 2;

  context.drawImage(source, x, y, scaledWidth, scaledHeight);

  return canvas;
}

/**
 * Create a black canvas of the given dimensions.
 */
function createBlackCanvas(width: number, height: number): HTMLCanvasElement {
  const { canvas, context } = createCanvasAndContext(width, height);
  context.fillStyle = "black";
  context.fillRect(0, 0, width, height);
  return canvas;
}

/**
 * Encode binary data into an image.
 *
 * - key=false: Keyless mode - returns just the encoded image
 * - key=true/undefined: Keyed mode - returns key and encoded image
 * - key=image: Custom key mode - uses pre-created key, returns key and encoded image
 */
export function encode(
  options: EncodeOptions & { key: false }
): EncodeResultKeyless;
export function encode(
  options: EncodeOptions & { key?: true | HTMLImageElement | HTMLCanvasElement }
): EncodeResultSidecar;
export function encode(options: EncodeOptions): EncodeResult;
export function encode(options: EncodeOptions): EncodeResult {
  const { source, data, mimeType, aspectRatio, key = true } = options;

  // Determine mode from key parameter
  const isKeyless = key === false;

  const isPreCreatedKey =
    typeof key === "object" && key !== null && "width" in key;
  const preCreatedKey = isPreCreatedKey
    ? (key as HTMLImageElement | HTMLCanvasElement)
    : null;

  // Extract borderWidth and sessionId from pre-created key if provided, otherwise use options
  let borderWidth = options.borderWidth ?? 1;
  let providedSessionId = options.sessionId;

  if (preCreatedKey) {
    // Validate that it's actually a key
    if (!StegaKey.isKey(preCreatedKey)) {
      throw new Error(
        "Provided key is not a valid StegaKey image (no KEY metadata found)"
      );
    }
    // Extract metadata from the key using StegaKey helpers
    borderWidth = StegaKey.getBorderWidth(preCreatedKey);
    providedSessionId = StegaKey.getSessionId(preCreatedKey);
  }

  if (borderWidth < 1) {
    throw new Error("Border width must be at least 1 for metadata encoding");
  }

  // Build payload: [mimeType]\0[binaryData]
  const mimeTypeBytes = new TextEncoder().encode(mimeType);
  const payloadLength = mimeTypeBytes.length + 1 + data.length; // +1 for null terminator
  const payload = new Uint8Array(payloadLength);
  payload.set(mimeTypeBytes, 0);
  payload[mimeTypeBytes.length] = 0; // Null terminator
  payload.set(data, mimeTypeBytes.length + 1);

  // Calculate dimensions
  const { width: sourceWidth, height: sourceHeight } =
    dimensionsFromSource(source);
  const { width, height } = calculateDimensions(
    payloadLength,
    sourceWidth,
    sourceHeight,
    borderWidth,
    aspectRatio
  );

  // Create key canvas for encoding based on mode:
  // - keyless: black pixels
  // - preCreatedKey: tiled pre-created key (for encoding)
  // - default: scaled source image (matches encoded canvas appearance)
  let keyCanvasForEncoding: HTMLCanvasElement;
  if (isKeyless) {
    keyCanvasForEncoding = createBlackCanvas(width, height);
  } else if (preCreatedKey) {
    // Tile the pre-created key to the encoding dimensions
    keyCanvasForEncoding = StegaKey.tile(preCreatedKey, width, height);
  } else {
    // Scale the source to encoding dimensions (matches encoded canvas)
    keyCanvasForEncoding = createScaledCanvas(source, width, height);
  }

  // Create encoded canvas (starts as copy of source for border appearance)
  const encodedCanvas = createScaledCanvas(source, width, height);
  const encodedContext = getContext(encodedCanvas);
  const keyContext = getContext(keyCanvasForEncoding);

  const encodedImageData = encodedContext.getImageData(0, 0, width, height);
  const keyImageData = keyContext.getImageData(0, 0, width, height);

  // Encode payload into non-border pixels
  let payloadIndex = 0;
  for (let y = borderWidth; y < height - borderWidth; y++) {
    for (let x = borderWidth; x < width - borderWidth; x++) {
      if (payloadIndex >= payloadLength) break;

      const pixelIndex = (y * width + x) * 4;

      // Encode up to 3 bytes per pixel (RGB channels)
      for (let channel = 0; channel < 3; channel++) {
        if (payloadIndex < payloadLength) {
          const keyValue = keyImageData.data[pixelIndex + channel];
          const payloadByte = payload[payloadIndex];
          encodedImageData.data[pixelIndex + channel] =
            (keyValue + payloadByte) % 256;
          payloadIndex++;
        }
      }
      // Alpha channel stays at 255
      encodedImageData.data[pixelIndex + 3] = 255;
    }
    if (payloadIndex >= payloadLength) break;
  }

  encodedContext.putImageData(encodedImageData, 0, 0);

  // Determine session ID:
  // - keyless mode: 0
  // - pre-created key: use the key's sessionId (already extracted above)
  // - otherwise: use provided sessionId or generate one
  const sessionId = isKeyless ? 0 : providedSessionId ?? generateSessionId();

  // Write metadata to encoded image
  const encodedWithMetadata = StegaMetadata.encode({
    source: encodedCanvas,
    metadata: {
      type: StegaMetadata.StegaContentType.BINARY,
      dataLength: payloadLength,
      borderWidth,
      sessionId,
    },
  });

  if (isKeyless) {
    return { encoded: encodedWithMetadata };
  }

  // If a pre-created key was provided, return a copy (to avoid DOM element conflicts)
  if (preCreatedKey) {
    const { width: kw, height: kh } = dimensionsFromSource(preCreatedKey);
    const { canvas: keyCanvas, context: keyContext } = createCanvasAndContext(
      kw,
      kh
    );
    keyContext.drawImage(preCreatedKey, 0, 0);
    return {
      key: keyCanvas,
      encoded: encodedWithMetadata,
      sessionId,
    };
  }

  // Create output key image at the SAME dimensions as the encoded output
  // Use the keyCanvasForEncoding directly to ensure pixel values match exactly
  const { key: keyWithMetadata } = StegaKey.create({
    source: keyCanvasForEncoding,
    borderWidth,
    sessionId,
  });

  return {
    key: keyWithMetadata,
    encoded: encodedWithMetadata,
    sessionId,
  };
}

/**
 * Decode binary data from an encoded image.
 *
 * If the image was encoded in keyless mode (sessionId = 0), no key is needed.
 * Otherwise, the matching key image must be provided.
 */
export function decode(options: DecodeOptions): DecodeResult {
  const { encoded, key } = options;

  // Read metadata from encoded image
  const encodedMetadata = StegaMetadata.decode({ source: encoded });
  if (
    !encodedMetadata ||
    encodedMetadata.type !== StegaMetadata.StegaContentType.BINARY
  ) {
    throw new Error("Encoded image does not contain valid binary metadata");
  }

  const { dataLength, borderWidth, sessionId } = encodedMetadata;
  const isKeyless = sessionId === 0;

  // Validate key requirement
  if (!isKeyless && !key) {
    throw new Error(
      "This image requires a key for decoding (sessionId is non-zero). Please provide the matching key image."
    );
  }

  // Get dimensions
  const { width: encodedWidth, height: encodedHeight } =
    dimensionsFromSource(encoded);

  // Create canvas for encoded image
  const { canvas: encodedCanvas, context: encodedContext } =
    createCanvasAndContext(encodedWidth, encodedHeight);
  encodedContext.drawImage(encoded, 0, 0);
  const encodedImageData = encodedContext.getImageData(
    0,
    0,
    encodedWidth,
    encodedHeight
  );

  // Create or get key image data
  let keyImageData: ImageData;

  if (isKeyless) {
    // Key is all zeros (black)
    const { canvas: keyCanvas, context: keyContext } = createCanvasAndContext(
      encodedWidth,
      encodedHeight
    );
    keyContext.fillStyle = "black";
    keyContext.fillRect(0, 0, encodedWidth, encodedHeight);
    keyImageData = keyContext.getImageData(0, 0, encodedWidth, encodedHeight);
  } else {
    // Validate key using StegaKey
    if (!StegaKey.isKey(key!)) {
      throw new Error("Key image does not contain valid key metadata");
    }

    const keySessionId = StegaKey.getSessionId(key!);
    if (keySessionId !== sessionId) {
      throw new Error(
        `Session ID mismatch: encoded image has sessionId ${sessionId}, but key has sessionId ${keySessionId}`
      );
    }

    // Get key dimensions - may be different from encoded if using tiled key
    const { width: keyWidth, height: keyHeight } = dimensionsFromSource(key!);
    console.log(
      "StegaBinary.decode - key dimensions:",
      keyWidth,
      "x",
      keyHeight
    );

    // Create key canvas - tile if smaller than encoded, scale if larger
    let keyCanvas: HTMLCanvasElement;
    if (keyWidth < encodedWidth || keyHeight < encodedHeight) {
      // Key is smaller, tile it to match encoded dimensions using StegaKey.tile()
      keyCanvas = StegaKey.tile(key!, encodedWidth, encodedHeight);
    } else if (keyWidth !== encodedWidth || keyHeight !== encodedHeight) {
      // Key is larger, scale it down
      keyCanvas = createScaledCanvas(key!, encodedWidth, encodedHeight);
    } else {
      // Same size, just copy
      const { canvas, context } = createCanvasAndContext(keyWidth, keyHeight);
      context.drawImage(key!, 0, 0);
      keyCanvas = canvas;
    }

    const keyContext = getContext(keyCanvas);
    keyImageData = keyContext.getImageData(0, 0, encodedWidth, encodedHeight);
  }

  // Decode payload
  const payload = new Uint8Array(dataLength);
  let payloadIndex = 0;

  for (let y = borderWidth; y < encodedHeight - borderWidth; y++) {
    for (let x = borderWidth; x < encodedWidth - borderWidth; x++) {
      if (payloadIndex >= dataLength) break;

      const pixelIndex = (y * encodedWidth + x) * 4;

      // Decode up to 3 bytes per pixel (RGB channels)
      for (let channel = 0; channel < 3; channel++) {
        if (payloadIndex < dataLength) {
          const encodedValue = encodedImageData.data[pixelIndex + channel];
          const keyValue = keyImageData.data[pixelIndex + channel];
          payload[payloadIndex] = (encodedValue - keyValue + 256) % 256;
          payloadIndex++;
        }
      }
    }
    if (payloadIndex >= dataLength) break;
  }

  // Extract mimeType and data from payload
  const nullIndex = payload.indexOf(0);
  if (nullIndex === -1) {
    throw new Error("Invalid payload: no null terminator found for mimeType");
  }

  const mimeType = new TextDecoder().decode(payload.slice(0, nullIndex));
  const data = payload.slice(nullIndex + 1);

  return { mimeType, data };
}

/**
 * Check if an encoded image is in keyless mode.
 */
export function isKeyless(
  encoded: HTMLImageElement | HTMLCanvasElement
): boolean {
  const metadata = StegaMetadata.decode({ source: encoded });
  if (!metadata || metadata.type !== StegaMetadata.StegaContentType.BINARY) {
    throw new Error("Image does not contain valid binary metadata");
  }
  return metadata.sessionId === 0;
}

/**
 * Get the session ID from an encoded or key image.
 */
export function getSessionId(
  image: HTMLImageElement | HTMLCanvasElement
): number {
  const metadata = StegaMetadata.decode({ source: image });
  if (!metadata) {
    throw new Error("Image does not contain valid metadata");
  }
  if (
    metadata.type !== StegaMetadata.StegaContentType.BINARY &&
    metadata.type !== StegaMetadata.StegaContentType.KEY
  ) {
    throw new Error("Image is not a binary or key image");
  }
  return metadata.sessionId;
}
