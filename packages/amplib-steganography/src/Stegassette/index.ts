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
export {
  KEYMAP,
  KEYMAP_NAMES,
  KEYLESS_KEYMAPS,
  KEY_FIELD,
  isKeylessKeymap,
  resolveKeyField,
  resolveKeymapName,
} from "./keymap";
export type { KeyFieldFn, LocatingKeymapName } from "./keymap";

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
  CODEC_VERSION,
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

// ---- encode-side audio pipeline (env-agnostic tail) ----------
export {
  NORMALIZE_DEFAULT_DB,
  deinterleave,
  prepareAudioEntry,
  resolveAudioRates,
  resolveNormalize,
} from "./audioPrep";
export type {
  AudioRateMode,
  PrepareAudioEntryParams,
  ResolveAudioRatesParams,
  ResolvedAudioRates,
} from "./audioPrep";

// ---- cover reconstruction ------------------------------------
export { reconstructCover, KEY_PRESERVING } from "./reconstruct";

// ---- collections (many stegassettes that belong together) ------
export {
  COLLECTION_STEG,
  decryptBytes,
  encodeStegassette,
  encryptBytes,
  fromBase64,
  hexId,
  importKey,
  joinParts,
  newKey,
  slug,
  splitStream,
  toBase64,
} from "./collection";
export type { CollectionSteg, EncryptedBytes } from "./collection";

// ---- pure container (StegaImageData ↔ StegaImageData) --------
import { Img } from "./Img";
import { encodeContainer, decodeContainer } from "./container";
import { isKeylessKeymap, resolveKeymapName } from "./keymap";

// The container primitives are public: callers that size their own canvas
// (the lab's editor and batch runner both do, via autoScaleImg) need to
// encode at this level rather than through encodeImageData's auto-scaling.
// NOTE the argument order differs from the lab's steg-core.js, which takes
// (entries, srcImg, keyImg, opts) — here opts comes third.
export { encodeContainer, decodeContainer };
import { autoScaleImg, resolveBorderWidth } from "./geometry";
import { normalizeChannelPlan, isDefaultPlan, serializeChannelPlan } from "./channelPlan";
import { containerInteriorBytes, entryTableSize } from "./entries";
import { packStgcHeader } from "./header";
import type { CombineName, DecodedEntry, EncodeOptions, KeymapName, StegaImageData, StgcOpts, TraversalParams } from "./types";

/**
 * Border-ring pixels the STGC header needs for the given encode options.
 *
 * Doubles as the minimum canvas width: a tiny payload would otherwise size the
 * canvas below what the header itself requires, and encoding would refuse.
 * Callers that size their own canvas need this before they know the payload,
 * which is possible because the header's length depends only on the effect
 * settings, not the data.
 *
 * Exported as `stgcHeaderWidth` to match the name the lab's steg-core.js uses,
 * so call sites migrating from it do not have to change.
 */
export function stgcHeaderWidth(
  opts: Partial<EncodeOptions> = {}
): number {
  const plan =
    opts.plan ??
    normalizeChannelPlan(
      { combine: opts.combine, pack: opts.pack, channels: opts.channels },
      opts.bytesPerSample ?? 3,
      0
    );
  const params: TraversalParams = { ...(opts.params || {}) };
  // Widest possible seed, so this stays a floor rather than an estimate.
  if ((opts.traversal || "raster") === "fisher-yates" && params.seed == null) {
    params.seed = 0xffffffff;
  }
  return estimatedHeaderPixels(opts, plan, params, 0);
}

/**
 * Estimate the STGC header byte length for the given encode options.
 * Used to enforce a minimum canvas width so the header always fits.
 */
function estimatedHeaderPixels(
  opts: Partial<EncodeOptions>,
  plan: ReturnType<typeof normalizeChannelPlan>,
  params: TraversalParams,
  entryCount: number
): number {
  return packStgcHeader({
    combine: (opts.combine || "xor") as CombineName,
    keymap: resolveKeymapName(opts),
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

/** Border-ring pixel count, clamped for borders thicker than the image. */
function ringPixelCount(W: number, H: number, B: number): number {
  return W * H - Math.max(0, W - 2 * B) * Math.max(0, H - 2 * B);
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

  // Keyless reserves no key pixels, so every sizing decision below
  // needs it: half the interior area, and a border fraction measured
  // against that smaller canvas.
  const keyless = isKeylessKeymap(resolveKeymapName(opts));
  const aspect = aspectRatio ?? src.width / src.height;
  const totalBytes = containerInteriorBytes(entries) + plan.pad;
  const dataPx = Math.ceil(totalBytes / plan.bytesPerPixel);
  let B = resolveBorderWidth(border, dataPx, aspect, keyless);

  // Merge traversal/keymap params for header-length estimation
  const params: TraversalParams = {
    ...(opts.params || {}),
    ...(opts.seed != null ? { seed: opts.seed } : {}),
    ...(opts.a != null ? { a: opts.a } : {}),
    ...(opts.b != null ? { b: opts.b } : {}),
    ...(opts.kx != null ? { kx: opts.kx } : {}),
    ...(opts.ky != null ? { ky: opts.ky } : {}),
  };
  const headerPx = estimatedHeaderPixels(opts, plan, params, entries.length);

  // The canvas is sized by the payload alone; when the border ring cannot
  // hold the header, thicken the border instead of growing the image.
  let scaled = autoScaleImg(src, totalBytes, B, aspectRatio ?? null, plan.bytesPerPixel, 1, keyless);
  while (ringPixelCount(scaled.width, scaled.height, B) < headerPx) {
    if (B > 255) throw new Error("STGC header does not fit any border");
    B += 1;
    scaled = autoScaleImg(src, totalBytes, B, aspectRatio ?? null, plan.bytesPerPixel, 1, keyless);
  }

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
