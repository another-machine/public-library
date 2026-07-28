/** Reversible mapping between an audio byte and a pixel channel value. */
export type CombineName =
  | "xor"
  | "additive"
  | "subtractive"
  | "midpoint"
  | "difference"
  | "bitshift"
  | "noise"
  | "echo"
  | "signed"
  | "veil"
  | "whisper";

/** Which key pixel pairs with each data pixel. */
export type KeymapName =
  | "adjacent"
  | "poles"
  | "mirror-x"
  | "mirror-y"
  | "offset"
  | "rotate";

/** Order in which data pixels are visited during encode / decode. */
export type TraversalName =
  | "raster"
  | "boustrophedon"
  | "spiral"
  | "angle"
  | "fisher-yates"
  | "center-out"
  | "hilbert"
  | "polar"
  | "bayer";

/** Packing mode for the channel plan. */
export type PackMode = "packed" | "aligned" | "mono";

/** 0=R, 1=G, 2=B */
export type ChannelIndex = 0 | 1 | 2;

/** One slot in a channel plan: a channel index and its combine op. */
export interface ChannelSlot {
  ch: ChannelIndex;
  combine: CombineName;
}

/**
 * Loose channel-slot input accepted by encode options: a letter ("r"),
 * a { ch | channel, combine? } object (ch as index or letter), or a full slot.
 */
export type ChannelSlotInput =
  | string
  | {
      ch?: ChannelIndex | string;
      channel?: ChannelIndex | string;
      combine?: CombineName;
    };

/** Resolved channel plan passed through encode/decode. */
export interface ChannelPlan {
  slots: ChannelSlot[];
  /** Zero-fill gap between entry table and first payload (aligned mode). */
  pad: number;
  pack: PackMode;
  /** Payload bytes consumed per data pixel (= slots.length, or 1 for mono). */
  bytesPerPixel: number;
  /** If true, one stream byte is broadcast to all channel slots (mono mode). */
  broadcast?: boolean;
}

/** An input payload entry to embed into the image. */
export interface Entry {
  mimetype: string;
  name?: string;
  /** Raw bytes, ArrayBuffer, or a UTF-8 string. */
  data: Uint8Array | ArrayBuffer | string;
}

/** A decoded payload entry recovered from an image. */
export interface DecodedEntry {
  mimetype: string;
  name: string;
  data: Uint8Array;
  dataOffset: number;
}

/**
 * Environment-agnostic pixel buffer — structurally compatible with DOM
 * ImageData and pngjs PNG rows.
 */
export interface StegaImageData {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

/** Optional parameters stored in the STGC descriptor for certain traversals / keymaps. */
export interface TraversalParams {
  /** fisher-yates seed (uint32). */
  seed?: number;
  /** angle traversal: sort key weight on x. */
  a?: number;
  /** angle traversal: sort key weight on y. */
  b?: number;
  /** offset keymap: x offset (signed, torus-wrapped). */
  kx?: number;
  /** offset keymap: y offset (signed, torus-wrapped). */
  ky?: number;
}

/** Full options recovered from a decoded STGC header. */
export interface StgcOpts {
  borderWidth: number;
  combine: CombineName;
  keymap: KeymapName;
  traversal: TraversalName;
  params: TraversalParams;
  plan: ChannelPlan;
  pack: PackMode;
  interiorByteLength: number;
}

/** Options accepted by Stegassette.encode / encodeImageData. */
export interface EncodeOptions {
  /** Payload entries to embed. */
  entries: Entry[];
  /** Combine op applied to each channel slot (default "xor"). */
  combine?: CombineName;
  /** Keymap pairing data pixels to key pixels (default "adjacent"). */
  keymap?: KeymapName;
  /** Traversal order for data pixels (default "raster"). */
  traversal?: TraversalName;
  /** Explicitly resolved channel plan (overrides channels / pack). */
  plan?: ChannelPlan;
  /** Channel slot shorthand, e.g. "rgb", "bgr", "r.additive+g.xor", or an array of slots / letters / { ch|channel, combine? }. */
  channels?: string | ChannelSlotInput[];
  /** Packing mode (default "packed"). */
  pack?: PackMode;
  /**
   * Border width.
   *   ≥ 1  → integer extra pixels beyond the mandatory 1 px header ring: 1 + floor(n).
   *   0 < f < 1 → fraction of the final image width (consistent across series).
   * Default 1.
   */
  border?: number;
  /** Target aspect ratio for auto-sizing. Defaults to source image aspect. */
  aspectRatio?: number;
  /**
   * Bytes per audio sample (e.g. 1/2/3 for 8/16/24-bit PCM).
   * Only needed for aligned channel plans.
   */
  bytesPerSample?: number;
  /** Traversal/keymap params; top-level shorthand fields are merged in. */
  params?: TraversalParams;
  /** fisher-yates seed shorthand (merged into params.seed). */
  seed?: number;
  /** angle traversal a shorthand (merged into params.a). */
  a?: number;
  /** angle traversal b shorthand (merged into params.b). */
  b?: number;
  /** offset keymap x shorthand (merged into params.kx). */
  kx?: number;
  /** offset keymap y shorthand (merged into params.ky). */
  ky?: number;
}

/** Parameters for building an RFC-2586 audio mimetype. */
export interface AudioMimeParams {
  bits: 8 | 16 | 24;
  rate: number;
  channels: number;
  layout?: "planar" | "interleaved" | "block";
  blockSize?: number;
}
