import { PermutationEngine } from "../../amplib-procedural-generation/src";
import * as Stega64 from "./Stega64";
import * as StegaMetadata from "./StegaMetadata";
import {
  createCanvasAndContext,
  createCanvasAndContextForImageWithMinimums,
  getContext,
} from "./utilities";

// =============================================================================
// Types
// =============================================================================

export type StegaCassetteBitDepth = 8 | 16 | 24;
export type StegaCassetteChannels = 1 | 2;

/**
 * The encoding type stored as a single string value in image metadata.
 * Format: "{method}" or "{method}-{layout}"
 */
export type StegaCassetteEncoding =
  | "additive"
  | "additive-columns"
  | "additive-rows"
  | "additive-quarters"
  | "subtractive"
  | "subtractive-columns"
  | "subtractive-rows"
  | "subtractive-quarters"
  | "difference"
  | "difference-columns"
  | "difference-rows"
  | "difference-quarters"
  | "bitshift"
  | "bitshift-columns"
  | "bitshift-rows"
  | "bitshift-quarters"
  | "noise"
  | "noise-columns"
  | "noise-rows"
  | "noise-quarters"
  | "solid"
  | "solid-columns"
  | "solid-rows"
  | "solid-quarters"
  | "alpha"
  | "alpha-columns"
  | "alpha-rows"
  | "alpha-quarters";

// Internal encoding method types (derived from encoding string)
type EncodingMethod =
  | "additive"
  | "subtractive"
  | "difference"
  | "bitshift"
  | "noise"
  | "solid"
  | "alpha";
type SpatialLayout = "none" | "columns" | "rows" | "quarters";

// =============================================================================
// Constants
// =============================================================================

/** 8-bit audio sample max value (254 steps for alpha, 255 for RGB) */
const SAMPLE_8BIT_MAX = 127;
const SAMPLE_8BIT_MAX_RGB = 127.5;

/** 16-bit audio sample max value */
const SAMPLE_16BIT_MAX = 32767.5;

/** 24-bit audio sample max value */
const SAMPLE_24BIT_MAX = 8388607.5;

/** Base for alpha encoding to avoid 0 values (premultiplied alpha issue) */
const ALPHA_BASE = 254;

// =============================================================================
// Encoding Config Helpers
// =============================================================================

interface EncodingConfig {
  method: EncodingMethod;
  layout: SpatialLayout;
  isAlpha: boolean;
  isSolid: boolean;
  isSpatial: boolean;
  hasVerticalBorder: boolean;
  hasHorizontalBorder: boolean;
}

/**
 * Parse an encoding string into its component parts.
 * The encoding is stored as a single value but we can derive method and layout from it.
 */
function parseEncoding(encoding: StegaCassetteEncoding): EncodingConfig {
  const hasColumns = encoding.endsWith("-columns");
  const hasRows = encoding.endsWith("-rows");
  const hasQuarters = encoding.endsWith("-quarters");

  const layout: SpatialLayout = hasQuarters
    ? "quarters"
    : hasColumns
    ? "columns"
    : hasRows
    ? "rows"
    : "none";

  // Extract method by removing layout suffix
  const methodStr = encoding.replace(/-(columns|rows|quarters)$/, "");
  const method = methodStr as EncodingMethod;

  const isAlpha = method === "alpha";
  const isSolid = method === "solid";
  const isSpatial = layout !== "none" || isSolid;

  return {
    method,
    layout,
    isAlpha,
    isSolid,
    isSpatial,
    hasVerticalBorder: hasColumns || hasQuarters,
    hasHorizontalBorder: hasRows || hasQuarters,
  };
}

/**
 * Get the internal border mode for canvas creation.
 */
function getInternalBorderMode(
  config: EncodingConfig
): "none" | "vertical" | "horizontal" | "cross" {
  if (config.layout === "quarters") return "cross";
  if (config.layout === "columns") return "vertical";
  if (config.layout === "rows") return "horizontal";
  return "none";
}

/**
 * Get the pixel multiplier for canvas sizing.
 * - Alpha: 3 (1 sample per pixel at 8-bit, need 3x for 24-bit)
 * - Solid: 1 (single reference pixel)
 * - Others: 2 (paired pixels for encode/decode)
 */
function getPixelMultiplier(config: EncodingConfig): number {
  if (config.isAlpha) return 3;
  if (config.isSolid) return 1;
  return 2;
}

/**
 * Calculate the loop increment based on encoding and bit depth.
 */
function calculateIncrement(
  config: EncodingConfig,
  bitDepth: StegaCassetteBitDepth
): number {
  if (config.isAlpha) {
    // Alpha: 1 sample per 1/2/3 pixels depending on bit depth
    return bitDepth === 8 ? 4 : bitDepth === 16 ? 8 : 12;
  }
  // Non-alpha: varies by bit depth and spatial mode
  return bitDepth === 16 ? (config.isSpatial ? 8 : 16) : 4;
}

/**
 * Calculate the midpoint for stereo channel separation.
 */
