import type {
  ChannelIndex,
  ChannelPlan,
  ChannelSlot,
  ChannelSlotInput,
  CombineName,
  EncodeOptions,
  PackMode,
} from "./types";

export const CHANNEL_NAMES = ["r", "g", "b"] as const;
export const PACK_NAMES: readonly PackMode[] = ["packed", "aligned", "mono"];

const CH: Record<string, ChannelIndex> = { r: 0, g: 1, b: 2 };

/**
 * Compact descriptor token: "r.additive+g.xor+b.subtractive"
 * (omitted channels are inactive / passthrough).
 */
export function serializeChannelPlan(slots: ChannelSlot[]): string {
  return slots
    .map((s) => `${CHANNEL_NAMES[s.ch]}.${s.combine}`)
    .join("+");
}

/** Parse a compact descriptor token into ChannelSlot[]. */
export function parseChannelPlan(token: string): ChannelSlot[] {
  return String(token)
    .split("+")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const [c, comb] = t.split(".");
      return { ch: CH[c] as ChannelIndex, combine: (comb || "xor") as CombineName };
    })
    .filter((s) => s.ch === 0 || s.ch === 1 || s.ch === 2);
}

/**
 * Build ChannelSlot[] from a compact token ("r.additive+g.xor"), plain
 * letters ("rgb"/"bgr"), or an array of { ch|channel, combine } / letter strings.
 */
function slotsFromChannels(
  channels: string | ChannelSlotInput[],
  fallbackCombine: CombineName
): ChannelSlot[] {
  if (typeof channels === "string") {
    if (channels.includes(".") || channels.includes("+"))
      return parseChannelPlan(channels);
    return channels
      .toLowerCase()
      .split("")
      .filter((c) => c in CH)
      .map((c) => ({ ch: CH[c] as ChannelIndex, combine: fallbackCombine }));
  }
  return (channels || [])
    .map((s): { ch: number | undefined; combine: CombineName } => {
      if (typeof s === "string")
        return { ch: CH[s.toLowerCase()], combine: fallbackCombine };
      const key = s.ch ?? s.channel;
      const ch =
        typeof key === "number" ? key : CH[String(key).toLowerCase()];
      return { ch, combine: (s.combine as CombineName) || fallbackCombine };
    })
    .filter((s): s is ChannelSlot => s.ch === 0 || s.ch === 1 || s.ch === 2);
}

/**
 * Resolve a ChannelPlan from encode options.
 *
 * - `opts.pack === "mono"`: one stream byte broadcast to R=G=B (1 B/px).
 * - `opts.pack === "aligned"`: channel count = min(bytesPerSample, 3) so one
 *   audio sample always lands in one pixel; entry table padded to a pixel boundary.
 * - default ("packed"): packed R→G→B (3 B/px).
 *
 * @param opts        Encode options (combine, pack, channels, …).
 * @param bytesPerSample Bytes per audio sample (drives aligned channel count).
 * @param tableSize    Entry table byte length (drives alignment pad computation).
 */
export function normalizeChannelPlan(
  opts: Partial<Pick<EncodeOptions, "combine" | "pack" | "channels">> = {},
  bytesPerSample = 3,
  tableSize = 0
): ChannelPlan {
  const combine: CombineName = (opts.combine as CombineName) || "xor";

  // mono: one stream byte broadcast to all three channels — pure-luminance ghost
  if (opts.pack === "mono") {
    const slots: ChannelSlot[] = CHANNEL_NAMES.map((c) => ({
      ch: CH[c] as ChannelIndex,
      combine,
    }));
    return { slots, pad: 0, pack: "mono", bytesPerPixel: 1, broadcast: true };
  }

  const pack: PackMode = opts.pack === "aligned" ? "aligned" : "packed";
  let slots: ChannelSlot[];

  if (opts.channels) {
    slots = slotsFromChannels(opts.channels, combine);
  } else if (pack === "aligned") {
    const n = Math.min(Math.max(1, bytesPerSample | 0), 3);
    slots = CHANNEL_NAMES.slice(0, n).map((c) => ({
      ch: CH[c] as ChannelIndex,
      combine,
    }));
  } else {
    // packed default: r, g, b
    slots = CHANNEL_NAMES.map((c) => ({ ch: CH[c] as ChannelIndex, combine }));
  }

  if (!slots.length) slots = [{ ch: 0, combine }];

  const bpp = slots.length;
  const pad = pack === "aligned" ? (bpp - (tableSize % bpp)) % bpp : 0;
  return { slots, pad, pack, bytesPerPixel: bpp };
}

/**
 * True when this plan is the legacy default: packed, r→g→b, one shared combine.
 * Lets the STGC header stay compact and byte-identical to pre-channel-plan output.
 */
export function isDefaultPlan(plan: ChannelPlan): boolean {
  return (
    plan.pack === "packed" &&
    plan.slots.length === 3 &&
    plan.slots.every((s, i) => s.ch === i) &&
    plan.slots[0].combine === plan.slots[1].combine &&
    plan.slots[1].combine === plan.slots[2].combine
  );
}
