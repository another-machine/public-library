/**
 * The STGP header — fixed-width binary at fixed offsets (Stegaprint.md §6.3).
 *
 * Stegassette's `\x01`-separated `key=value` descriptor is compact and readable
 * and has exactly the property this format cannot afford: a field whose length
 * determines where the next field starts. Nothing here is variable. Every field
 * is at a known byte offset, so a corrupted field corrupts itself.
 *
 * This is the one structure that must arrive exact — get Δ or the traversal
 * wrong and every symbol in the image decodes wrong, a failure with no graceful
 * version. It is bought with a substrate that does not degrade (§6.1), not with
 * redundancy stacked on one that does.
 */

import { crc32 } from "./ecc";
import type { EccLevel } from "./ecc";
import type { ModulateName } from "./modulate";
import type { KeymapName, TraversalName } from "../Stegassette/types";

export const STGP_MAGIC = [0x53, 0x54, 0x47, 0x50] as const; // "STGP"
export const STGP_VERSION = 1;
export const HEADER_SIZE = 40;
export const MAX_CARRIERS = 8;

/**
 * Fixed enumerations — the header stores indices, never names.
 *
 * Mirrors Stegassette's TRAVERSAL_NAMES, and must stay in step with it by
 * APPENDING: a name missing here packs as index 0, so the encoder would lay the
 * payload down in one order and the decoder read it back in another.
 *
 * STGP carries no traversal params beyond `seed`, so `radial` is always
 * direction "out" and `spiral` always "cw" here — encode and decode agree
 * because neither side can ask for the other.
 */
export const TRAVERSALS: readonly TraversalName[] = [
  "raster", "boustrophedon", "spiral", "angle", "fisher-yates",
  "center-out", "hilbert", "polar", "bayer", "radial",
];
export const KEYMAPS: readonly KeymapName[] = [
  "adjacent", "poles", "mirror-x", "mirror-y", "offset", "rotate", "none",
];
export const MODULATES: readonly ModulateName[] = ["qim", "pair"];
export const ECC_LEVELS: readonly EccLevel[] = ["none", "light", "full"];

export interface StgpHeader {
  version: number;
  /** Full image size in blocks, so a rescale can be undone (phase 3). */
  blocksWide: number;
  blocksHigh: number;
  /** Border ring depth in blocks. */
  border: number;
  /** Symbol alphabet size. */
  M: number;
  /** Zig-zag carrier indices, in the order they take stream symbols. */
  carriers: number[];
  traversal: TraversalName;
  keymap: KeymapName;
  modulate: ModulateName;
  ecc: EccLevel;
  /** Declared quality floor: the worst re-encode this image claims to survive. */
  qualityFloor: number;
  entryCount: number;
  /** Length of the coded symbol stream, in symbols. */
  symbolCount: number;
  seed: number;
  /**
   * How many whole copies of the symbol stream the interior holds.
   *
   * The canvas has a floor (the header ring needs ~960 cells however small the
   * payload), so a short payload leaves most of the interior untouched — 90% of
   * it at 780 bytes. Copies fill that space and are majority-voted on decode.
   * 1 means written once.
   */
  repeat: number;
}

/**
 * Pack to exactly HEADER_SIZE bytes.
 *
 * ```
 *  0..3   magic "STGP"
 *  4      version
 *  5      border (blocks)
 *  6..7   blocksWide   uint16le
 *  8..9   blocksHigh   uint16le
 * 10      M
 * 11      carrierCount
 * 12..19  carriers (one byte each, zero-padded)
 * 20      traversal index
 * 21      keymap index
 * 22      modulate index
 * 23      ecc index
 * 24      qualityFloor
 * 25      entryCount
 * 26..29  symbolCount  uint32le
 * 30..33  seed         uint32le
 * 34      repeat (whole copies of the symbol stream, >= 1)
 * 35      reserved
 * 36..39  crc32 of bytes 0..35
 * ```
 */
export function packHeader(h: StgpHeader): Uint8Array {
  const b = new Uint8Array(HEADER_SIZE);
  const v = new DataView(b.buffer);
  STGP_MAGIC.forEach((c, i) => (b[i] = c));
  b[4] = h.version & 0xff;
  b[5] = h.border & 0xff;
  v.setUint16(6, h.blocksWide & 0xffff, true);
  v.setUint16(8, h.blocksHigh & 0xffff, true);
  b[10] = h.M & 0xff;
  b[11] = Math.min(MAX_CARRIERS, h.carriers.length) & 0xff;
  for (let i = 0; i < MAX_CARRIERS; i++) b[12 + i] = h.carriers[i] ?? 0;
  b[20] = Math.max(0, TRAVERSALS.indexOf(h.traversal));
  b[21] = Math.max(0, KEYMAPS.indexOf(h.keymap));
  b[22] = Math.max(0, MODULATES.indexOf(h.modulate));
  b[23] = Math.max(0, ECC_LEVELS.indexOf(h.ecc));
  b[24] = h.qualityFloor & 0xff;
  b[25] = h.entryCount & 0xff;
  v.setUint32(26, h.symbolCount >>> 0, true);
  v.setUint32(30, h.seed >>> 0, true);
  b[34] = Math.max(1, Math.min(255, h.repeat | 0));
  v.setUint32(36, crc32(b.subarray(0, 36)), true);
  return b;
}

export class HeaderError extends Error {}

export function unpackHeader(b: Uint8Array): StgpHeader {
  if (b.length < HEADER_SIZE) throw new HeaderError("STGP header truncated");
  for (let i = 0; i < 4; i++)
    if (b[i] !== STGP_MAGIC[i]) throw new HeaderError("not a STGP image");
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (crc32(b.subarray(0, 36)) !== v.getUint32(36, true))
    throw new HeaderError("STGP header checksum mismatch");
  if (b[4] !== STGP_VERSION)
    throw new HeaderError(`unsupported STGP version: ${b[4]}`);

  const carrierCount = Math.min(MAX_CARRIERS, b[11]);
  const carriers: number[] = [];
  for (let i = 0; i < carrierCount; i++) carriers.push(b[12 + i]);

  return {
    version: b[4],
    border: b[5],
    blocksWide: v.getUint16(6, true),
    blocksHigh: v.getUint16(8, true),
    M: b[10] || 4,
    carriers,
    traversal: TRAVERSALS[b[20]] ?? "bayer",
    keymap: KEYMAPS[b[21]] ?? "adjacent",
    modulate: MODULATES[b[22]] ?? "qim",
    ecc: ECC_LEVELS[b[23]] ?? "light",
    qualityFloor: b[24] || 75,
    entryCount: b[25],
    symbolCount: v.getUint32(26, true),
    seed: v.getUint32(30, true),
    // Images written before repeat existed have 0 here; they were written once.
    repeat: Math.max(1, b[34]),
  };
}
