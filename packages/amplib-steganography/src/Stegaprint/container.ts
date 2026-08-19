/**
 * Encode and decode a STGP image.
 *
 * Structurally this mirrors Stegassette's container — header in the border,
 * payload in the interior, a traversal over data cells paired with key cells by
 * a keymap — with every cell being an 8×8 block rather than a pixel, and every
 * write being a coefficient bin rather than a pixel value.
 *
 * That the traversal and keymap code is reused *verbatim* from Stegassette is
 * not a coincidence. Both are pure functions over a grid with a checkerboard
 * filter and neither has any idea whether its cells are pixels or blocks
 * (Stegaprint.md §4.1, §4.2).
 */

import { BLOCK, N, ZIGZAG } from "./dct";
import {
  blockCoeffs,
  blockDims,
  planesToRgb,
  putCoeffs,
  rgbToPlanes,
} from "./blocks";
import { qimDecode, qimEncode, pairDecode, pairEncode } from "./modulate";
import type { ModulateName } from "./modulate";
import { DEFAULT_CARRIERS, DEFAULT_SAFETY, deltasFor } from "./profile";
import { bitsPerSymbol, bitsToSymbols, symbolsFor, symbolsToBits } from "./symbols";
import {
  buildStream,
  parseStream,
  RECORD_SIZE,
  chunkBytes,
  chunksFor,
} from "./records";
import type { DecodedPrintEntry, PrintEntry } from "./records";
import {
  codedBitLength,
  crc32,
  decodePayload,
  decodedByteCapacity,
  encodePayload,
} from "./ecc";
import type { EccLevel } from "./ecc";
import {
  CORNER,
  borderForHeader,
  checkCorners,
  drawHeader,
  isBorderBlock,
  isCornerBlock,
  minSemiPerimeter,
  readHeader,
} from "./fiducial";
import { HEADER_SIZE, packHeader, unpackHeader } from "./header";
import type { StgpHeader } from "./header";
import { isKeylessKeymap, resolveKeymap, resolveKeymapName } from "../Stegassette/keymap";
import { getPathIndices } from "../Stegassette/traversal";
import { interiorDims, scaleImg, cropImg } from "../Stegassette/geometry";
import { Img } from "../Stegassette/Img";
import type {
  KeymapName,
  StegaImageData,
  TraversalName,
  TraversalParams,
} from "../Stegassette/types";

export interface EncodeOptions {
  source: StegaImageData;
  entries: PrintEntry[];
  /** Defaults chosen for survival, not for compactness — see §5.3. */
  traversal?: TraversalName;
  keymap?: KeymapName;
  modulate?: ModulateName;
  ecc?: EccLevel;
  M?: number;
  carriers?: number[];
  /** Multiplier on the measured p99. Larger is more robust and more visible. */
  safety?: number;
  /** Declared quality floor. Phase 1 profiles only Q75; see profile.ts. */
  qualityFloor?: number;
  aspectRatio?: number;
  seed?: number;
  /**
   * Whole copies of the payload to write into the interior.
   *
   * "auto" (the default) fills whatever the canvas has spare. A number pins it;
   * 1 writes the payload once and leaves the rest of the interior untouched.
   */
  repeat?: number | "auto";
  /**
   * Force an exact output size instead of sizing the canvas to the payload.
   *
   * By default the canvas is chosen to fit the payload, which is what a still
   * image wants. A fixed size is what everything else wants: video frames are
   * locked to standard dimensions (§13.3), and a caller replacing an existing
   * asset usually cannot change its shape. Throws if the payload does not fit,
   * rather than silently growing — `capacity()` answers the same question ahead
   * of time.
   *
   * Rounded down to a whole number of 8×8 blocks.
   */
  width?: number;
  height?: number;
}

export interface DecodeResult {
  entries: DecodedPrintEntry[];
  header: StgpHeader;
  /** False when the corner marks did not read — the image was transformed. */
  registered: boolean;
}

const DEFAULTS = {
  traversal: "bayer" as TraversalName,
  modulate: "qim" as ModulateName,
  ecc: "light" as EccLevel,
  M: 4,
  qualityFloor: 75,
};

/**
 * The default keymap follows the modulation op, because only one of them wants
 * a key.
 *
 * `pair` encodes the difference between a data block and a key block, so it
 * needs the checkerboard that holds key blocks back. `qim` never reads a key
 * at all — and defaulting it to a keyed layout anyway reserved half the
 * interior for reference blocks nothing consults, halving capacity to buy
 * nothing. Measured: the same 8 KB payload lands at 688×696 keyless against
 * 952×960 keyed.
 */
