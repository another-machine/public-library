import type { CombineName } from "./types";

/** Decode: recover an audio byte from an encoded data pixel and its paired key pixel. */
type CombineFn = (encodedDataChannel: number, keyChannel: number) => number;

/**
 * Encode: compute the data-pixel channel value from an audio byte and the key channel.
 * Some ops (whisper) also need the original data-pixel value as a third arg.
 */
type EncodeFn = (
  audioByte: number,
  keyChannel: number,
  origDataChannel?: number
) => number;

/**
 * Key modifier: when an op needs to modify the key pixel, this computes the
 * new key channel value from (audio byte, original key channel, original data channel).
 * Only defined for ops that touch the key pixel.
 */
type KeyModFn = (
  audioByte: number,
  origKeyChannel: number,
  origDataChannel?: number
) => number;

export const COMBINE_NAMES: readonly CombineName[] = [
  "xor",
  "additive",
  "subtractive",
  "midpoint",
  "difference",
  "bitshift",
  "noise",
  "echo",
  "signed",
  "veil",
  "whisper",
];

/**
 * Decode table: COMBINE[op](encodedDataChannel, keyChannel) → audioByte.
 */
export const COMBINE: Record<CombineName, CombineFn> = {
  xor: (e, k) => e ^ k,
  additive: (e, k) => (e - k) & 0xff,
  subtractive: (e, k) => (k - e + 256) & 0xff,
  midpoint: (e, k) => (e * 2 - k) & 0xff,
  // key pixel stores the circular midpoint; data = key − audio (mod 256)
  difference: (e, k) => (k - e + 256) & 0xff,
  // key is unchanged; low 3 bits of key determined the rotation
  bitshift: (e, k) => {
    const s = k & 7;
    return ((e >>> s) | (e << (8 - s))) & 0xff;
  },
  // both pixels moved to flank audio value; midpoint of final pair = audio
  noise: (e, k) => Math.round(Math.abs(e - k) / 2 + Math.min(e, k)),
  // data pixel carries audio verbatim; key pixel = origKey ^ audio (see KEY_MOD)
  echo: (e, _k) => e,
  // silence (128) leaves the pixel untouched; amplitude displaces ±
  signed: (e, k) => (e - k + 128) & 0xff,
  // blend is 25% audio / 75% key; key stashes audio's low 2 bits
  veil: (e, k) => (4 * e - 3 * k) & 0xff,
  // audio high nibble in data pixel low nibble; high nibbles of both pixels untouched
  whisper: (e, k) => ((e & 0x0f) << 4) | (k & 0x0f),
};

/**
 * Encode table: ENCODE_OP[op](audioByte, keyChannel[, origDataChannel]) → dataPixelChannel.
 */
export const ENCODE_OP: Record<CombineName, EncodeFn> = {
  xor: (a, k) => a ^ k,
  additive: (a, k) => (a + k) & 0xff,
  subtractive: (a, k) => (k - a + 256) & 0xff,
  midpoint: (a, k) => (a + k) >> 1,
  // mk = modified key (from KEY_MOD.difference); data = mk − audio (mod 256)
  difference: (a, mk) => (mk - a + 256) & 0xff,
  // rotate audio left by (key & 7); key pixel untouched so shift is recoverable on decode
  bitshift: (a, k) => {
    const s = k & 7;
    return ((a << s) | (a >>> (8 - s))) & 0xff;
  },
  // mk = audio + floor(usedSpace/2); data mirrors same distance below audio
  noise: (a, mk) => (2 * a - mk + 256) & 0xff,
  // data pixel carries audio verbatim (key is set to origKey^audio by KEY_MOD)
  echo: (a, _mk) => a,
  // data shifts by (audio − 128) so silence (128) is invisible
  signed: (a, k) => (a + k + 128) & 0xff,
  // key stashes low 2 bits; blend is 25% audio, 75% key
  veil: (a, mk) => (a + 3 * mk) >> 2,
  // audio high nibble → data low nibble; keep data high nibble from original data pixel
  whisper: (a, _mk, e = 0) => (e & 0xf0) | (a >> 4),
};

/**
 * Key-modification table: for ops that also rewrite the key pixel, computes
 * KEY_MOD[op](audioByte, origKeyChannel, origDataChannel) → newKeyChannel.
 * Only ops listed here touch the key pixel; all others leave it unchanged.
 */
export const KEY_MOD: Partial<Record<CombineName, KeyModFn>> = {
  midpoint: (a, k) => (k & 0xfe) | (a & 1),
  // key becomes origKey XOR audio — a high-contrast, perfectly reversible ghost
  echo: (a, k) => k ^ a,
  // spread the two pixels symmetrically around their midpoint by `a` steps
  difference: (a, k, e = 0) => {
    let ks = k;
    if (ks < e) ks += 256;
    const mid = Math.round((ks - e) / 2 + e);
    return (mid + (a >> 1)) % 256;
  },
  // use existing pixel contrast as carrier amplitude; key moves to audio + half of usable space
  noise: (a, k, e = 0) => {
    const space = Math.abs(e - k);
    const usedSpace = Math.min(space, 2 * Math.min(a, 255 - a));
    return (a + Math.floor(usedSpace * 0.5)) % 256;
  },
  // key stashes audio's low 2 bits; blend is 25% audio (quarter-strength ghost)
  veil: (a, k) => (k & 0xfc) | (a & 3),
  // key stashes audio's low nibble; data keeps its high nibble (max delta 15)
  whisper: (a, k) => (k & 0xf0) | (a & 0x0f),
};

/**
 * Lossless combines: COMBINE(ENCODE_OP(a, k'), k') === a exactly, where k' is
 * the KEY_MOD-rewritten key (midpoint stashes a&1 in the key LSB, so it
 * round-trips exactly). Lossy/artistic combines (difference, noise)
 * intentionally couple image and audio — degradation is an aesthetic property
 * of the format.
 */
export const LOSSLESS_COMBINES: readonly CombineName[] = [
  "xor",
  "additive",
  "subtractive",
  "bitshift",
  "signed",
  "echo",
  "veil",
  "whisper",
  "midpoint",
];
