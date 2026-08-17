/**
 * Bit stream ↔ symbol stream.
 *
 * Symbols are Gray-coded on the way out (Stegaprint.md §9.1): under QIM a
 * channel error moves a symbol to an *adjacent bin*, and Gray coding makes an
 * adjacent-bin error a single-bit error rather than one that can flip the high
 * bit. For audio carried as amplitude that is the difference between a click
 * and a nudge; for a byte stream it is the difference between one bad bit that
 * Hamming fixes and two that it cannot.
 */

import { fromGray, toGray } from "./modulate";

/** Bits per symbol for an alphabet of size M. M must be a power of two. */
export function bitsPerSymbol(M: number): number {
  return Math.round(Math.log2(M));
}

export function symbolsFor(bitLength: number, M: number): number {
  return Math.ceil(bitLength / bitsPerSymbol(M));
}

/** Pack a bit array (one bit per element) into Gray-coded symbols. */
export function bitsToSymbols(bits: ArrayLike<number>, M: number): Uint8Array {
  const w = bitsPerSymbol(M);
  const n = Math.ceil(bits.length / w);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let b = 0; b < w; b++) v = (v << 1) | (bits[i * w + b] ?? 0);
    out[i] = toGray(v) & (M - 1);
  }
  return out;
}

/** Inverse of `bitsToSymbols`, truncated to `bitLength`. */
export function symbolsToBits(
  symbols: ArrayLike<number>,
  M: number,
  bitLength: number
): Uint8Array {
  const w = bitsPerSymbol(M);
  const out = new Uint8Array(bitLength);
  for (let i = 0; i < symbols.length; i++) {
    const v = fromGray(symbols[i] & (M - 1));
    for (let b = 0; b < w; b++) {
      const at = i * w + b;
      if (at < bitLength) out[at] = (v >>> (w - 1 - b)) & 1;
    }
  }
  return out;
}