function calculateMidPoint(
  dataLength: number,
  canvasWidth: number,
  canvasHeight: number,
  borderWidth: number,
  config: EncodingConfig
): number {
  let midPoint = Math.floor(dataLength / 2);

  // Adjust for row-based layouts (except solid and alpha which handle it differently)
  if (
    (config.layout === "rows" || config.layout === "quarters") &&
    !config.isSolid &&
    !config.isAlpha
  ) {
    const midY = canvasHeight / 2;
    const topEnd = Math.ceil(midY - borderWidth / 2);
    const validRows = topEnd - borderWidth;
    const splitRow = borderWidth + validRows / 2;
    midPoint = Math.floor(splitRow) * canvasWidth * 4;
  }

  return midPoint;
}

// =============================================================================
// Encoder/Decoder Functions
// =============================================================================

type ByteEncoder = (
  byteEncode: number,
  byteSource: number,
  value: number
) => [number, number];

type ByteDecoder = (byteEncode: number, byteSource: number) => number;

function encodeAdditive(
  _byteEncode: number,
  byteSource: number,
  value: number
): [number, number] {
  return [(byteSource + value) % 256, byteSource];
}

function decodeAdditive(byteEncode: number, byteSource: number): number {
  return byteEncode < byteSource
    ? byteEncode + 256 - byteSource
    : byteEncode - byteSource;
}

function encodeSubtractive(
  _byteEncode: number,
  byteSource: number,
  value: number
): [number, number] {
  return [(byteSource - value + 256) % 256, byteSource];
}

function decodeSubtractive(byteEncode: number, byteSource: number): number {
  return byteSource < byteEncode
    ? byteSource + 256 - byteEncode
    : byteSource - byteEncode;
}

/**
 * Using existing values to travel the least distance,
 * return values for each byte where the mid point is the value 0-255.
 */
function encodeDifference(
  byteEncode: number,
  byteSource: number,
  value: number
): [number, number] {
  if (byteSource < byteEncode) {
    byteSource += 256;
  }
  const middle = Math.round((byteSource - byteEncode) / 2 + byteEncode);
  const distanceA = Math.ceil(value / 2);
  const distanceB = Math.floor(value / 2);

  return [(middle - distanceA + 256) % 256, (middle + distanceB) % 256];
}

function decodeDifference(byteEncode: number, byteSource: number): number {
  return byteSource < byteEncode
    ? byteSource + 256 - byteEncode
    : byteSource - byteEncode;
}

/** Rotating the "value" bits left by "byteSource" */
function encodeBitShift(
  _byteEncode: number,
  byteSource: number,
  value: number
): [number, number] {
  const shift = byteSource & 7;
  return [((value << shift) | (value >>> (8 - shift))) & 0xff, byteSource];
}

/** Rotating the "byteEncode" bits right by "byteSource" */
function decodeBitShift(byteEncode: number, byteSource: number): number {
  const shift = byteSource & 7;
  return ((byteEncode >>> shift) | (byteEncode << (8 - shift))) & 0xff;
}

/** Using source image as input for noise generation */
function encodeNoise(
  byteEncode: number,
  byteSource: number,
  value: number
): [number, number] {
  const space = Math.abs(byteEncode - byteSource);
  const maxSpace = 2 * Math.min(value, 255 - value);
  const usedSpace = Math.min(space, maxSpace);
  const stepA = Math.ceil(usedSpace * 0.5);
  const stepB = Math.floor(usedSpace * 0.5);
  return [(value - stepA + 256) % 256, (value + stepB) % 256];
}

function decodeNoise(byteEncode: number, byteSource: number): number {
  return Math.round(
    Math.abs(byteEncode - byteSource) / 2 + Math.min(byteEncode, byteSource)
  );
}

/** Get the encoder function for a given encoding method */
function getEncoder(method: EncodingMethod): ByteEncoder {
  switch (method) {
    case "additive":
    case "solid":
      return encodeAdditive;
    case "subtractive":
      return encodeSubtractive;
    case "difference":
      return encodeDifference;
    case "bitshift":
      return encodeBitShift;
    case "noise":
      return encodeNoise;
    case "alpha":
      // Alpha doesn't use byte encoders
      return encodeAdditive;
  }
}

/** Get the decoder function for a given encoding method */
function getDecoder(method: EncodingMethod): ByteDecoder {
  switch (method) {
    case "additive":
    case "solid":
      return decodeAdditive;
    case "subtractive":
      return decodeSubtractive;
    case "difference":
      return decodeDifference;
    case "bitshift":
      return decodeBitShift;
    case "noise":
      return decodeNoise;
    case "alpha":
      // Alpha doesn't use byte decoders
      return decodeAdditive;
  }
}

// =============================================================================
// Index Generator Types
// =============================================================================

interface PairedIndices {
  isSkipped: boolean;
  encodedIndex: number;
  sourceIndex: number;
  encodedIndexNext: number;
  sourceIndexNext: number;
}

interface AlphaIndices {
  isSkipped: boolean;
  alphaIndices: number[];
}

type IndexGenerator = (
  i: number,
  data: Uint8ClampedArray
) => PairedIndices | AlphaIndices;

// =============================================================================
// Unified Index Generator
// =============================================================================

interface IndexGeneratorConfig {
  width: number;
  height: number;
  borderWidth: number;
  bitDepth: StegaCassetteBitDepth;
  config: EncodingConfig;
}

/**
 * Creates an index generator based on the encoding configuration.
 * This unified function replaces the multiple separate generator functions.
 */
