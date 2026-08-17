/**
 * Error correction — deliberately little of it.
 *
 * Stegaprint.md §7 argues that the container should be redesigned to *degrade*
 * rather than protected with redundancy, and §7.2 does that work: fixed-width
 * records, block-aligned lengths, clamping. What remains here is the residue
 * that genuinely cannot degrade (the header, §6) and an optional payload code
 * the user chooses (§7.3).
 *
 * Phase 0 measured the channel this has to survive: ~0.04% symbol error through
 * Q75 and Q75 chained, and ~1.3% through a mixed 85→75→60 chain. `light` is
 * sized for the first and takes the edge off the second.
 */

import { fromBits, toBits } from "./bits";

export type EccLevel = "none" | "light" | "full";

// ---- CRC-32 (IEEE) ---------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- Hamming(15,11) --------------------------------------------
//
// Rate 11/15 ≈ 0.73 — the "rate ¾" the capacity table in §3 assumes. Corrects
// any single bit error per 15-bit codeword, which is the right shape for this
// channel once the traversal has interleaved bursts into isolated errors (§7.4).

/** Parity bits sit at 1-indexed positions 1, 2, 4, 8; data fills the rest. */
const DATA_POS = [3, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];

function hammingEncodeWord(dataBits: ArrayLike<number>, at: number): Uint8Array {
  const cw = new Uint8Array(16); // 1-indexed; cw[0] unused
  for (let i = 0; i < 11; i++) cw[DATA_POS[i]] = dataBits[at + i] ?? 0;
  for (const p of [1, 2, 4, 8]) {
    let parity = 0;
    for (let i = 1; i <= 15; i++) if (i & p && i !== p) parity ^= cw[i];
    cw[p] = parity;
  }
  return cw;
}

/** Returns the corrected codeword. A double error is silently miscorrected — a
 *  property of the code, and why the header does not rely on this alone. */
function hammingDecodeWord(cw: Uint8Array): Uint8Array {
  let syndrome = 0;
  for (const p of [1, 2, 4, 8]) {
    let parity = 0;
    for (let i = 1; i <= 15; i++) if (i & p) parity ^= cw[i];
    if (parity) syndrome |= p;
  }
  if (syndrome >= 1 && syndrome <= 15) cw[syndrome] ^= 1;
  return cw;
}

export function hammingEncode(data: Uint8Array): Uint8Array {
  const bits = toBits(data);
  const words = Math.ceil(bits.length / 11);
  const out = new Uint8Array(words * 15);
  for (let w = 0; w < words; w++) {
    const cw = hammingEncodeWord(bits, w * 11);
    for (let i = 1; i <= 15; i++) out[w * 15 + i - 1] = cw[i];
  }
  return out; // one bit per byte — packed by the caller after interleaving
}

export function hammingDecode(bits: Uint8Array, dataBitLength: number): Uint8Array {
  const words = Math.floor(bits.length / 15);
  const outBits = new Uint8Array(words * 11);
  const cw = new Uint8Array(16);
  for (let w = 0; w < words; w++) {
    for (let i = 1; i <= 15; i++) cw[i] = bits[w * 15 + i - 1];
    hammingDecodeWord(cw);
    for (let i = 0; i < 11; i++) outBits[w * 11 + i] = cw[DATA_POS[i]];
  }
  return fromBits(outBits.subarray(0, dataBitLength));
}

// ---- repetition ------------------------------------------------

/** N copies, majority-voted on decode. Used for the header (§6.2) and `full`. */
export function repeat(bits: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(bits.length * n);
  for (let r = 0; r < n; r++) out.set(bits, r * bits.length);
  return out;
}

export function majority(bits: Uint8Array, n: number, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    let votes = 0;
    for (let r = 0; r < n; r++) votes += bits[r * length + i] ?? 0;
    out[i] = votes * 2 > n ? 1 : 0;
  }
  return out;
}

// ---- payload codes ---------------------------------------------

/** Coded bit length for `byteLength` payload bytes at this level. */
export function codedBitLength(byteLength: number, level: EccLevel): number {
  const bits = byteLength * 8;
  if (level === "none") return bits;
  const hamming = Math.ceil(bits / 11) * 15;
  return level === "light" ? hamming : hamming * 3;
}

export function encodePayload(data: Uint8Array, level: EccLevel): Uint8Array {
  if (level === "none") return toBits(data);
  const coded = hammingEncode(data);
  return level === "light" ? coded : repeat(coded, 3);
}

/**
 * Most payload bytes recoverable from `bitLength` coded bits.
 *
 * Decode deliberately takes everything available rather than a length read from
 * the stream: `parseStream` clamps each entry to what the chunk counts and the
 * buffer actually allow (§7.2), so an over-long buffer costs a few ignored
 * trailing bytes and an under-long one truncates. Neither throws, which is the
 * whole point of the record redesign.
 */
export function decodedByteCapacity(bitLength: number, level: EccLevel): number {
  if (level === "none") return Math.floor(bitLength / 8);
  const per = level === "light" ? 15 : 45;
  return Math.floor((Math.floor(bitLength / per) * 11) / 8);
}

export function decodePayload(
  bits: Uint8Array,
  byteLength: number,
  level: EccLevel
): Uint8Array {
  if (level === "none") return fromBits(bits.subarray(0, byteLength * 8));
  const hammingBits = Math.ceil((byteLength * 8) / 11) * 15;
  const voted =
    level === "light" ? bits.subarray(0, hammingBits) : majority(bits, 3, hammingBits);
  return hammingDecode(voted, byteLength * 8);
}
