import { getBorderPixels } from "./Img";
import type { Img } from "./Img";
import {
  isDefaultPlan,
  normalizeChannelPlan,
  parseChannelPlan,
  serializeChannelPlan,
} from "./channelPlan";
import type { ChannelPlan, CombineName, KeymapName, StgcOpts, TraversalName, TraversalParams } from "./types";

const STGC_MAGIC = [0x53, 0x54, 0x47, 0x43] as const; // "STGC"
const STGC_VERSION = 1;

export { STGC_MAGIC, STGC_VERSION };

interface DescriptorOpts {
  combine: CombineName;
  keymap: KeymapName;
  traversal: TraversalName;
  params?: TraversalParams;
  ch?: string;
  pad?: number;
  pack?: string;
}

/**
 * Build a \x01-separated "key=value\x01" descriptor byte string.
 * Only traversal/keymap params that are relevant to the chosen traversal/keymap
 * are included; ch/pad/pack are omitted for the legacy default plan.
 */
export function buildDescriptor(opts: DescriptorOpts): Uint8Array {
  const { combine, keymap, traversal, params = {}, ch, pad, pack } = opts;
  let s = `combine=${combine}\x01keymap=${keymap}\x01traversal=${traversal}\x01`;
  if (traversal === "fisher-yates")
    s += `seed=${(params.seed ?? 0) >>> 0}\x01`;
  if (traversal === "angle")
    s += `a=${params.a ?? 1}\x01b=${params.b ?? 1}\x01`;
  if (keymap === "offset")
    s += `kx=${(params.kx ?? 0) | 0}\x01ky=${(params.ky ?? 0) | 0}\x01`;
  if (ch) s += `ch=${ch}\x01`;
  if (pad) s += `pad=${pad >>> 0}\x01`;
  if (pack && pack !== "packed") s += `pack=${pack}\x01`;
  return new TextEncoder().encode(s);
}

/** Parse a descriptor byte string back into a key→value object. */
export function parseDescriptor(
  bytes: Uint8Array
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const chunk of new TextDecoder().decode(bytes).split("\x01")) {
    const eq = chunk.indexOf("=");
    if (eq > 0) out[chunk.slice(0, eq)] = chunk.slice(eq + 1);
  }
  if (out.seed != null) out.seed = parseInt(out.seed as string, 10) >>> 0;
  if (out.a != null) out.a = parseInt(out.a as string, 10);
  if (out.b != null) out.b = parseInt(out.b as string, 10);
  if (out.kx != null) out.kx = parseInt(out.kx as string, 10) | 0;
  if (out.ky != null) out.ky = parseInt(out.ky as string, 10) | 0;
  if (out.pad != null) out.pad = parseInt(out.pad as string, 10) >>> 0;
  return out;
}

interface PackHeaderOpts extends DescriptorOpts {
  interiorByteLength: number;
  entryCount: number;
}

/**
 * Pack the full STGC header as a Uint8Array:
 *   bytes 0-3  magic "STGC"
 *   byte  4    version = 1
 *   bytes 5-8  interiorByteLength (UInt32LE)
 *   byte  9    entryCount
 *   byte  10   descLen
 *   byte  11   reserved = 0
 *   bytes 12+  descriptor
 *   last byte  XOR checksum of all preceding bytes
 *
 * Zero bytes are clamped to 1 on encode; the XOR checksum enables recovery on decode.
 */
export function packStgcHeader(opts: PackHeaderOpts): Uint8Array {
  const desc = buildDescriptor(opts);
  const b = new Uint8Array(12 + desc.length + 1); // +1 for XOR checksum
  STGC_MAGIC.forEach((c, i) => (b[i] = c));
  b[4] = STGC_VERSION;
  const ibl = opts.interiorByteLength >>> 0;
  b[5] = ibl & 0xff;
  b[6] = (ibl >>> 8) & 0xff;
  b[7] = (ibl >>> 16) & 0xff;
  b[8] = (ibl >>> 24) & 0xff;
  b[9] = opts.entryCount & 0xff;
  b[10] = desc.length & 0xff;
  b[11] = 0; // reserved
  b.set(desc, 12);
  let xor = 0;
  for (let i = 0; i < b.length - 1; i++) xor ^= b[i];
  b[b.length - 1] = xor;
  return b;
}

/**
 * Recover zero bytes that were clamped to 1 during encode, using the XOR checksum.
 * Brute-forces up to 2^20 candidate positions — sufficient for real headers.
 */
