/**
 * Stegassette — pure (environment-agnostic) core exports.
 *
 * This module has no DOM or Node dependencies. Browser callers should import
 * from `./browser` which adds the `encode`/`decode` functions that accept
 * HTMLImageElement/HTMLCanvasElement.
 * Node callers should use `src/node.ts` which adds pngjs file I/O.
 */

// ---- types ---------------------------------------------------
export type {
  AudioMimeParams,
  ChannelIndex,
  ChannelPlan,
  ChannelSlot,
  CombineName,
  DecodedEntry,
  EncodeOptions,
  Entry,
  KeymapName,
  PackMode,
  StegaImageData,
  StgcOpts,
  TraversalName,
  TraversalParams,
} from "./types";

// ---- pixel primitives ----------------------------------------
export {
  Img,
  borderPixelCount,
  dataPixelCount,
  getBorderPixels,
  isBorderPixel,
  isDataPixel,
} from "./Img";

// ---- combine ops ---------------------------------------------
export {
  COMBINE,
  COMBINE_NAMES,
  ENCODE_OP,
  KEY_MOD,
  LOSSLESS_COMBINES,
} from "./combine";

// ---- keymaps -------------------------------------------------
export { KEYMAP, KEYMAP_NAMES } from "./keymap";

// ---- traversals ----------------------------------------------
export { TRAVERSAL_NAMES, getPath, getPathIndices } from "./traversal";

// ---- channel plan --------------------------------------------
export {
  CHANNEL_NAMES,
  PACK_NAMES,
  isDefaultPlan,
  normalizeChannelPlan,
  parseChannelPlan,
  serializeChannelPlan,
} from "./channelPlan";

// ---- header --------------------------------------------------
export {
  STGC_MAGIC,
  STGC_VERSION,
  applyAlphaHeader,
  buildDescriptor,
  packStgcHeader,
  parseDescriptor,
  unpackStgcHeaderAlpha,
} from "./header";
export type { ParsedHeader } from "./header";

// ---- entry table + audio mimetype ----------------------------
export {
  buildAudioMime,
  buildInteriorStream,
  containerInteriorBytes,
  entryTableSize,
  parseAudioMime,
  parseEntryTable,
} from "./entries";

// ---- PCM conversion & channel layouts ------------------------
export {
  computeRevealOrder,
  float32ToPcm,
  layoutChannels,
  peakNormalize,
  toFloat32,
  unlayoutChannels,
} from "./pcm";

// ---- image geometry ------------------------------------------
export {
  autoScaleImg,
  cropImg,
  interiorDims,
  resolveBorderWidth,
  scaleImg,
} from "./geometry";

// ---- audio convenience helpers -------------------------------
export {
  buildAudioEntry,
  isAudioEntry,
  parseAudioEntry,
} from "./audio";
export type { BuildAudioEntryParams, ParsedAudioEntry } from "./audio";

// ---- cover reconstruction ------------------------------------
export { reconstructCover, KEY_PRESERVING } from "./reconstruct";

// ---- pure container (StegaImageData ↔ StegaImageData) --------
import { Img } from "./Img";
import { encodeContainer, decodeContainer } from "./container";
import { autoScaleImg, resolveBorderWidth } from "./geometry";
import { normalizeChannelPlan, isDefaultPlan, serializeChannelPlan } from "./channelPlan";
import { containerInteriorBytes, entryTableSize } from "./entries";
import { packStgcHeader } from "./header";
import type { CombineName, DecodedEntry, EncodeOptions, KeymapName, StegaImageData, StgcOpts, TraversalParams } from "./types";

/**
 * Estimate the STGC header byte length for the given encode options.
 * Used to enforce a minimum canvas width so the header always fits.
 */
function estimatedHeaderLength(
  opts: Partial<EncodeOptions>,
  plan: ReturnType<typeof normalizeChannelPlan>,
  params: TraversalParams,
  entryCount: number
): number {
  return packStgcHeader({
    combine: (opts.combine || "xor") as CombineName,
    keymap: (opts.keymap || "adjacent") as KeymapName,
    traversal: opts.traversal || "raster",
    interiorByteLength: 0, // doesn't affect length
    entryCount,
    params,
    ch: isDefaultPlan(plan) || plan.broadcast
      ? undefined
      : serializeChannelPlan(plan.slots),
    pad: plan.pad,
    pack: plan.pack,
    // nibble pairs: two border pixels per header byte, plus the ring-start
    // B bootstrap and even-offset alignment
  }).length * 2 + 8;
}

export interface EncodeImageDataOptions extends EncodeOptions {
  source: StegaImageData;
}

export interface DecodeImageDataOptions {
  source: StegaImageData;
}

/**
 * Encode entries into a source image buffer.
 * Auto-scales the source to fit all entries at the requested border/aspect.
 * Returns a new StegaImageData — the source is not modified.
 */
export function encodeImageData({
  source,
  entries,
  border = 0,
  aspectRatio,
  ...opts
}: EncodeImageDataOptions): StegaImageData {
  const src = new Img(source.width, source.height, source.data);

  // Resolve channel plan now so we know bytesPerPixel and pad for sizing
  const plan =
    opts.plan ??
    normalizeChannelPlan(
      { combine: opts.combine, pack: opts.pack, channels: opts.channels },
      opts.bytesPerSample ?? 3,
      entryTableSize(entries)
    );

  const aspect = aspectRatio ?? src.width / src.height;
  const totalBytes = containerInteriorBytes(entries) + plan.pad;
  const dataPx = Math.ceil(totalBytes / plan.bytesPerPixel);
  const B = resolveBorderWidth(border, dataPx, aspect);

  // Merge traversal/keymap params for header-length estimation
  const params: TraversalParams = {
    ...(opts.params || {}),
    ...(opts.seed != null ? { seed: opts.seed } : {}),
    ...(opts.a != null ? { a: opts.a } : {}),
    ...(opts.b != null ? { b: opts.b } : {}),
    ...(opts.kx != null ? { kx: opts.kx } : {}),
    ...(opts.ky != null ? { ky: opts.ky } : {}),
  };
  const minFullWidth = estimatedHeaderLength(opts, plan, params, entries.length);

  const scaled = autoScaleImg(src, totalBytes, B, aspectRatio ?? null, plan.bytesPerPixel, minFullWidth);

  return encodeContainer(entries, scaled, { ...opts, borderWidth: B, plan }, scaled);
}

/**
 * Decode entries from an encoded image buffer.
 * The image decodes itself (cover image is also the key — standard STGC usage).
 */
export function decodeImageData({
  source,
}: DecodeImageDataOptions): { entries: DecodedEntry[]; opts: StgcOpts } {
  const img = new Img(source.width, source.height, source.data);
  return decodeContainer(img);
}
