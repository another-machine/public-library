import { Img } from "./Img";
import { COMBINE, ENCODE_OP, KEY_MOD } from "./combine";
import { buildInteriorStream, containerInteriorBytes, entryTableSize, parseEntryTable } from "./entries";
import { applyAlphaHeader, isDefaultPlan, packStgcHeader, serializeChannelPlan, unpackStgcHeaderAlpha } from "./header";
import { KEYMAP } from "./keymap";
import { normalizeChannelPlan } from "./channelPlan";
import { getPathIndices } from "./traversal";
import type {
  ChannelPlan,
  CombineName,
  DecodedEntry,
  Entry,
  EncodeOptions,
  KeymapName,
  StgcOpts,
  TraversalParams,
} from "./types";

// ---- internal helpers -----------------------------------------

interface InternalOpts {
  borderWidth: number;
  combine: CombineName;
  keymap: KeymapName;
  traversal: EncodeOptions["traversal"];
  params: TraversalParams;
  plan: ChannelPlan;
}

function writeInterior(
  img: Img,
  keyImg: Img,
  stream: Uint8Array,
  opts: InternalOpts
): void {
  const B = opts.borderWidth;
  const IW = img.width - 2 * B, IH = img.height - 2 * B;
  const path = getPathIndices(IW, IH, opts.traversal || "raster", opts.params);
  const { slots, broadcast } = opts.plan;
  const km = KEYMAP[opts.keymap || "adjacent"];
  if (!km) throw new Error(`unknown keymap: ${opts.keymap}`);
  const params = opts.params;
  let ai = 0;

  for (let pi = 0; pi < path.length; pi++) {
    if (ai >= stream.length) break;
    const v = path[pi];
    const lx = v % IW, ly = (v / IW) | 0;
    const dx = lx + B, dy = ly + B;
    const [klx, kly] = km(lx, ly, IW, IH, params);
    const kx = klx + B, ky = kly + B;

    const k = keyImg.get(kx, ky);
    const cur = img.get(dx, dy);
    const outD: [number, number, number] = [cur[0], cur[1], cur[2]];
    const outK: [number, number, number] = [k[0], k[1], k[2]];
    let keyTouched = false;

    // broadcast: one stream byte painted onto every channel slot
    const broadcastByte =
      broadcast ? (ai < stream.length ? stream[ai++] : 0) : null;

    for (const slot of slots) {
      const a =
        broadcastByte !== null
          ? broadcastByte
          : ai < stream.length
            ? stream[ai++]
            : 0;
      const c = slot.ch;
      const op = ENCODE_OP[slot.combine];
      const keyModFn = KEY_MOD[slot.combine];
      if (keyModFn) {
        const mk = keyModFn(a, k[c], cur[c]);
        outK[c] = mk;
        outD[c] = op(a, mk, cur[c]);
        keyTouched = true;
      } else {
        outD[c] = op(a, k[c], cur[c]);
      }
    }

    img.set(dx, dy, outD[0], outD[1], outD[2]);
    if (keyTouched) img.set(kx, ky, outK[0], outK[1], outK[2]);
  }
}

function readInterior(
  img: Img,
  keyImg: Img,
  byteLength: number,
  opts: InternalOpts
): Uint8Array {
  const B = opts.borderWidth;
  const IW = img.width - 2 * B, IH = img.height - 2 * B;
  const path = getPathIndices(IW, IH, opts.traversal || "raster", opts.params);
  const { slots, broadcast } = opts.plan;
  const km = KEYMAP[opts.keymap || "adjacent"];
  if (!km) throw new Error(`unknown keymap: ${opts.keymap}`);
  const params = opts.params;
  const out = new Uint8Array(byteLength);
  let ai = 0;

  for (let pi = 0; pi < path.length; pi++) {
    if (ai >= byteLength) break;
    const v = path[pi];
    const lx = v % IW, ly = (v / IW) | 0;
    const [klx, kly] = km(lx, ly, IW, IH, params);
    const dx = lx + B, dy = ly + B;
    const kx = klx + B, ky = kly + B;
    const e_ = img.get(dx, dy), k = keyImg.get(kx, ky);

    // broadcast: decode from first slot only (all channels carry the same byte)
    if (broadcast) {
      if (ai >= byteLength) break;
      const s0 = slots[0];
      out[ai++] = COMBINE[s0.combine](e_[s0.ch], k[s0.ch]);
    } else {
      for (const slot of slots) {
        if (ai >= byteLength) break;
        out[ai++] = COMBINE[slot.combine](e_[slot.ch], k[slot.ch]);
      }
    }
  }
  return out;
}

