/**
 * The plane/block substrate: RGB ↔ YCbCr, and the 8×8 grid everything else
 * addresses.
 *
 * Planes are kept as Float64Array at full resolution — chroma subsampling is
 * something the downstream JPEG encoder does to us, not something we do to
 * ourselves. We embed at full resolution and let it decimate; pretending to
 * subsample here would only lose precision twice.
 */

import { BLOCK, N, fdct, idct } from "./dct";
import type { StegaImageData } from "../Stegassette/types";

export type PlaneName = "y" | "cb" | "cr";

export interface Planes {
  width: number;
  height: number;
  y: Float64Array;
  cb: Float64Array;
  cr: Float64Array;
}

/** BT.601 full-range, the transform JFIF specifies. */
export function rgbToPlanes(img: StegaImageData): Planes {
  const { width, height, data } = img;
  const n = width * height;
  const y = new Float64Array(n);
  const cb = new Float64Array(n);
  const cr = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    cb[i] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    cr[i] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  }
  return { width, height, y, cb, cr };
}

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Inverse of `rgbToPlanes`, writing RGBA with alpha 255.
 *
 * The rounding here is the reason the encoder has to iterate (Stegaprint.md
 * §10.2): coefficients set exactly in the DCT domain do not survive the trip
 * back through 8-bit integers untouched.
 */
export function planesToRgb(p: Planes): StegaImageData {
  const n = p.width * p.height;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const Y = p.y[i], Cb = p.cb[i] - 128, Cr = p.cr[i] - 128;
    data[i * 4] = clamp8(Y + 1.402 * Cr);
    data[i * 4 + 1] = clamp8(Y - 0.344136 * Cb - 0.714136 * Cr);
    data[i * 4 + 2] = clamp8(Y + 1.772 * Cb);
    data[i * 4 + 3] = 255;
  }
  return { width: p.width, height: p.height, data };
}

/** Block grid dimensions. Images are sized to multiples of 8 before we see them. */
export function blockDims(width: number, height: number): { BW: number; BH: number } {
  return { BW: Math.floor(width / N), BH: Math.floor(height / N) };
}

/**
 * Read block (bx, by) of `plane` into `dst` as 64 level-shifted samples
 * (JPEG's −128), ready for `fdct`.
 */
export function readBlock(
  plane: Float64Array,
  width: number,
  bx: number,
  by: number,
  dst: Float64Array
): void {
  const ox = bx * N, oy = by * N;
  for (let y = 0; y < N; y++) {
    const src = (oy + y) * width + ox;
    for (let x = 0; x < N; x++) dst[y * N + x] = plane[src + x] - 128;
  }
}

/** Inverse of `readBlock`: undoes the level shift and writes back in place. */
export function writeBlock(
  plane: Float64Array,
  width: number,
  bx: number,
  by: number,
  src: Float64Array
): void {
  const ox = bx * N, oy = by * N;
  for (let y = 0; y < N; y++) {
    const dst = (oy + y) * width + ox;
    for (let x = 0; x < N; x++) plane[dst + x] = src[y * N + x] + 128;
  }
}

/** Forward transform of block (bx, by) — read, level-shift, DCT. */
export function blockCoeffs(
  plane: Float64Array,
  width: number,
  bx: number,
  by: number,
  out: Float64Array,
  scratch = new Float64Array(BLOCK)
): void {
  readBlock(plane, width, bx, by, scratch);
  fdct(scratch, out);
}

/** Inverse transform of a coefficient block back into the plane. */
export function putCoeffs(
  plane: Float64Array,
  width: number,
  bx: number,
  by: number,
  coeffs: Float64Array,
  scratch = new Float64Array(BLOCK)
): void {
  idct(coeffs, scratch);
  writeBlock(plane, width, bx, by, scratch);
}