function recoverZeros(hdr: Uint8Array): Uint8Array {
  const n = hdr.length;
  const ones: number[] = [];
  for (let i = 0; i < n - 1; i++) if (hdr[i] === 1) ones.push(i);
  const m = Math.min(ones.length, 20);
  // try stored checksum, then try treating it as 0 if it was clamped (stored as 1)
  for (const chk of [hdr[n - 1], ...(hdr[n - 1] === 1 ? [0] : [])]) {
    for (let mask = 0; mask < 1 << m; mask++) {
      const cand = new Uint8Array(hdr);
      cand[n - 1] = chk;
      for (let j = 0; j < m; j++) if (mask & (1 << j)) cand[ones[j]] = 0;
      let xor = 0;
      for (let i = 0; i < n - 1; i++) xor ^= cand[i];
      if (xor === cand[n - 1]) return cand;
    }
  }
  throw new Error("STGC header checksum mismatch");
}

/** Parsed header containing all options needed to decode the image. */
export interface ParsedHeader extends StgcOpts {
  B: number;
  version: number;
  entryCount: number;
}

/**
 * Header bytes ride the border alpha as high/low nibble pairs, so every
 * header pixel keeps alpha ≥ 240 and the border renders as good as opaque.
 * A nibble n is stored as alpha 255 - n; an untouched border pixel (255)
 * reads back as nibble 0.
 */
function nibbleByte(alphaHi: number, alphaLo: number): number {
  return (((255 - alphaHi) & 0xf) << 4) | ((255 - alphaLo) & 0xf);
}

/**
 * Read the STGC header from the border alpha channel of an image.
 *
 * Current images store nibble pairs (see `nibbleByte`); before that the
 * format stored one raw byte per pixel — which rendered the header as a
 * nearly transparent strip — so all three layouts are tried in turn:
 * nibble pairs, then whole bytes inverted, then whole bytes raw.
 *
 * byte 0 of the ring = B low byte; 0 = sentinel meaning a 2-byte B follows.
 * The header is located by scanning the ring bytes for the STGC magic.
 */
export function unpackStgcHeaderAlpha(img: Img): ParsedHeader {
  try {
    return unpackNibbles(img);
  } catch (e) {
    try {
      return unpackWholeBytes(img, (alpha) => 255 - alpha);
    } catch (e2) {
      return unpackWholeBytes(img, (alpha) => alpha);
    }
  }
}

function unpackNibbles(img: Img): ParsedHeader {
  // bootstrap B from the ring start — raster order makes the first pixels
  // identical for every border width
  const tmpBpx = getBorderPixels(img.width, img.height, 1);
  if (tmpBpx.length < 6) throw new Error("not a STGC image");
  const alphaAt = (i: number) =>
    img.getAlpha(tmpBpx[i][0], tmpBpx[i][1]);
  let B = nibbleByte(alphaAt(0), alphaAt(1));
  if (B === 0) {
    B =
      nibbleByte(alphaAt(2), alphaAt(3)) |
      (nibbleByte(alphaAt(4), alphaAt(5)) << 8);
    if (B === 0) throw new Error("not a STGC image");
  }

  const bpx = getBorderPixels(img.width, img.height, B);
  const bytes = new Uint8Array(bpx.length >> 1);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = nibbleByte(
      img.getAlpha(bpx[i * 2][0], bpx[i * 2][1]),
      img.getAlpha(bpx[i * 2 + 1][0], bpx[i * 2 + 1][1])
    );
  return parseRingBytes(bytes, B);
}

function unpackWholeBytes(
  img: Img,
  read: (alpha: number) => number
): ParsedHeader {
  let B = read(img.getAlpha(0, 0));
  if (B === 0) {
    // 2-byte B: enumerate with B=1 to find bpx[1] and bpx[2]
    const tmpBpx = getBorderPixels(img.width, img.height, 1);
    if (tmpBpx.length < 3) throw new Error("not a STGC image");
    B =
      read(img.getAlpha(tmpBpx[1][0], tmpBpx[1][1])) |
      (read(img.getAlpha(tmpBpx[2][0], tmpBpx[2][1])) << 8);
    if (B === 0) throw new Error("not a STGC image");
  }

  const bpx = getBorderPixels(img.width, img.height, B);
  const alphas = new Uint8Array(bpx.length);
  for (let i = 0; i < bpx.length; i++)
    alphas[i] = read(img.getAlpha(bpx[i][0], bpx[i][1]));
  return parseRingBytes(alphas, B);
}

