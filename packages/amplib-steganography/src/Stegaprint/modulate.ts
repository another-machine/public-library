/**
 * Modulation ops — the analog of Stegassette's combine ops, one level down.
 *
 * A combine op maps (payload byte, key value) → pixel value. A modulation op
 * maps (payload symbol, key value) → coefficient bin. Same slot in the
 * architecture, different mathematics, and the reason the format survives at
 * all: a bin is a range, and a range tolerates being nudged.
 */

export type ModulateName = "qim" | "pair";

/** Positive fractional part — `%` alone returns negative for negative inputs. */
function frac(v: number): number {
  const f = v % 1;
  return f < 0 ? f + 1 : f;
}

/**
 * Dither modulation: quantize `c` to the lattice whose offset encodes `s`.
 *
 * The symbol survives any perturbation below Δ/2M, which is the entire
 * robustness claim of this format (Stegaprint.md §2.2).
 */
export function qimEncode(c: number, s: number, M: number, delta: number): number {
  const d = (delta * s) / M;
  return Math.round((c - d) / delta) * delta + d;
}

export function qimDecode(c: number, M: number, delta: number): number {
  return Math.round(frac(c / delta) * M) % M;
}

/**
 * Differential QIM: the symbol rides the *difference* between the data block's
 * coefficient and its key block's, never the absolute value.
 *
 * This is the direct descendant of Stegassette's paired-pixel core, and the
 * property that made it elegant there is what makes it robust here — a global
 * tone curve, an exposure shift, or a re-quantization moves both members of the
 * pair the same way, and the difference between them is unchanged.
 */
export function pairEncode(
  c: number,
  key: number,
  s: number,
  M: number,
  delta: number
): number {
  return key + qimEncode(c - key, s, M, delta);
}

export function pairDecode(
  c: number,
  key: number,
  M: number,
  delta: number
): number {
  return qimDecode(c - key, M, delta);
}

/** Gray code, so an adjacent-bin error is a one-step value error (§9.1). */
export function toGray(n: number): number {
  return n ^ (n >> 1);
}

export function fromGray(g: number): number {
  let n = g;
  for (let s = 1; s < 32; s <<= 1) n ^= n >> s;
  return n;
}