// ---- public container entry points ----------------------------

/** Merge top-level seed/a/b/kx/ky shortcuts into a single params object. */
function mergeParams(opts: Partial<EncodeOptions>): TraversalParams {
  return {
    ...(opts.params || {}),
    ...(opts.seed != null ? { seed: opts.seed } : {}),
    ...(opts.a != null ? { a: opts.a } : {}),
    ...(opts.b != null ? { b: opts.b } : {}),
    ...(opts.kx != null ? { kx: opts.kx } : {}),
    ...(opts.ky != null ? { ky: opts.ky } : {}),
  };
}

/**
 * Encode entries into a copy of `srcImg`. When `keyImg` is omitted the image
 * is self-keying (the cover image serves as the key, which is the common case).
 *
 * Returns a new Img — the original `srcImg` is not modified.
 */
export function encodeContainer(
  entries: Entry[],
  srcImg: Img,
  opts: Omit<EncodeOptions, "entries" | "border"> & { borderWidth: number },
  keyImg?: Img
): Img {
  const key = keyImg ?? srcImg;
  const B = opts.borderWidth;
  const outImg = new Img(srcImg.width, srcImg.height, new Uint8Array(srcImg.data));

  // Resolve channel plan; table size is needed to compute alignment pad.
  const plan =
    opts.plan ??
    normalizeChannelPlan(
      { combine: opts.combine, pack: opts.pack, channels: opts.channels },
      opts.bytesPerSample ?? 3,
      entryTableSize(entries)
    );

  const stream = buildInteriorStream(entries, plan.pad);

  // Generate a fisher-yates seed if none was provided
  const params = mergeParams(opts);
  if ((opts.traversal || "raster") === "fisher-yates" && params.seed == null) {
    params.seed = (Math.random() * 0x100000000) >>> 0;
  }

  const keymap: KeymapName = opts.keymap || "adjacent";
  const traversal = opts.traversal || "raster";
  const combine: CombineName = opts.combine || "xor";

  const hdrBytes = packStgcHeader({
    combine,
    keymap,
    traversal,
    interiorByteLength: stream.length,
    entryCount: entries.length,
    params,
    // omit channel-plan fields for the legacy default or mono (pack=mono in header suffices)
    ch:
      isDefaultPlan(plan) || plan.broadcast
        ? undefined
        : serializeChannelPlan(plan.slots),
    pad: plan.pad,
    pack: plan.pack,
  });

  if (hdrBytes.length > srcImg.width)
    throw new Error(
      `image too narrow for STGC header (need ${hdrBytes.length}px, width is ${srcImg.width})`
    );

  writeInterior(outImg, key, stream, { borderWidth: B, combine, keymap, traversal, params, plan });

  // apply after interior write: KEY_MOD ops may have reset border pixel alpha to 255
  applyAlphaHeader(outImg, B, hdrBytes);

  return outImg;
}

/**
 * Decode entries from an encoded image. When `keyImg` is omitted the image
 * decodes itself (self-keying is the normal STGC usage).
 */
export function decodeContainer(
  encImg: Img,
  keyImg?: Img
): { entries: DecodedEntry[]; opts: StgcOpts } {
  const key = keyImg ?? encImg;
  const hdr = unpackStgcHeaderAlpha(encImg);

  const internalOpts: InternalOpts = {
    borderWidth: hdr.B,
    combine: hdr.combine,
    keymap: hdr.keymap,
    traversal: hdr.traversal,
    params: hdr.params,
    plan: hdr.plan,
  };

  const stream = readInterior(
    encImg,
    key,
    hdr.interiorByteLength,
    internalOpts
  );

  const entries = parseEntryTable(stream, hdr.entryCount, hdr.plan.pad);

  const stgcOpts: StgcOpts = {
    borderWidth: hdr.B,
    combine: hdr.combine,
    keymap: hdr.keymap,
    traversal: hdr.traversal,
    params: hdr.params,
    plan: hdr.plan,
    pack: hdr.pack,
    interiorByteLength: hdr.interiorByteLength,
  };

  return { entries, opts: stgcOpts };
}

// Re-export so callers can compute capacity without going through the full encode
export { containerInteriorBytes, entryTableSize };
