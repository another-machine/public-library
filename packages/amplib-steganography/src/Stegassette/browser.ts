/**
 * Browser adapter for Stegassette.
 *
 * Adds `encode` and `decode` overloads that accept HTMLImageElement /
 * HTMLCanvasElement and return HTMLCanvasElement, matching the ergonomics of
 * the other modules in this package (Stega64, StegaCassette, etc.).
 *
 * All pure-core exports are re-exported here so the browser namespace is
 * the single import point: `import { Stegassette } from "@amplib/steganography"`.
 */

import { createCanvasAndContext } from "../utilities";
import { Img } from "./Img";
import { encodeContainer, decodeContainer } from "./container";
import { resolveKeymapName } from "./keymap";
import { autoScaleImg, resolveBorderWidth } from "./geometry";
import { normalizeChannelPlan, isDefaultPlan, serializeChannelPlan } from "./channelPlan";
import { containerInteriorBytes, entryTableSize } from "./entries";
import { packStgcHeader } from "./header";
import type { CombineName, DecodedEntry, EncodeOptions, KeymapName, StegaImageData, StgcOpts, TraversalParams } from "./types";

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
    interiorByteLength: 0,
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

// Re-export the entire pure core so `import * as Stegassette from "./browser"`
// gets both the pure surface and the browser-specific encode/decode.
export * from "./index";

// Browser-only reveal player (audio playback with waveform removal).
export { createRevealPlayer, createSeekableReveal, RevealPlayer } from "./player";
export type { CreateRevealPlayerParams } from "./player";

// The shared reveal mechanism, and the caller-driven level built on it.
export {
  RevealSurface,
  SeekableReveal,
  animateReveal,
  revealSpanForEntry,
} from "./revealSurface";
export type { RevealSpan, RevealSurfaceOptions } from "./revealSurface";

// ---- helpers --------------------------------------------------

/** Read an HTMLImageElement or HTMLCanvasElement into an Img buffer. */
export function imgFromSource(
  source: HTMLImageElement | HTMLCanvasElement
): Img {
  const w =
    "naturalWidth" in source ? source.naturalWidth : source.width;
  const h =
    "naturalHeight" in source ? source.naturalHeight : source.height;
  const { canvas, context } = createCanvasAndContext(w, h);
  context.drawImage(source, 0, 0);
  const id = context.getImageData(0, 0, w, h);
  return new Img(w, h, id.data);
}

/** Render a StegaImageData (or Img) back to an HTMLCanvasElement. */
export function canvasFromImageData(imgData: StegaImageData): HTMLCanvasElement {
  const { canvas, context } = createCanvasAndContext(imgData.width, imgData.height);
  const id = context.createImageData(imgData.width, imgData.height);
  id.data.set(imgData.data instanceof Uint8Array ? imgData.data : new Uint8Array(imgData.data));
  context.putImageData(id, 0, 0);
  return canvas;
}

// ---- browser encode / decode ----------------------------------

export interface BrowserEncodeOptions extends EncodeOptions {
  source: HTMLImageElement | HTMLCanvasElement | StegaImageData;
}

export interface BrowserDecodeOptions {
  source: HTMLImageElement | HTMLCanvasElement | StegaImageData;
}

/**
 * Encode entries into a source image, returning an HTMLCanvasElement.
 *
 * `source` can be an HTMLImageElement, HTMLCanvasElement, or a neutral
 * StegaImageData. The source is cover-scaled to fit all entries at the
 * requested border width and aspect ratio.
 */
export function encode({
  source,
  entries,
  border = 0,
  aspectRatio,
  ...opts
}: BrowserEncodeOptions): HTMLCanvasElement {
  const src =
    source instanceof Img
      ? source
      : "data" in source
        ? new Img(source.width, source.height, source.data)
        : imgFromSource(source as HTMLImageElement | HTMLCanvasElement);

  // Resolve channel plan early so we know bytesPerPixel and pad for sizing
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
  let B = resolveBorderWidth(border, dataPx, aspect);

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
  let scaled = autoScaleImg(
    src,
    totalBytes,
    B,
    aspectRatio ?? null,
    plan.bytesPerPixel
  );
  while (ringPixelCount(scaled.width, scaled.height, B) < headerPx) {
    if (B > 255) throw new Error("STGC header does not fit any border");
    B += 1;
    scaled = autoScaleImg(
      src,
      totalBytes,
      B,
      aspectRatio ?? null,
      plan.bytesPerPixel
    );
  }

  const outImg = encodeContainer(
    entries,
    scaled,
    { ...opts, borderWidth: B, plan },
    scaled
  );

  return canvasFromImageData(outImg);
}

/**
 * Decode entries from an encoded image.
 *
 * `source` can be an HTMLImageElement, HTMLCanvasElement, or a neutral
 * StegaImageData. The image is self-decoding (no separate key required).
 */
export function decode({
  source,
}: BrowserDecodeOptions): { entries: DecodedEntry[]; opts: StgcOpts } {
  const img =
    source instanceof Img
      ? source
      : "data" in source
        ? new Img(source.width, source.height, source.data)
        : imgFromSource(source as HTMLImageElement | HTMLCanvasElement);

  return decodeContainer(img);
}
