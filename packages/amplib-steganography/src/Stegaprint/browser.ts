/**
 * Browser adapter for Stegaprint.
 *
 * Adds `encode` / `decode` that accept HTMLImageElement / HTMLCanvasElement and
 * return HTMLCanvasElement, plus the JPEG round trip itself.
 *
 * `toJpeg` and `fromJpeg` live in the package rather than in each caller because
 * the format is *about* JPEG: an encoded image that never passes through a real
 * encoder has not been tested, only prepared. Nothing else in amplib needs them,
 * and every consumer of this format does.
 */

import { createCanvasAndContext } from "../utilities";
import { Img } from "../Stegassette/Img";
import { capacity, decode as decodeCore, encode as encodeCore } from "./container";
import type {
  Capacity,
  CapacityOptions,
  DecodeResult,
  EncodeOptions,
} from "./container";
import type { StegaImageData } from "../Stegassette/types";

export * from "./index";

// ---- source coercion -------------------------------------------

function toImageData(
  source: HTMLImageElement | HTMLCanvasElement | StegaImageData
): StegaImageData {
  if ("data" in source) return source;
  const w = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h = "naturalHeight" in source ? source.naturalHeight : source.height;
  const { context } = createCanvasAndContext(w, h);
  context.drawImage(source, 0, 0);
  return new Img(w, h, context.getImageData(0, 0, w, h).data);
}

/** Render a StegaImageData back to an HTMLCanvasElement. */
export function canvasFromImageData(img: StegaImageData): HTMLCanvasElement {
  const { canvas, context } = createCanvasAndContext(img.width, img.height);
  const id = context.createImageData(img.width, img.height);
  id.data.set(img.data instanceof Uint8Array ? img.data : new Uint8Array(img.data));
  context.putImageData(id, 0, 0);
  return canvas;
}

// ---- encode / decode -------------------------------------------

export interface BrowserEncodeOptions extends Omit<EncodeOptions, "source"> {
  source: HTMLImageElement | HTMLCanvasElement | StegaImageData;
}

export interface BrowserDecodeOptions {
  source: HTMLImageElement | HTMLCanvasElement | StegaImageData;
}

export function encode(opts: BrowserEncodeOptions): HTMLCanvasElement {
  return canvasFromImageData(
    encodeCore({ ...opts, source: toImageData(opts.source) })
  );
}

export function decode({ source }: BrowserDecodeOptions): DecodeResult {
  return decodeCore(toImageData(source));
}

export function capacityFor(
  width: number,
  height: number,
  opts?: CapacityOptions
): Capacity {
  return capacity(width, height, opts);
}

// ---- the JPEG round trip ---------------------------------------

/**
 * Encode a canvas to a JPEG blob.
 *
 * `quality` is the browser's own scale, and browsers do not agree on what a
 * given number means — Chrome, Firefox and Safari ship different quantization
 * tables. That divergence is exactly why this format embeds against pixel
 * values rather than against a specific encoder's coefficients
 * (Stegaprint.md §2.1, §10.4).
 */
export function toJpeg(
  canvas: HTMLCanvasElement,
  quality = 0.75
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("canvas.toBlob produced nothing")),
      "image/jpeg",
      quality
    );
  });
}

/** Decode a JPEG (or any image) blob back to a canvas. */
export async function fromJpeg(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const { canvas, context } = createCanvasAndContext(bitmap.width, bitmap.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

/**
 * Push a canvas through a real JPEG encode/decode, optionally more than once.
 *
 * The repeated case is the one that matters and the one a single round trip
 * flatters: an embedding can survive being encoded once because it was the
 * first thing the quantizer saw, and fall apart on the second pass. Returns the
 * final canvas and the byte size of each intermediate JPEG.
 */
export async function jpegRoundTrip(
  canvas: HTMLCanvasElement,
  quality = 0.75,
  passes = 1
): Promise<{ canvas: HTMLCanvasElement; bytes: number[] }> {
  let cur = canvas;
  const bytes: number[] = [];
  for (let i = 0; i < Math.max(1, passes); i++) {
    const blob = await toJpeg(cur, quality);
    bytes.push(blob.size);
    cur = await fromJpeg(blob);
  }
  return { canvas: cur, bytes };
}
