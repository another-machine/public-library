/**
 * Measured channel profile — the output of phase 0.
 *
 * Stegaprint.md §2.2 derives Δ from the standard JPEG quantization tables. That
 * derivation is wrong in practice, and the rig in `scripts/phase0-measure.ts`
 * is what showed it: encoders are not obliged to use those tables and jpeg-js
 * does not, so a Δ chosen against the standard model produced error rates that
 * were not even monotonic in quality — Q95 worse than Q50 — because the QIM
 * lattice and the encoder's real lattice were beating against each other.
 *
 * What replaces it is a measurement: push a cover through a real encoder and
 * record how far each coefficient actually moves. Everything below is derived
 * from p99 of |Δc|.
 *
 * These numbers are honest about their provenance. They come from one encoder
 * (jpeg-js) against one synthetic cover, which is enough to build phase 1 on
 * and not enough to be final — §12 phase 0 calls for three encoders. Re-running
 * the rig against another encoder should update this table, not the callers.
 *
 * A second encoder has since been sampled, though not through the rig: the
 * browser's own `canvas.toBlob("image/jpeg", 0.75)` is **harsher than jpeg-js
 * at the same nominal quality**. With no redundancy to hide behind — a payload
 * filling its canvas, so `repeat` is 1 — 8-bit audio came back with 3 samples
 * in 24000 wrong, where jpeg-js at q75 gives none. `ecc: "full"` takes it to
 * zero.
 *
 * So DEFAULT_SAFETY is under-provisioned for Chrome, and the two mechanisms
 * that cover for it are the ones already here: `repeat` when the canvas has
 * slack, `ecc` when it does not. Raising the safety factor instead would cost
 * every image capacity to fix a case only some encoders present — worth
 * deciding once the rig measures Chrome rather than inferring it from one
 * payload.
 */

/**
 * p99 of |Δc| per zig-zag index, cover → JPEG(Q75) → cover.
 * Indices above 20 are not carriers at any Δ and are recorded as 0.
 */
export const P99_Q75 = [
  8.94, 3.44, 4.0, 3.75, 3.5, 2.94, 4.88, 3.63, 3.63, 3.75, 4.56,
  4.5, 4.0, 4.88, 6.0, 9.75, 6.38, 5.94, 5.44, 5.44, 5.94,
];

/**
 * Default carriers, chosen by measurement rather than by theory.
 *
 * Seven zig-zag indices at M=4 gives the 14 bits per block that §3's capacity
 * table assumes. The selection run (phase 0 §6) scored every index 0–20 through
 * Q75, Q75 chained three times, and Q60; these survive all of them at 0%.
 *
 * **DC (index 0) is not here, and §2.3 was wrong to promote it.** The argument
 * was that it has the finest quantization step and survives downscaling best.
 * Measured, it is the *worst* carrier available: p99 of 8.9 against 3.5 for
 * index 4, and the only index that degrades under chained re-encoding — 20.75%
 * through Q75×3 where every carrier below holds 0%. JPEG codes DC differentially
 * across blocks, so its errors accumulate along the scan rather than staying put.
 * It is excluded, and the capacity claim that depended on it stands anyway
 * because seven AC carriers were available.
 */
export const DEFAULT_CARRIERS = [2, 3, 4, 6, 7, 8, 12];

/**
 * Safety factor on p99. Δ = safety · M · p99.
 *
 * p99 leaves 1% of coefficients outside the tolerance *by construction*, so a
 * safety factor of 2 can never reach zero errors no matter how clean the
 * channel — it measured 1.0–4.5% at Q75. The sweep (phase 0 §5) found 3× at the
 * edge and 4× clean, costing about 6 dB of PSNR against 2×. Visibility is not a
 * constraint this format accepts (§6.1), so it takes the clean one.
 */
export const DEFAULT_SAFETY = 4;

/** Δ for one carrier: safety · M · p99, floored so tiny values stay decodable. */
export function deltaForCarrier(
  zigzagIndex: number,
  M: number,
  safety = DEFAULT_SAFETY
): number {
  const p99 = P99_Q75[zigzagIndex] ?? 8;
  return Math.max(4, Math.ceil(safety * M * p99));
}

export function deltasFor(
  carriers: readonly number[],
  M: number,
  safety = DEFAULT_SAFETY
): number[] {
  return carriers.map((c) => deltaForCarrier(c, M, safety));
}

/**
 * Measured symbol error rates for DEFAULT_CARRIERS at M=4, safety 4 — what a
 * caller choosing an ECC level is actually choosing against (phase 0 §7).
 */
export const MEASURED_SER: Record<string, number> = {
  lossless: 0,
  "Q75": 0.00005,
  "Q75×2": 0.0004,
  "Q75×3": 0.0004,
  "Q60": 0.0006,
  "Q60×2": 0.0003,
  "Q85→Q75→Q60": 0.0126,
};