function defaultKeymap(modulate: ModulateName): KeymapName {
  return modulate === "pair" ? "adjacent" : "none";
}

/** Interior block coordinates of every data cell, in traversal order. */
function dataPath(
  IBW: number,
  IBH: number,
  traversal: TraversalName,
  params: TraversalParams,
  keyless: boolean
): Uint32Array {
  return getPathIndices(IBW, IBH, traversal, params, keyless);
}

/** Payload bits for a set of entries at an ECC level. */
function streamBitLength(entries: PrintEntry[], ecc: EccLevel): number {
  const bytes =
    entries.length * RECORD_SIZE +
    entries.reduce((s, e) => s + chunkBytes(chunksFor(e.data.length)), 0);
  return codedBitLength(bytes, ecc);
}

/**
 * Size the canvas so the interior holds `symbolCount` symbols and the border
 * ring holds the header.
 *
 * Both constraints move together — a thicker border eats interior — so this
 * grows the border until the header fits and re-solves, exactly as Stegassette
 * does for its alpha ring.
 */
function sizeCanvas(
  symbolCount: number,
  carriers: number,
  aspect: number,
  keyless: boolean
): { BW: number; BH: number; border: number } {
  const dataBlocks = Math.ceil(symbolCount / carriers);
  const border = CORNER;
  const { IW, IH } = interiorDims(dataBlocks, aspect, border, keyless);
  let BW = Math.max(IW + 2 * border, CORNER * 2 + 1);
  let BH = Math.max(IH + 2 * border, CORNER * 2 + 1);

  // Grow the canvas — never the border — until the ring can hold the header.
  // The constraint is on the semi-perimeter and is aspect-independent, so this
  // scales both sides together and the requested shape is preserved.
  const minSum = minSemiPerimeter();
  if (BW + BH < minSum) {
    const scale = minSum / (BW + BH);
    BW = Math.ceil(BW * scale);
    BH = Math.ceil(BH * scale);
    while (BW + BH < minSum) BW++;
  }
  return { BW, BH, border };
}

/**
 * Cover-crop and scale a source to exactly BW×BH blocks.
 *
 * Exported because a caller comparing the encoded image to its cover needs the
 * cover at the same dimensions — the canvas is sized by the payload, not by the
 * source, so the two are rarely the same shape to begin with.
 */
export function fitSource(src: StegaImageData, BW: number, BH: number): Img {
  const W = BW * N, H = BH * N;
  let img = new Img(src.width, src.height, src.data);
  const aspect = W / H;
  const srcAspect = img.width / img.height;
  if (Math.abs(srcAspect - aspect) > 0.0005) {
    let cw: number, ch: number;
    if (srcAspect > aspect) {
      ch = img.height;
      cw = Math.max(1, Math.round(img.height * aspect));
    } else {
      cw = img.width;
      ch = Math.max(1, Math.round(img.width / aspect));
    }
    img = cropImg(img, Math.floor((img.width - cw) / 2), Math.floor((img.height - ch) / 2), cw, ch);
  }
  return img.width === W && img.height === H ? img : scaleImg(img, W, H);
}

interface Plan {
  carriers: number[];
  raster: number[];
  deltas: number[];
  M: number;
  modulate: ModulateName;
  keyless: boolean;
  keymapFn: ReturnType<typeof resolveKeymap> | null;
  params: TraversalParams;
  border: number;
  IBW: number;
  IBH: number;
  path: Uint32Array;
}

/**
 * Write symbols into the interior, iterating until the image round-trips
 * through 8-bit pixels cleanly.
 *
 * The iteration is not defensive padding — it is required (§10.2). Setting a
 * coefficient exactly in the DCT domain, inverting, and rounding to integers
 * perturbs the very coefficient just set, and with several carriers per block
 * each one's inverse disturbs the others. Without this loop the *lossless*
 * round trip loses symbols and every JPEG measurement downstream is taken
 * against a broken baseline.
 */
