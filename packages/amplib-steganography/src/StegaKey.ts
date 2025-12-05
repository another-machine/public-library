import * as StegaMetadata from "./StegaMetadata";
import {
  createCanvasAndContext,
  dimensionsFromSource,
  getContext,
} from "./utilities";

export interface CreateKeyOptions {
  /** Source image to use as the key's visual content */
  source: HTMLImageElement | HTMLCanvasElement;
  /** Border width for metadata encoding (default: 1) */
  borderWidth?: number;
  /** Session ID for pairing with encoded images. If not provided, a random one is generated. */
  sessionId?: number;
}

export interface CreateKeyResult {
  /** The key image with KEY metadata embedded */
  key: HTMLCanvasElement;
  /** The session ID for this key */
  sessionId: number;
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
 * Create a standalone key image with KEY metadata embedded.
 * This key can be used with StegaBinary.encode() in custom key mode,
 * or for any other purpose requiring a reusable key image.
 */
export function create(options: CreateKeyOptions): CreateKeyResult {
  const { source, borderWidth = 1, sessionId = generateSessionId() } = options;

  const { width, height } = dimensionsFromSource(source);

  // Create canvas from source
  const { canvas, context } = createCanvasAndContext(width, height);
  context.drawImage(source, 0, 0);

  // Embed KEY metadata
  const keyWithMetadata = StegaMetadata.encode({
    source: canvas,
    metadata: {
      type: StegaMetadata.StegaContentType.KEY,
      borderWidth,
      sessionId,
    },
  });

  return {
    key: keyWithMetadata,
    sessionId,
  };
}

/**
 * Check if an image is a valid key image (has KEY metadata).
 */
export function isKey(image: HTMLImageElement | HTMLCanvasElement): boolean {
  const metadata = StegaMetadata.decode({ source: image });
  return (
    metadata !== null && metadata.type === StegaMetadata.StegaContentType.KEY
  );
}

/**
 * Get the session ID from a key image.
 * Throws if the image is not a valid key.
 */
export function getSessionId(
  image: HTMLImageElement | HTMLCanvasElement
): number {
  const metadata = StegaMetadata.decode({ source: image });
  if (!metadata || metadata.type !== StegaMetadata.StegaContentType.KEY) {
    throw new Error("Image does not contain valid KEY metadata");
  }
  return metadata.sessionId;
}

/**
 * Get the border width from a key image.
 * Throws if the image is not a valid key.
 */
export function getBorderWidth(
  image: HTMLImageElement | HTMLCanvasElement
): number {
  const metadata = StegaMetadata.decode({ source: image });
  if (!metadata || metadata.type !== StegaMetadata.StegaContentType.KEY) {
    throw new Error("Image does not contain valid KEY metadata");
  }
  return metadata.borderWidth;
}

/**
 * Get the full metadata from a key image.
 * Returns null if the image is not a valid key.
 */
export function getMetadata(
  image: HTMLImageElement | HTMLCanvasElement
): StegaMetadata.StegaMetadataKey | null {
  const metadata = StegaMetadata.decode({ source: image });
  if (!metadata || metadata.type !== StegaMetadata.StegaContentType.KEY) {
    return null;
  }
  return metadata;
}

/**
 * Create a tiled version of a key image at the specified dimensions.
 * Useful when you need to tile a smaller key to match encoded image dimensions.
 */
export function tile(
  key: HTMLImageElement | HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  const { width: keyWidth, height: keyHeight } = dimensionsFromSource(key);

  const { canvas, context } = createCanvasAndContext(targetWidth, targetHeight);

  // Tile the key across the canvas
  for (let y = 0; y < targetHeight; y += keyHeight) {
    for (let x = 0; x < targetWidth; x += keyWidth) {
      context.drawImage(key, x, y);
    }
  }

  return canvas;
}
