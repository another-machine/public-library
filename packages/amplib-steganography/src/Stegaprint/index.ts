/**
 * Stegaprint — a JPEG-survivable sibling to Stegassette.
 *
 * STGC assumes pixels come back exactly as written. STGP assumes they come back
 * approximately, through an unknown JPEG encoder at an unknown quality, possibly
 * more than once. See Stegaprint.md for the design and the phase 0 measurements
 * the defaults are derived from.
 *
 * This module is environment-agnostic: it moves StegaImageData in and out and
 * has no DOM, Node or codec dependency. Producing an actual JPEG is the
 * caller's job.
 */

export { capacity, decode, encode, fitSource } from "./container";
export type {
  Capacity,
  CapacityOptions,
  DecodeResult,
  EncodeOptions,
} from "./container";

export {
  CHUNK,
  EntryType,
  RECORD_SIZE,
  chunkBytes,
  chunksFor,
  mimeFor,
} from "./records";
export type {
  AudioParams,
  DecodedPrintEntry,
  DecodedRecord,
  PrintEntry,
} from "./records";

export {
  HEADER_SIZE,
  STGP_MAGIC,
  STGP_VERSION,
  packHeader,
  unpackHeader,
  HeaderError,
} from "./header";
export type { StgpHeader } from "./header";

export {
  DEFAULT_CARRIERS,
  DEFAULT_SAFETY,
  MEASURED_SER,
  P99_Q75,
  deltaForCarrier,
  deltasFor,
} from "./profile";

export { qimDecode, qimEncode, pairDecode, pairEncode, toGray, fromGray } from "./modulate";
export type { ModulateName } from "./modulate";

export { crc32 } from "./ecc";
export type { EccLevel } from "./ecc";

export { CORNER, HEADER_REPEAT, borderForHeader, checkCorners } from "./fiducial";

export { BLOCK, N, ZIGZAG, fdct, idct } from "./dct";
export { blockDims, planesToRgb, rgbToPlanes } from "./blocks";
export type { Planes, PlaneName } from "./blocks";

export { DEFAULT_CARRIERS as THEORY_CARRIERS, deltaFor, stepsZigzag } from "./quant";