function writeInterior(
  planes: ReturnType<typeof rgbToPlanes>,
  symbols: Uint8Array,
  plan: Plan,
  maxIterations = 12
): { image: StegaImageData; iterations: number } {
  const width = planes.width;
  const { border, IBW, path, raster, deltas, M, modulate, keyless, keymapFn, params } = plan;
  const per = raster.length;
  const coeffs = new Float64Array(BLOCK);
  const keyCoeffs = new Float64Array(BLOCK);
  const scratch = new Float64Array(BLOCK);
  let cur = planes.y;
  let rgb: StegaImageData = planesToRgb(planes);
  let iterations = 0;

  const forEachCell = (
    fn: (bx: number, by: number, kx: number, ky: number, at: number) => void
  ) => {
    for (let p = 0, at = 0; p < path.length && at < symbols.length; p++, at += per) {
      const v = path[p];
      const lx = v % IBW, ly = (v / IBW) | 0;
      const [klx, kly] = keymapFn
        ? keymapFn(lx, ly, IBW, plan.IBH, params)
        : [lx, ly];
      fn(lx + border, ly + border, klx + border, kly + border, at);
    }
  };

  for (let pass = 0; pass < maxIterations; pass++) {
    iterations = pass + 1;
    forEachCell((bx, by, kx, ky, at) => {
      blockCoeffs(cur, width, bx, by, coeffs, scratch);
      if (modulate === "pair" && !keyless)
        blockCoeffs(cur, width, kx, ky, keyCoeffs, scratch);
      for (let k = 0; k < per; k++) {
        const s = symbols[at + k] ?? 0;
        const r = raster[k];
        coeffs[r] =
          modulate === "pair" && !keyless
            ? pairEncode(coeffs[r], keyCoeffs[r], s, M, deltas[k])
            : qimEncode(coeffs[r], s, M, deltas[k]);
      }
      putCoeffs(cur, width, bx, by, coeffs, scratch);
    });

    // Round through 8-bit exactly as any encoder will, then re-measure. The
    // chroma planes ride along unchanged — they are not carriers, but the RGB
    // they combine into is what gets rounded, so they have to be present.
    planes.y.set(cur);
    rgb = planesToRgb(planes);
    cur = rgbToPlanes(rgb).y;

    let clean = true;
    forEachCell((bx, by, kx, ky, at) => {
      if (!clean) return;
      blockCoeffs(cur, width, bx, by, coeffs, scratch);
      if (modulate === "pair" && !keyless)
        blockCoeffs(cur, width, kx, ky, keyCoeffs, scratch);
      for (let k = 0; k < per; k++) {
        const r = raster[k];
        const got =
          modulate === "pair" && !keyless
            ? pairDecode(coeffs[r], keyCoeffs[r], M, deltas[k])
            : qimDecode(coeffs[r], M, deltas[k]);
        if (got !== (symbols[at + k] ?? 0)) {
          clean = false;
          return;
        }
      }
    });
    if (clean) break;
  }
  return { image: rgb, iterations };
}

function readInterior(
  plane: Float64Array,
  width: number,
  count: number,
  plan: Plan
): Uint8Array {
  const { border, IBW, IBH, path, raster, deltas, M, modulate, keyless, keymapFn, params } = plan;
  const per = raster.length;
  const coeffs = new Float64Array(BLOCK);
  const keyCoeffs = new Float64Array(BLOCK);
  const scratch = new Float64Array(BLOCK);
  const out = new Uint8Array(count);

  for (let p = 0, at = 0; p < path.length && at < count; p++, at += per) {
    const v = path[p];
    const lx = v % IBW, ly = (v / IBW) | 0;
    const [klx, kly] = keymapFn ? keymapFn(lx, ly, IBW, IBH, params) : [lx, ly];
    blockCoeffs(plane, width, lx + border, ly + border, coeffs, scratch);
    if (modulate === "pair" && !keyless)
      blockCoeffs(plane, width, klx + border, kly + border, keyCoeffs, scratch);
    for (let k = 0; k < per && at + k < count; k++) {
      const r = raster[k];
      out[at + k] =
        modulate === "pair" && !keyless
          ? pairDecode(coeffs[r], keyCoeffs[r], M, deltas[k])
          : qimDecode(coeffs[r], M, deltas[k]);
    }
  }
  return out;
}

/**
 * The interior traversal must not visit border blocks.
 *
 * `getPathIndices` walks an interior of IBW×IBH cells with no notion of a
 * frame, which is correct — the border offset is applied when the cell is
 * addressed, not when the path is built.
 */
function buildPlan(h: {
  carriers: number[];
  M: number;
  modulate: ModulateName;
  keymap: KeymapName;
  traversal: TraversalName;
  border: number;
  BW: number;
  BH: number;
  safety: number;
  params: TraversalParams;
}): Plan {
  const keyless = isKeylessKeymap(h.keymap);
  const IBW = h.BW - 2 * h.border;
  const IBH = h.BH - 2 * h.border;
  return {
    carriers: h.carriers,
    raster: h.carriers.map((c) => ZIGZAG[c]),
    deltas: deltasFor(h.carriers, h.M, h.safety),
    M: h.M,
    modulate: h.modulate,
    keyless,
    keymapFn: keyless ? null : resolveKeymap({ keymap: h.keymap, params: h.params }),
    params: h.params,
    border: h.border,
    IBW,
    IBH,
    path: dataPath(IBW, IBH, h.traversal, h.params, keyless),
  };
}