function createIndexGenerator({
  width,
  height,
  borderWidth,
  bitDepth,
  config,
}: IndexGeneratorConfig): IndexGenerator {
  const midX = width / 2;
  const midY = height / 2;
  const leftEnd = Math.ceil(midX - borderWidth / 2);
  const topEnd = Math.ceil(midY - borderWidth / 2);

  // For solid encoding, we need a key pixel
  const keyPixelIndex = config.isSolid
    ? (borderWidth * width + borderWidth) * 4
    : 0;

  // Precompute border detection function
  const isInBorder = (x: number, y: number): boolean => {
    // Outer border
    if (
      y < borderWidth ||
      y >= height - borderWidth ||
      x < borderWidth ||
      x >= width - borderWidth
    ) {
      return true;
    }

    // Internal borders for spatial layouts
    if (config.hasVerticalBorder && x >= leftEnd && x <= width - 1 - leftEnd) {
      return true;
    }
    if (config.hasHorizontalBorder && y >= topEnd && y <= height - 1 - topEnd) {
      return true;
    }

    return false;
  };

  // Alpha encoding generator
  if (config.isAlpha) {
    return (i: number, _data: Uint8ClampedArray): AlphaIndices => {
      const pxIndex = Math.floor(i / 4);
      const y = Math.floor(pxIndex / width);
      const x = pxIndex % width;

      return {
        isSkipped: isInBorder(x, y),
        alphaIndices: [i + 3, i + 7, i + 11],
      };
    };
  }

  // Solid encoding generator
  if (config.isSolid) {
    return (i: number, data: Uint8ClampedArray): PairedIndices => {
      const pxIndex = Math.floor(i / 4);
      const y = Math.floor(pxIndex / width);
      const x = pxIndex % width;

      const encodedIndexNext = i + 4;
      const isKey =
        i === keyPixelIndex ||
        (bitDepth === 16 && encodedIndexNext === keyPixelIndex);
      const isOpaque = data[i + 3] === 255;
      const isKeyOpaque = data[keyPixelIndex + 3] === 255;

      return {
        isSkipped: isInBorder(x, y) || isKey || !isOpaque || !isKeyOpaque,
        encodedIndex: i,
        sourceIndex: keyPixelIndex,
        encodedIndexNext,
        sourceIndexNext: keyPixelIndex,
      };
    };
  }

  // Non-tiled (none layout) - use adjacent pixels in data array
  if (config.layout === "none") {
    const widthIsOdd = (width - borderWidth * 2) % 2 !== 0;

    return (i: number, data: Uint8ClampedArray): PairedIndices => {
      const pxIndex = Math.floor(i / 4);
      const y = Math.floor(pxIndex / width);
      const x = pxIndex % width;

      const evenRowCheck = widthIsOdd || y % 2 === 0;
      const nextI = i + 4;
      const isOpaque = data[pxIndex * 4 + 3] === 255;
      const isOpaqueNext = data[pxIndex * 4 + 7] === 255;

      const isBorder =
        y < borderWidth ||
        y >= height - borderWidth ||
        x < borderWidth ||
        x >= width - borderWidth;
      const isBorderNext = x >= width - borderWidth - 1;

      // Skipped pixels contain the saved data, and are set in a prior loop.
      const sourceIndex = evenRowCheck ? nextI : i;
      const encodedIndex = evenRowCheck ? i : nextI;

      const isSkipped =
        isBorder ||
        isBorderNext ||
        !isOpaque ||
        !isOpaqueNext ||
        pxIndex % 2 !== 0 ||
        (i + 1) % 4 === 0;

      const pxIndexNext = Math.floor((i + 8) / 4);
      const yNext = Math.floor(pxIndexNext / width);
      const evenRowCheckNext = widthIsOdd || yNext % 2 === 0;
      const nextINext = i + 12;

      const sourceIndexNext = evenRowCheckNext ? nextINext : i + 8;
      const encodedIndexNext = evenRowCheckNext ? i + 8 : nextINext;

      return {
        isSkipped,
        encodedIndex,
        sourceIndex,
        encodedIndexNext,
        sourceIndexNext,
      };
    };
  }

  // Paired encoding generators (columns, rows, quarters)
  return (i: number, data: Uint8ClampedArray): PairedIndices => {
    const pxIndex = Math.floor(i / 4);
    const y = Math.floor(pxIndex / width);
    const x = pxIndex % width;

    // Calculate pair coordinates based on layout
    let pairX = x;
    let pairY = y;
    let isValidRegion = true;

    switch (config.layout) {
      case "columns": {
        pairX = width - 1 - x;
        const effectiveLeftEnd =
          bitDepth === 16
            ? Math.min(leftEnd, Math.floor(width / 2) - 1)
            : leftEnd;
        isValidRegion = x < effectiveLeftEnd;
        break;
      }
      case "rows": {
        pairY = height - 1 - y;
        isValidRegion = y < topEnd;
        break;
      }
      case "quarters": {
        pairX = width - 1 - x;
        pairY = height - 1 - y;
        isValidRegion = y < topEnd;
        break;
      }
    }

    // Calculate indices
    const index1 = i;
    const index2 = (pairY * width + pairX) * 4;

    // Next indices for 16-bit
    const nextI = i + 4;
    const pxIndexNext = Math.floor(nextI / 4);
    const yNext = Math.floor(pxIndexNext / width);
    const xNext = pxIndexNext % width;

    let pairXNext = xNext;
    let pairYNext = yNext;

    switch (config.layout) {
      case "columns":
        pairXNext = width - 1 - xNext;
        // For 16-bit columns, use adjacent pair
        if (bitDepth === 16) pairXNext = pairX - 1;
        break;
      case "rows":
        pairYNext = height - 1 - yNext;
        break;
      case "quarters":
        pairXNext = width - 1 - xNext;
        pairYNext = height - 1 - yNext;
        break;
    }

    const index1Next = nextI;
    const index2Next = (pairYNext * width + pairXNext) * 4;

    // Checkerboard pattern for encode/source alternation
    const effectiveX = bitDepth === 16 ? x / 2 : x;
    const swap = (Math.floor(effectiveX) + y) % 2 !== 0;

    const isOpaque1 = data[index1 + 3] === 255;
    const isOpaque2 = data[index2 + 3] === 255;

    return {
      isSkipped: isInBorder(x, y) || !isValidRegion || !isOpaque1 || !isOpaque2,
      encodedIndex: swap ? index2 : index1,
      sourceIndex: swap ? index1 : index2,
      encodedIndexNext: swap ? index2Next : index1Next,
      sourceIndexNext: swap ? index1Next : index2Next,
    };
  };
}

