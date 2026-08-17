/**
 * JPEG quantization tables and the Δ derivation that depends on them.
 *
 * The whole robustness story of this format is one inequality (Stegaprint.md
 * §2.2): a symbol survives any perturbation below Δ/2M, and re-quantizing a
 * coefficient whose step is q moves it by at most q/2. So Δ > M·q, and the
 * numbers that make that concrete live here.
 */

import { ZIGZAG } from "./dct";

/** ITU T.81 Annex K.1 luminance table, raster order. */
export const LUMA_Q50 = new Uint8Array([
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
]);

/** ITU T.81 Annex K.2 chrominance table, raster order. */
export const CHROMA_Q50 = new Uint8Array([
  17, 18, 24, 47, 99, 99, 99, 99,
  18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
]);

/**
 * Scale a base table to a quality level, per the libjpeg convention that
 * essentially every encoder follows.
 *
 * This is a convention, not a standard — a JPEG carries its tables explicitly
 * and an encoder may write anything. It is the right basis for *choosing* Δ
 * (we need some model of what we will meet downstream) and the wrong basis for
 * *decoding* (where we must never assume). Nothing in decode reads this.
 */
export function scaleTable(base: Uint8Array, quality: number): Uint16Array {
  const q = Math.max(1, Math.min(100, quality | 0));
  const s = q < 50 ? 5000 / q : 200 - 2 * q;
  const out = new Uint16Array(64);
  for (let i = 0; i < 64; i++) {
    out[i] = Math.max(1, Math.min(255, Math.floor((s * base[i] + 50) / 100)));
  }
  return out;
}

/** Quantization steps in *zig-zag* index order, which is how carriers are named. */
export function stepsZigzag(
  quality: number,
  plane: "luma" | "chroma" = "luma"
): Uint16Array {
  const raster = scaleTable(plane === "luma" ? LUMA_Q50 : CHROMA_Q50, quality);
  const out = new Uint16Array(64);
  for (let i = 0; i < 64; i++) out[i] = raster[ZIGZAG[i]];
  return out;
}

/**
 * Embedding step for a carrier, from the quality floor the image claims to
 * survive: Δ = safety · M · q.
 *
 * `safety` defaults to 2. Below ~1.5 the margin is thinner than the rounding
 * that the pixel round trip alone introduces (§10.2), so this is not a knob to
 * economize on — Phase 0 measures what it actually needs to be.
 */
export function deltaFor(
  zigzagIndex: number,
  M: number,
  qualityFloor: number,
  plane: "luma" | "chroma" = "luma",
  safety = 2
): number {
  const q = stepsZigzag(qualityFloor, plane)[zigzagIndex];
  return safety * M * q;
}

/**
 * The carrier set this module's theory predicts — DC plus six low-frequency AC,
 * DC included for having the finest step in the table.
 *
 * **Not what the format uses.** Phase 0 measured DC as the worst carrier
 * available, not the best: it moves nearly three times as far as a mid-frequency
 * coefficient, and it is the only index that degrades under chained re-encoding,
 * because JPEG codes DC differentially across blocks so its errors accumulate
 * along the scan. `profile.ts` holds the measured set.
 *
 * Kept, and exported as `THEORY_CARRIERS`, so the phase 0 rig can keep scoring
 * the prediction against the measurement rather than quietly discarding it.
 */
export const DEFAULT_CARRIERS = [0, 1, 2, 3, 4, 5, 6] as const;