export interface CapacityOptions {
  keymap?: KeymapName;
  /** Only affects the default keymap, which follows it — see `defaultKeymap`. */
  modulate?: ModulateName;
  ecc?: EccLevel;
  M?: number;
  carriers?: number[];
}

export interface Capacity {
  blocksWide: number;
  blocksHigh: number;
  border: number;
  dataBlocks: number;
  /** Raw symbol slots before any coding. */
  symbols: number;
  /** Payload bytes available after ECC and the record table overhead. */
  bytes: number;
}

/**
 * What a canvas of this pixel size can actually hold.
 *
 * Sizing runs the other way in `encode` — the payload chooses the canvas — so
 * this exists for callers who have a fixed canvas and need to know what fits,
 * and to check the capacity table in Stegaprint.md §3 against the built format
 * rather than against arithmetic.
 */
export function capacity(
  width: number,
  height: number,
  opts: CapacityOptions = {}
): Capacity {
  const modulate = opts.modulate ?? DEFAULTS.modulate;
  const keymap = opts.keymap ?? defaultKeymap(modulate);
  const ecc = opts.ecc ?? DEFAULTS.ecc;
  const M = opts.M ?? DEFAULTS.M;
  const carriers = opts.carriers ?? DEFAULT_CARRIERS;
  const keyless = isKeylessKeymap(keymap);
  const { BW, BH } = blockDims(width, height);
  const border = borderForHeader(BW, BH);
  const IBW = BW - 2 * border, IBH = BH - 2 * border;
  const dataBlocks = dataPath(IBW, IBH, DEFAULTS.traversal, {}, keyless).length;
  const symbols = dataBlocks * carriers.length;
  const codedBits = symbols * bitsPerSymbol(M);
  return {
    blocksWide: BW,
    blocksHigh: BH,
    border,
    dataBlocks,
    symbols,
    bytes: Math.max(0, decodedByteCapacity(codedBits, ecc)),
  };
}

export function encode(opts: EncodeOptions): StegaImageData {
  const traversal = opts.traversal ?? DEFAULTS.traversal;
  const modulate = opts.modulate ?? DEFAULTS.modulate;
  const keymap = resolveKeymapName({
    keymap: opts.keymap ?? defaultKeymap(modulate),
  });
  // `pair` reads a key block; a keyless layout has none, so the difference it
  // encodes would be against a block that is also the data block. Refuse rather
  // than silently degrading to qim — the header would say "pair" either way.
  if (modulate === "pair" && isKeylessKeymap(keymap))
    throw new Error(
      `modulate "pair" needs a key block and keymap "${keymap}" provides none; ` +
        `use a locating keymap (adjacent, poles, mirror-x, mirror-y, offset, rotate) ` +
        `or modulate "qim"`
    );
  const ecc = opts.ecc ?? DEFAULTS.ecc;
  const M = opts.M ?? DEFAULTS.M;
  const carriers = opts.carriers ?? DEFAULT_CARRIERS;
  const safety = opts.safety ?? DEFAULT_SAFETY;
  const seed = (opts.seed ?? 0) >>> 0;
  const keyless = isKeylessKeymap(keymap);
  const params: TraversalParams = { seed };

  const bitLength = streamBitLength(opts.entries, ecc);
  const symbolCount = symbolsFor(bitLength, M);
  const aspect =
    opts.aspectRatio ?? opts.source.width / opts.source.height;

  let BW: number, BH: number, border: number;
  if (opts.width != null && opts.height != null) {
    ({ BW, BH } = blockDims(opts.width, opts.height));
    border = borderForHeader(BW, BH);
  } else {
    ({ BW, BH, border } = sizeCanvas(symbolCount, carriers.length, aspect, keyless));
  }

  const img = fitSource(opts.source, BW, BH);
  const planes = rgbToPlanes(img);

  // ---- payload → coded bits → symbols
  const stream = buildStream(opts.entries, crc32);
  const codedBits = encodePayload(stream, ecc);
  let symbols = bitsToSymbols(codedBits, M);
  const oneCopy = symbols.length;

  const plan = buildPlan({
    carriers: [...carriers], M, modulate, keymap, traversal,
    border, BW, BH, safety, params,
  });

  const slots = plan.path.length * carriers.length;

  // Spend the leftover interior on redundancy rather than leaving it blank.
  // The canvas has a floor set by the header ring, so a short payload otherwise
  // touches a small fraction of the blocks it paid for — 10% at 780 bytes. Whole
  // copies are majority-voted on decode, which is free robustness in exactly the
  // case that needs it (a mixed-quality re-encode chain).
  const maxRepeat = symbols.length ? Math.floor(slots / symbols.length) : 1;
  const repeat = Math.max(
    1,
    Math.min(255, opts.repeat === "auto" || opts.repeat == null
      ? maxRepeat
      : opts.repeat)
  );
  if (repeat > 1) {
    const filled = new Uint8Array(symbols.length * repeat);
    for (let r = 0; r < repeat; r++) filled.set(symbols, r * symbols.length);
    symbols = filled;
  }

  if (symbols.length > slots)
    throw new Error(
      `payload needs ${symbols.length} symbols, ${BW * N}×${BH * N} interior ` +
        `holds ${slots}` +
        (opts.width != null ? " — call capacity() to size the payload" : "")
    );

  const { image: out } = writeInterior(planes, symbols, plan);

  // ---- header, engraved into the border after the interior is final
  drawHeader(
    out, BW, BH, border,
    packHeader({
      version: 1,
      blocksWide: BW,
      blocksHigh: BH,
      border,
      M,
      carriers: [...carriers],
      traversal,
      keymap,
      modulate,
      ecc,
      qualityFloor: opts.qualityFloor ?? DEFAULTS.qualityFloor,
      entryCount: opts.entries.length,
      symbolCount: oneCopy,
      seed,
      repeat,
    })
  );
  return out;
}