// =============================================================================
// Alpha Encoding/Decoding Helpers
// =============================================================================

/** Convert audio sample (-1 to 1) to alpha-safe byte value (1-255) */
function sampleToAlpha8(sample: number): number {
  return Math.floor((sample + 1) * SAMPLE_8BIT_MAX) + 1;
}

/** Convert alpha byte (1-255) back to audio sample (-1 to 1) */
function alpha8ToSample(value: number): number {
  return (value - 1) / SAMPLE_8BIT_MAX - 1;
}

/** Convert audio sample to two alpha-safe bytes (base-254 encoding) */
function sampleToAlpha16(sample: number): [number, number] {
  const value = Math.floor((sample + 1) * SAMPLE_16BIT_MAX);
  const highByte = Math.min(
    255,
    Math.max(1, Math.floor(value / ALPHA_BASE) + 1)
  );
  const lowByte = Math.min(255, Math.max(1, (value % ALPHA_BASE) + 1));
  return [highByte, lowByte];
}

/** Convert two alpha bytes back to audio sample */
function alpha16ToSample(high: number, low: number): number {
  const value = (high - 1) * ALPHA_BASE + (low - 1);
  return value / SAMPLE_16BIT_MAX - 1;
}

/** Convert audio sample to three alpha-safe bytes (base-254 encoding) */
function sampleToAlpha24(sample: number): [number, number, number] {
  const value = Math.floor((sample + 1) * SAMPLE_24BIT_MAX);
  const highByte = Math.min(
    255,
    Math.max(1, Math.floor(value / (ALPHA_BASE * ALPHA_BASE)) + 1)
  );
  const midByte = Math.min(
    255,
    Math.max(
      1,
      Math.floor((value % (ALPHA_BASE * ALPHA_BASE)) / ALPHA_BASE) + 1
    )
  );
  const lowByte = Math.min(255, Math.max(1, (value % ALPHA_BASE) + 1));
  return [highByte, midByte, lowByte];
}

/** Convert three alpha bytes back to audio sample */
function alpha24ToSample(high: number, mid: number, low: number): number {
  const value =
    (high - 1) * ALPHA_BASE * ALPHA_BASE + (mid - 1) * ALPHA_BASE + (low - 1);
  return value / SAMPLE_24BIT_MAX - 1;
}

// =============================================================================
// RGB Encoding/Decoding Helpers
// =============================================================================

/** Convert audio sample to RGB byte value (0-255) */
function sampleToRgb8(sample: number): number {
  return Math.floor((sample + 1) * SAMPLE_8BIT_MAX_RGB);
}

/** Convert RGB byte back to audio sample */
function rgb8ToSample(value: number): number {
  return value / SAMPLE_8BIT_MAX_RGB - 1;
}

/** Convert audio sample to 16-bit value */
function sampleTo16bit(sample: number): number {
  return Math.floor((sample + 1) * SAMPLE_16BIT_MAX);
}

/** Convert 16-bit value back to audio sample */
function value16ToSample(value: number): number {
  return value / SAMPLE_16BIT_MAX - 1;
}

/** Convert audio sample to 24-bit value */
function sampleTo24bit(sample: number): number {
  return Math.floor((sample + 1) * SAMPLE_24BIT_MAX);
}

/** Convert 24-bit value back to audio sample */
function value24ToSample(value: number): number {
  return value / SAMPLE_24BIT_MAX - 1;
}

// =============================================================================
// Permutation Helpers
// =============================================================================

/**
 * Apply key-based permutation to audio channels.
 */
