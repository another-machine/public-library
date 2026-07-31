import { Img } from "./Img";
import { COMBINE, ENCODE_OP, KEY_MOD } from "./combine";
import { buildInteriorStream, containerInteriorBytes, entryTableSize, parseEntryTable } from "./entries";
import { applyAlphaHeader, isDefaultPlan, packStgcHeader, serializeChannelPlan, unpackStgcHeaderAlpha } from "./header";
import { isKeylessKeymap, resolveKeyField, resolveKeymap, resolveKeymapName } from "./keymap";

/**
 * Combines that rewrite the key pixel, and so cannot be used keyless.
 *
 * These ops split the payload: part into the data pixel, the rest stashed in
 * the key pixel. A keyless encode has no second pixel to stash into, so the
 * stashed bits would be unrecoverable — the payload would round-trip wrong
 * rather than merely looking different. Rejected loudly instead.
 */
function assertCombinesAllowed(
  keymap: KeymapName,
  slots: ChannelPlan["slots"]
): void {
  if (!isKeylessKeymap(keymap)) return;
  const bad = [...new Set(slots.filter((s) => KEY_MOD[s.combine]).map((s) => s.combine))];
  if (bad.length)
    throw new Error(
      `combine ${bad.map((c) => `"${c}"`).join(", ")} cannot be used with keymap ` +
        `"${keymap}": it rewrites the key pixel, and a keyless encode has none. ` +
        `Use xor, additive, subtractive, bitshift or signed.`
    );
}
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
  const keyless = isKeylessKeymap(opts.keymap);
  const path = getPathIndices(IW, IH, opts.traversal || "raster", opts.params, keyless);
  const { slots, broadcast } = opts.plan;
  const km = keyless ? null : resolveKeymap(opts);
  const field = keyless ? resolveKeyField(opts.keymap) : null;
  const params = opts.params;
  let ai = 0;

  for (let pi = 0; pi < path.length; pi++) {
    if (ai >= stream.length) break;
    const v = path[pi];
    const lx = v % IW, ly = (v / IW) | 0;
    const dx = lx + B, dy = ly + B;
    const [klx, kly] = km ? km(lx, ly, IW, IH, params) : [lx, ly];
    const kx = klx + B, ky = kly + B;

    // Keyless generates the key per channel from position rather than reading
    // a pixel, so no pixel is consumed and none is written back.
    const k: [number, number, number] = field
      ? [field(lx, ly, 0, IW, IH, params), field(lx, ly, 1, IW, IH, params), field(lx, ly, 2, IW, IH, params)]
      : keyImg.get(kx, ky);
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
    // keyTouched can only be set by a KEY_MOD combine, and those are rejected
    // for keyless encodes before we get here — writing (kx, ky) would clobber
    // the data pixel itself, since keyless maps a pixel to its own position.
    if (keyTouched && !keyless) img.set(kx, ky, outK[0], outK[1], outK[2]);
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
  const keyless = isKeylessKeymap(opts.keymap);
  const path = getPathIndices(IW, IH, opts.traversal || "raster", opts.params, keyless);
  const { slots, broadcast } = opts.plan;
  const km = keyless ? null : resolveKeymap(opts);
  const field = keyless ? resolveKeyField(opts.keymap) : null;
  const params = opts.params;
  const out = new Uint8Array(byteLength);
  let ai = 0;

  for (let pi = 0; pi < path.length; pi++) {
    if (ai >= byteLength) break;
    const v = path[pi];
    const lx = v % IW, ly = (v / IW) | 0;
    const [klx, kly] = km ? km(lx, ly, IW, IH, params) : [lx, ly];
    const dx = lx + B, dy = ly + B;
    const kx = klx + B, ky = kly + B;
    const e_ = img.get(dx, dy);
    // Recomputed from position, exactly as at encode — this is what lets the
    // key cost no pixels: the decoder derives it from the header alone.
    const k: [number, number, number] = field
      ? [field(lx, ly, 0, IW, IH, params), field(lx, ly, 1, IW, IH, params), field(lx, ly, 2, IW, IH, params)]
      : keyImg.get(kx, ky);

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

  const keymap: KeymapName = resolveKeymapName(opts);
  const traversal = opts.traversal || "raster";
  const combine: CombineName = opts.combine || "xor";
  assertCombinesAllowed(keymap, plan.slots);

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

  // The header flows along the border ring (two pixels per byte), so the
  // constraint is ring capacity rather than image width.
  const ringPx =
    srcImg.width * srcImg.height -
    Math.max(0, srcImg.width - 2 * B) * Math.max(0, srcImg.height - 2 * B);
  if (hdrBytes.length * 2 + 6 > ringPx)
    throw new Error(
      `border ring too small for STGC header (need ${
        hdrBytes.length * 2 + 6
      }px, ring is ${ringPx})`
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