/**
 * Majority-vote `repeat` copies of a symbol stream, position by position.
 *
 * Voting on symbols rather than on bits is what makes this worth doing: a
 * corrupted carrier moves a symbol to an adjacent QIM bin, so the wrong answers
 * scatter across the alphabet while the right one repeats. A tie falls back to
 * the first copy, which is no worse than not having voted.
 */
function voteSymbols(
  raw: Uint8Array,
  length: number,
  repeat: number,
  M: number
): Uint8Array {
  const out = new Uint8Array(length);
  const tally = new Uint16Array(M);
  for (let i = 0; i < length; i++) {
    tally.fill(0);
    for (let r = 0; r < repeat; r++) {
      const v = raw[r * length + i];
      if (v < M) tally[v]++;
    }
    let best = raw[i] < M ? raw[i] : 0;
    let bestN = tally[best];
    for (let v = 0; v < M; v++)
      if (tally[v] > bestN) { bestN = tally[v]; best = v; }
    out[i] = best;
  }
  return out;
}

export function decode(source: StegaImageData): DecodeResult {
  const { BW, BH } = blockDims(source.width, source.height);

  // The border depth is not known until the header is read, and the header
  // lives in the border — so the ring is enumerated in raster order, which
  // makes the first cells identical for every depth. Try each candidate depth
  // until one yields a header whose CRC passes.
  let header: StgpHeader | null = null;
  let lastErr: unknown;
  for (let b = CORNER; b <= Math.min(BW, BH) >> 1; b++) {
    try {
      const h = unpackHeader(readHeader(source, BW, BH, b));
      if (h.border === b) { header = h; break; }
    } catch (e) { lastErr = e; }
  }
  if (!header) throw lastErr ?? new Error("not a STGP image");

  const registered = checkCorners(source, BW, BH);
  const planes = rgbToPlanes(source);
  const params: TraversalParams = { seed: header.seed };
  const plan = buildPlan({
    carriers: header.carriers,
    M: header.M,
    modulate: header.modulate,
    keymap: header.keymap,
    traversal: header.traversal,
    border: header.border,
    BW, BH,
    safety: DEFAULT_SAFETY,
    params,
  });

  const repeat = Math.max(1, header.repeat);
  const raw = readInterior(
    planes.y,
    source.width,
    header.symbolCount * repeat,
    plan
  );
  const symbols = repeat > 1 ? voteSymbols(raw, header.symbolCount, repeat, header.M) : raw;
  const bits = symbolsToBits(
    symbols,
    header.M,
    symbols.length * bitsPerSymbol(header.M)
  );

  // Take every byte the coded bits can yield rather than a length read out of
  // the stream. `parseStream` clamps entries to what is actually there, so a
  // few ignored trailing bytes are free and a short buffer truncates one entry
  // instead of throwing (§7.2).
  const stream = decodePayload(
    bits,
    decodedByteCapacity(bits.length, header.ecc),
    header.ecc
  );

  return {
    entries: parseStream(stream, header.entryCount, crc32),
    header,
    registered,
  };
}

export { isBorderBlock, isCornerBlock, HEADER_SIZE };