function applyPermutation(
  leftChannel: Float32Array,
  rightChannel: Float32Array | null,
  key: string | HTMLImageElement | HTMLCanvasElement
): {
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer> | null;
} {
  const keyString = extractKeyString(key);

  const leftPermutation = new PermutationEngine({
    seed: keyString,
    length: leftChannel.length,
  });
  const left = new Float32Array(
    leftPermutation.permute(Array.from(leftChannel))
  );

  let right: Float32Array<ArrayBuffer> | null = null;
  if (rightChannel) {
    const rightPermutation = new PermutationEngine({
      seed: keyString,
      length: rightChannel.length,
    });
    right = new Float32Array(
      rightPermutation.permute(Array.from(rightChannel))
    );
  }

  return { left, right };
}

/**
 * Apply inverse permutation to decoded audio channels.
 */
function reversePermutation(
  leftResult: Float32Array,
  rightResult: Float32Array | null,
  key: string | HTMLImageElement | HTMLCanvasElement
): {
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer> | null;
} {
  const keyString = extractKeyString(key);

  const leftPermutation = new PermutationEngine({
    seed: keyString,
    length: leftResult.length,
  });
  const left = new Float32Array(
    leftPermutation.unpermute(Array.from(leftResult))
  );

  let right: Float32Array<ArrayBuffer> | null = null;
  if (rightResult) {
    const rightPermutation = new PermutationEngine({
      seed: keyString,
      length: rightResult.length,
    });
    right = new Float32Array(
      rightPermutation.unpermute(Array.from(rightResult))
    );
  }

  return { left, right };
}

/**
 * Extract a key string from either a string or an image with Stega64-encoded key.
 */
function extractKeyString(
  key: string | HTMLImageElement | HTMLCanvasElement
): string {
  if (typeof key === "string") {
    return key;
  }

  try {
    const metadata = StegaMetadata.decode({ source: key });
    if (metadata?.type === StegaMetadata.StegaContentType.STRING) {
      const decoded = Stega64.decode({
        source: key,
        encoding: metadata.encoding,
        borderWidth: metadata.borderWidth,
      });
      if (decoded && decoded.length > 0) {
        return decoded.join("");
      }
    }
  } catch {
    // If decoding fails, throw error below
  }

  throw new Error(
    "Invalid key: Image must contain Stega64-encoded string data"
  );
}

// =============================================================================
// Alpha Encoding Implementation
// =============================================================================

function encodeAlpha(
  data: Uint8ClampedArray,
  leftChannel: Float32Array,
  rightChannel: Float32Array,
  stereo: boolean,
  bitDepth: StegaCassetteBitDepth,
  indexGenerator: IndexGenerator,
  increment: number,
  midPoint: number
): void {
  let leftAudioIndex = 0;
  let rightAudioIndex = 0;

  for (let i = 0; i < data.length; i += increment) {
    const isBottomHalf = stereo && i >= midPoint;
    const { isSkipped, alphaIndices } = indexGenerator(i, data) as AlphaIndices;
    const currentBuffer = isBottomHalf ? rightChannel : leftChannel;
    const currentIndex = isBottomHalf ? rightAudioIndex : leftAudioIndex;

    if (!isSkipped && currentIndex < currentBuffer.length) {
      const sample = currentBuffer[currentIndex];

      if (bitDepth === 8) {
        data[alphaIndices[0]] = sampleToAlpha8(sample);
      } else if (bitDepth === 16) {
        const [high, low] = sampleToAlpha16(sample);
        data[alphaIndices[0]] = high;
        data[alphaIndices[1]] = low;
      } else if (bitDepth === 24) {
        const [high, mid, low] = sampleToAlpha24(sample);
        data[alphaIndices[0]] = high;
        data[alphaIndices[1]] = mid;
        data[alphaIndices[2]] = low;
      }

      if (isBottomHalf) {
        rightAudioIndex++;
      } else {
        leftAudioIndex++;
      }
    }
  }
}

function decodeAlpha(
  data: Uint8ClampedArray,
  leftSamples: number[],
  rightSamples: number[],
  stereo: boolean,
  bitDepth: StegaCassetteBitDepth,
  indexGenerator: IndexGenerator,
  increment: number,
  midPoint: number
): void {
  for (let i = 0; i < data.length; i += increment) {
    const isBottomHalf = stereo && i >= midPoint;
    const currentSamples = isBottomHalf ? rightSamples : leftSamples;
    const { isSkipped, alphaIndices } = indexGenerator(i, data) as AlphaIndices;

    if (!isSkipped) {
      if (bitDepth === 8) {
        currentSamples.push(alpha8ToSample(data[alphaIndices[0]]));
      } else if (bitDepth === 16) {
        currentSamples.push(
          alpha16ToSample(data[alphaIndices[0]], data[alphaIndices[1]])
        );
      } else if (bitDepth === 24) {
        currentSamples.push(
          alpha24ToSample(
            data[alphaIndices[0]],
            data[alphaIndices[1]],
            data[alphaIndices[2]]
          )
        );
      }
    }
  }
}

// =============================================================================
// Paired (RGB) Encoding Implementation
// =============================================================================

