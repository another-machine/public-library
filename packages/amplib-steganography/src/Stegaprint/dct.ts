/**
 * 8×8 DCT-II / DCT-III, orthonormal — the transform JPEG quantizes in.
 *
 * Orthonormal scaling (rather than the unnormalized form) matters here: it makes
 * a coefficient's magnitude directly comparable to a pixel-level amplitude, so
 * the Δ derivation in Stegaprint.md §2.2 can be reasoned about in units anyone
 * can see. A coefficient of 80 really is ±10 levels of ripple over the block.
 */

export const N = 8;
export const BLOCK = N * N;

/** cos((2x+1)·u·π/16) · scale, precomputed. COS[u*8+x]. */
const COS = new Float64Array(BLOCK);
for (let u = 0; u < N; u++) {
  const s = u === 0 ? Math.SQRT1_2 : 1;
  for (let x = 0; x < N; x++) {
    COS[u * N + x] = s * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
}

/**
 * Zig-zag order: index i of the scan → linear offset in the 8×8 block.
 * This is the order JPEG's quantization table is written in, so a "coefficient
 * index" throughout this package means a zig-zag index, never a raw (u,v).
 */
export const ZIGZAG = new Uint8Array([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40,
  48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29,
  22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54,
  47, 55, 62, 63,
]);

/**
 * Forward 8×8 DCT-II, separable (rows then columns).
 *
 * `src` is 64 samples in raster order, already level-shifted (see `fdct` /
 * `idct` callers — JPEG subtracts 128 before transforming). Writes 64
 * coefficients in raster (u,v) order into `dst`, which may alias nothing.
 */
export function fdct(src: Float64Array, dst: Float64Array): void {
  const tmp = new Float64Array(BLOCK);
  // rows
  for (let y = 0; y < N; y++) {
    const o = y * N;
    for (let u = 0; u < N; u++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += src[o + x] * COS[u * N + x];
      tmp[o + u] = s * 0.5;
    }
  }
  // columns
  for (let x = 0; x < N; x++) {
    for (let v = 0; v < N; v++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += tmp[y * N + x] * COS[v * N + y];
      dst[v * N + x] = s * 0.5;
    }
  }
}

/** Inverse 8×8 DCT (DCT-III). Exact inverse of `fdct` up to float rounding. */
export function idct(src: Float64Array, dst: Float64Array): void {
  const tmp = new Float64Array(BLOCK);
  // columns
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      let s = 0;
      for (let v = 0; v < N; v++) s += src[v * N + x] * COS[v * N + y];
      tmp[y * N + x] = s * 0.5;
    }
  }
  // rows
  for (let y = 0; y < N; y++) {
    const o = y * N;
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let u = 0; u < N; u++) s += tmp[o + u] * COS[u * N + x];
      dst[o + x] = s * 0.5;
    }
  }
}