function parseRingBytes(alphas: Uint8Array, B: number): ParsedHeader {
  const bpx = { length: alphas.length };

  // scan for the STGC magic in the alpha sequence
  let magicOff = -1;
  for (let i = 0; i <= bpx.length - 4; i++) {
    if (
      alphas[i] === 0x53 &&
      alphas[i + 1] === 0x54 &&
      alphas[i + 2] === 0x47 &&
      alphas[i + 3] === 0x43
    ) {
      magicOff = i;
      break;
    }
  }
  if (magicOff === -1) throw new Error("not a STGC image");
  if (alphas[magicOff + 4] !== STGC_VERSION)
    throw new Error(`unsupported STGC version: ${alphas[magicOff + 4]}`);

  const descLen = alphas[magicOff + 10];
  const hdrLen = 12 + descLen + 1;
  if (magicOff + hdrLen > bpx.length)
    throw new Error("STGC header extends beyond border");

  const hdr = alphas.slice(magicOff, magicOff + hdrLen);
  const recovered = recoverZeros(hdr);

  const ibl =
    (recovered[5] |
      (recovered[6] << 8) |
      (recovered[7] << 16) |
      (recovered[8] << 24)) >>>
    0;
  const entryCount = recovered[9];
  const d = parseDescriptor(recovered.slice(12, 12 + descLen));

  const combine = (d.combine as CombineName) || "xor";
  const keymap = (d.keymap as KeymapName) || "adjacent";
  const traversal = (d.traversal as TraversalName) || "raster";
  const pack = (d.pack as string) || "packed";
  const ch = (d.ch as string) || null;
  const pad = (d.pad as number) || 0;

  // rebuild channel plan from header fields
  let plan: ChannelPlan;
  if (pack === "mono") {
    plan = normalizeChannelPlan({ combine, pack: "mono" });
  } else if (ch) {
    const slots = parseChannelPlan(ch);
    plan = { slots, pad, pack: pack as "packed" | "aligned", bytesPerPixel: slots.length };
  } else {
    plan = normalizeChannelPlan({ combine });
  }
  plan.pad = pad;

  const params: TraversalParams = {
    seed: d.seed as number | undefined,
    a: d.a as number | undefined,
    b: d.b as number | undefined,
    kx: d.kx as number | undefined,
    ky: d.ky as number | undefined,
  };

  return {
    B,
    version: recovered[4],
    borderWidth: B,
    combine,
    keymap,
    traversal,
    params,
    plan,
    pack: pack as "packed" | "aligned" | "mono",
    interiorByteLength: ibl,
    entryCount,
  };
}

/**
 * Write header bytes and border-width encoding into the alpha channel of border
 * pixels. Must be called AFTER _writeInterior because KEY_MOD ops may reset
 * border alpha to 255.
 *
 * @param outImg  The image to modify in place.
 * @param B       Border width in pixels.
 * @param hdrBytes  Packed header from packStgcHeader.
 * @param offset  Optional explicit start position in the bpx array (default: centred in bottom row).
 */
export function applyAlphaHeader(
  outImg: Img,
  B: number,
  hdrBytes: Uint8Array,
  offset?: number
): void {
  const bpx = getBorderPixels(outImg.width, outImg.height, B);
  // Each byte rides two pixels as high/low nibbles (alpha = 255 - nibble),
  // keeping every header pixel at alpha ≥ 240 — raw bytes per pixel rendered
  // the header as a nearly transparent strip along the border. A zero byte
  // lands on alpha 255 exactly, so no zero-clamping or checksum recovery is
  // needed on this layout.
  const putByte = (index: number, byte: number) => {
    outImg.setAlpha(bpx[index][0], bpx[index][1], 255 - ((byte >> 4) & 0xf));
    outImg.setAlpha(bpx[index + 1][0], bpx[index + 1][1], 255 - (byte & 0xf));
  };

  let minOffset: number;
  if (B > 255) {
    putByte(0, 0); // sentinel
    putByte(2, B & 0xff);
    putByte(4, (B >> 8) & 0xff);
    minOffset = 6;
  } else {
    putByte(0, B);
    minOffset = 2;
  }

  const headerPx = hdrBytes.length * 2;
  if (minOffset + headerPx > bpx.length)
    throw new Error("STGC header does not fit the border ring");

  if (offset == null) {
    // centre in bottom row: find first bottom-row pixel in border sequence
    const H = outImg.height;
    const bottomStart = bpx.findIndex(([, py]) => py === H - 1);
    const bottomLen = outImg.width;
    offset = bottomStart + ((bottomLen - headerPx) >> 1);
  }
  // The ring is contiguous in index space and decode scans all of it, so a
  // header that cannot centre in the bottom row simply starts earlier and
  // flows across the other border pixels.
  offset = Math.min(offset, bpx.length - headerPx);
  // even ring index, so decode can pair pixels deterministically from 0
  offset = Math.max(minOffset, offset) & ~1;

  for (let i = 0; i < hdrBytes.length; i++) {
    putByte(offset + i * 2, hdrBytes[i]);
  }
}

export { isDefaultPlan, serializeChannelPlan };