function encodePaired(
  data: Uint8ClampedArray,
  leftChannel: Float32Array,
  rightChannel: Float32Array,
  stereo: boolean,
  bitDepth: StegaCassetteBitDepth,
  encoder: ByteEncoder,
  indexGenerator: IndexGenerator,
  increment: number,
  midPoint: number
): void {
  let leftAudioIndex = 0;
  let rightAudioIndex = 0;

  for (let i = 0; i < data.length; i += increment) {
    const isBottomHalf = stereo && i >= midPoint;
    const indices = indexGenerator(i, data) as PairedIndices;
    const {
      isSkipped,
      encodedIndex,
      sourceIndex,
      encodedIndexNext,
      sourceIndexNext,
    } = indices;
    const currentBuffer = isBottomHalf ? rightChannel : leftChannel;
    const currentIndex = isBottomHalf ? rightAudioIndex : leftAudioIndex;

    if (!isSkipped) {
      if (currentIndex >= currentBuffer.length) {
        data[encodedIndex + 3] = 250;
        if (bitDepth === 16) data[encodedIndexNext + 3] = 250;
        continue;
      }

      if (bitDepth === 8) {
        for (let j = 0; j < 3 && currentIndex + j < currentBuffer.length; j++) {
          const sample = currentBuffer[currentIndex + j];
          const value = sampleToRgb8(sample);
          const [valueEncoded, valueSource] = encoder(
            data[encodedIndex + j],
            data[sourceIndex + j],
            value
          );
          data[encodedIndex + j] = valueEncoded;
          data[sourceIndex + j] = valueSource;
        }
        data[encodedIndex + 3] = 255;
        data[sourceIndex + 3] = 255;

        if (isBottomHalf) {
          rightAudioIndex += 3;
        } else {
          leftAudioIndex += 3;
        }
      } else if (bitDepth === 16) {
        const sample1 = currentBuffer[currentIndex] || 0;
        const sample2 = currentBuffer[currentIndex + 1] || 0;
        const sample3 = currentBuffer[currentIndex + 2] || 0;

        const value1 = sampleTo16bit(sample1);
        const value2 = sampleTo16bit(sample2);
        const value3 = sampleTo16bit(sample3);

        const [
          [valueEncoded1a, valueSource1a],
          [valueEncoded1b, valueSource1b],
          [valueEncoded2a, valueSource2a],
          [valueEncoded2b, valueSource2b],
          [valueEncoded3a, valueSource3a],
          [valueEncoded3b, valueSource3b],
        ] = [
          encoder(
            data[encodedIndex],
            data[sourceIndex],
            Math.floor(value1 / 256)
          ),
          encoder(data[encodedIndex + 1], data[sourceIndex + 1], value1 % 256),
          encoder(
            data[encodedIndex + 2],
            data[sourceIndex + 2],
            Math.floor(value2 / 256)
          ),
          encoder(data[encodedIndexNext], data[sourceIndexNext], value2 % 256),
          encoder(
            data[encodedIndexNext + 1],
            data[sourceIndexNext + 1],
            Math.floor(value3 / 256)
          ),
          encoder(
            data[encodedIndexNext + 2],
            data[sourceIndexNext + 2],
            value3 % 256
          ),
        ];

        data[encodedIndex] = valueEncoded1a;
        data[sourceIndex] = valueSource1a;
        data[encodedIndex + 1] = valueEncoded1b;
        data[sourceIndex + 1] = valueSource1b;
        data[encodedIndex + 2] = valueEncoded2a;
        data[sourceIndex + 2] = valueSource2a;
        data[encodedIndex + 3] = 255;
        data[sourceIndex + 3] = 255;

        data[encodedIndexNext] = valueEncoded2b;
        data[sourceIndexNext] = valueSource2b;
        data[encodedIndexNext + 1] = valueEncoded3a;
        data[sourceIndexNext + 1] = valueSource3a;
        data[encodedIndexNext + 2] = valueEncoded3b;
        data[sourceIndexNext + 2] = valueSource3b;
        data[encodedIndexNext + 3] = 255;
        data[sourceIndexNext + 3] = 255;

        if (isBottomHalf) {
          rightAudioIndex += 3;
        } else {
          leftAudioIndex += 3;
        }
      } else if (bitDepth === 24) {
        const sample = currentBuffer[currentIndex];
        const value = sampleTo24bit(sample);

        const [
          [valueEncoded1a, valueSource1a],
          [valueEncoded1b, valueSource1b],
          [valueEncoded1c, valueSource1c],
        ] = [
          encoder(data[encodedIndex], data[sourceIndex], (value >> 16) & 0xff),
          encoder(
            data[encodedIndex + 1],
            data[sourceIndex + 1],
            (value >> 8) & 0xff
          ),
          encoder(data[encodedIndex + 2], data[sourceIndex + 2], value & 0xff),
        ];

        data[encodedIndex] = valueEncoded1a;
        data[sourceIndex] = valueSource1a;
        data[encodedIndex + 1] = valueEncoded1b;
        data[sourceIndex + 1] = valueSource1b;
        data[encodedIndex + 2] = valueEncoded1c;
        data[sourceIndex + 2] = valueSource1c;
        data[encodedIndex + 3] = 255;
        data[sourceIndex + 3] = 255;

        if (isBottomHalf) {
          rightAudioIndex++;
        } else {
          leftAudioIndex++;
        }
      }
    }
  }
}

function decodePaired(
  data: Uint8ClampedArray,
  leftSamples: number[],
  rightSamples: number[],
  stereo: boolean,
  bitDepth: StegaCassetteBitDepth,
  decoder: ByteDecoder,
  indexGenerator: IndexGenerator,
  increment: number,
  midPoint: number
): void {
  for (let i = 0; i < data.length; i += increment) {
    const isBottomHalf = stereo && i >= midPoint;
    const currentSamples = isBottomHalf ? rightSamples : leftSamples;
    const indices = indexGenerator(i, data) as PairedIndices;
    const {
      isSkipped,
      encodedIndex,
      sourceIndex,
      encodedIndexNext,
      sourceIndexNext,
    } = indices;

    if (!isSkipped && data[encodedIndex + 3] === 255) {
      if (bitDepth === 8) {
        for (let j = 0; j < 3; j++) {
          const value = decoder(data[encodedIndex + j], data[sourceIndex + j]);
          const sample = rgb8ToSample(value);
          if (sample !== 0) {
            currentSamples.push(sample);
          }
        }
      } else if (bitDepth === 16) {
        const samples = [
          decoder(data[encodedIndex], data[sourceIndex]) * 256 +
            decoder(data[encodedIndex + 1], data[sourceIndex + 1]),
          decoder(data[encodedIndex + 2], data[sourceIndex + 2]) * 256 +
            decoder(data[encodedIndexNext], data[sourceIndexNext]),
          decoder(data[encodedIndexNext + 1], data[sourceIndexNext + 1]) * 256 +
            decoder(data[encodedIndexNext + 2], data[sourceIndexNext + 2]),
        ].map(value16ToSample);

        currentSamples.push(...samples);
      } else if (bitDepth === 24) {
        const value =
          (decoder(data[encodedIndex], data[sourceIndex]) << 16) |
          (decoder(data[encodedIndex + 1], data[sourceIndex + 1]) << 8) |
          decoder(data[encodedIndex + 2], data[sourceIndex + 2]);

        currentSamples.push(value24ToSample(value));
      }
    }
  }
}

// =============================================================================
// Public API
// =============================================================================

interface BaseEncodeOptions {
  audioBuffers: Float32Array[];
  sampleRate: number;
  bitDepth: StegaCassetteBitDepth;
  encoding: StegaCassetteEncoding;
  encodeMetadata?: boolean;
  aspectRatio?: number;
  borderWidth?: number;
  music?: { bpm: number; semitones: number };
  /**
   * Optional encryption key. Can be a string or an image containing Stega64-encoded text.
   * When provided, audio samples are scrambled using a deterministic permutation derived from the key.
   * The encoded image will be visually identical and playable, but will sound like noise without the correct key.
   */
  key?: string | HTMLImageElement | HTMLCanvasElement;
}

export type EncodeOptions = BaseEncodeOptions &
  (
    | { source: HTMLImageElement | HTMLCanvasElement; sources?: never }
    | { source?: never; sources: (HTMLImageElement | HTMLCanvasElement)[] }
  );

interface BaseDecodeOptions {
  bitDepth: StegaCassetteBitDepth;
  channels: StegaCassetteChannels;
  encoding: StegaCassetteEncoding;
  borderWidth?: number;
  /**
   * Optional decryption key. Must match the key used during encoding.
   * Can be a string or an image containing Stega64-encoded text.
   */
  key?: string | HTMLImageElement | HTMLCanvasElement;
}

export type DecodeOptions = BaseDecodeOptions &
  (
    | { source: HTMLImageElement | HTMLCanvasElement; sources?: never }
    | { source?: never; sources: (HTMLImageElement | HTMLCanvasElement)[] }
  );

export function encode(
  options: BaseEncodeOptions & {
    source: HTMLImageElement | HTMLCanvasElement;
    sources?: never;
  }
): HTMLCanvasElement;
export function encode(
  options: BaseEncodeOptions & {
    source?: never;
    sources: (HTMLImageElement | HTMLCanvasElement)[];
  }
): HTMLCanvasElement[];
export function encode(
  options: EncodeOptions
): HTMLCanvasElement | HTMLCanvasElement[] {
  const {
    audioBuffers,
    sampleRate,
    bitDepth,
    encoding,
    encodeMetadata,
    aspectRatio,
    borderWidth = 0,
    music,
    key,
  } = options;

  // Handle multiple sources (split encoding)
  if (options.sources) {
    const source = options.sources;
    const count = source.length;
    const splitBuffers = audioBuffers.map((channel) => {
      const splits = Array.from({ length: count }, () => [] as number[]);
      for (let i = 0; i < channel.length; i++) {
        splits[i % count].push(channel[i]);
      }
      return splits.map((s) => new Float32Array(s));
    });

    const buffersPerImage = Array.from({ length: count }, (_, i) => {
      return audioBuffers.map(
        (_, channelIndex) => splitBuffers[channelIndex][i]
      );
    });

    return buffersPerImage.map((buffers, i) => {
      const { sources, ...rest } = options;
      return encode({
        ...rest,
        source: source[i],
        audioBuffers: buffers,
      }) as HTMLCanvasElement;
    });
  }

  const source = options.source;
  const config = parseEncoding(encoding);

  // Prepare audio channels
  const stereo = audioBuffers.length > 1;
  let leftChannel = audioBuffers[0];
  let rightChannel = stereo ? audioBuffers[1] : audioBuffers[0];

  // Apply key-based permutation if provided
  if (key) {
    const permuted = applyPermutation(
      leftChannel,
      stereo ? rightChannel : null,
      key
    );
    leftChannel = permuted.left;
    if (permuted.right) rightChannel = permuted.right;
  }

  // Calculate canvas requirements
  const samples =
    audioBuffers.length * Math.max(...audioBuffers.map((a) => a.length));
  const messageLength = samples * (bitDepth / 8);

  // Create canvas with appropriate sizing
  const initialCanvas = createCanvasAndContextForImageWithMinimums({
    source: source as HTMLImageElement | HTMLCanvasElement,
    messageLength,
    minHeight: 0,
    minWidth: 0,
    aspectRatio,
    borderWidth,
    internalBorderMode: getInternalBorderMode(config),
    pixelMultiplier: getPixelMultiplier(config),
  });

  // Optionally encode metadata
  const canvas = encodeMetadata
    ? StegaMetadata.encode({
        source: initialCanvas.canvas,
        metadata: music
          ? {
              type: StegaMetadata.StegaContentType.MUSIC,
              sampleRate,
              bitDepth,
              channels: stereo ? 2 : 1,
              encoding,
              borderWidth,
              bpm: music.bpm,
              semitones: music.semitones,
            }
          : {
              type: StegaMetadata.StegaContentType.AUDIO,
              sampleRate,
              bitDepth,
              channels: stereo ? 2 : 1,
              encoding,
              borderWidth,
            },
      })
    : initialCanvas.canvas;

  const context = getContext(canvas);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Create index generator and calculate parameters
  const indexGenerator = createIndexGenerator({
    width: canvas.width,
    height: canvas.height,
    borderWidth,
    bitDepth,
    config,
  });

  const increment = calculateIncrement(config, bitDepth);
  const midPoint = calculateMidPoint(
    data.length,
    canvas.width,
    canvas.height,
    borderWidth,
    config
  );

  // Encode audio data
  if (config.isAlpha) {
    encodeAlpha(
      data,
      leftChannel,
      rightChannel,
      stereo,
      bitDepth,
      indexGenerator,
      increment,
      midPoint
    );
  } else {
    const encoder = getEncoder(config.method);
    encodePaired(
      data,
      leftChannel,
      rightChannel,
      stereo,
      bitDepth,
      encoder,
      indexGenerator,
      increment,
      midPoint
    );
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

export function decode(options: DecodeOptions): Float32Array[] {
  const { encoding, bitDepth, channels = 1, borderWidth = 0, key } = options;

  // Handle multiple sources (split decoding)
  if (options.sources) {
    const source = options.sources;
    const { sources, ...rest } = options;
    const decodedBuffers = source.map((s) => decode({ ...rest, source: s }));

    const combinedChannels: Float32Array[] = [];
    const channelCount = decodedBuffers[0].length;
    const count = source.length;

    for (let c = 0; c < channelCount; c++) {
      const channelParts = decodedBuffers.map((d) => d[c]);
      const totalLength = channelParts.reduce(
        (acc, part) => acc + part.length,
        0
      );
      const result = new Float32Array(totalLength);

      for (let i = 0; i < count; i++) {
        const part = channelParts[i];
        for (let j = 0; j < part.length; j++) {
          const targetIndex = j * count + i;
          if (targetIndex < totalLength) {
            result[targetIndex] = part[j];
          }
        }
      }
      combinedChannels.push(result);
    }
    return combinedChannels;
  }

  const singleSource = options.source;
  const config = parseEncoding(encoding);
  const stereo = channels === 2;

  // Get source dimensions
  const relativeWidth =
    "naturalWidth" in singleSource
      ? singleSource.naturalWidth
      : singleSource.width;
  const relativeHeight =
    "naturalHeight" in singleSource
      ? singleSource.naturalHeight
      : singleSource.height;

  // Create canvas and draw source
  const { canvas, context } = createCanvasAndContext(
    relativeWidth,
    relativeHeight
  );
  context.drawImage(singleSource, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Create index generator and calculate parameters
  const indexGenerator = createIndexGenerator({
    width: canvas.width,
    height: canvas.height,
    borderWidth,
    bitDepth,
    config,
  });

  const increment = calculateIncrement(config, bitDepth);
  const midPoint = calculateMidPoint(
    data.length,
    canvas.width,
    canvas.height,
    borderWidth,
    config
  );

  // Decode audio data
  const leftSamples: number[] = [];
  const rightSamples: number[] = [];

  if (config.isAlpha) {
    decodeAlpha(
      data,
      leftSamples,
      rightSamples,
      stereo,
      bitDepth,
      indexGenerator,
      increment,
      midPoint
    );
  } else {
    const decoder = getDecoder(config.method);
    decodePaired(
      data,
      leftSamples,
      rightSamples,
      stereo,
      bitDepth,
      decoder,
      indexGenerator,
      increment,
      midPoint
    );
  }

  let leftResult = new Float32Array(leftSamples);
  let rightResult = stereo ? new Float32Array(rightSamples) : null;

  // Apply inverse permutation if key provided
  if (key) {
    const unpermuted = reversePermutation(leftResult, rightResult, key);
    leftResult = unpermuted.left;
    rightResult = unpermuted.right;
  }

  return stereo && rightResult ? [leftResult, rightResult] : [leftResult];
}
