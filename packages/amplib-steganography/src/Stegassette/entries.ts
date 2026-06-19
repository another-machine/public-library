import type { AudioMimeParams, DecodedEntry, Entry } from "./types";

/** Coerce various input types to Uint8Array (copies non-Uint8Array inputs). */
function toU8(data: Uint8Array | ArrayBuffer | string | null | undefined): Uint8Array {
  if (!data) return new Uint8Array(0);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === "string") return new TextEncoder().encode(data);
  return new Uint8Array(data as unknown as ArrayBufferLike);
}

/**
 * Byte length of the entry-table records alone (no pad, no payloads).
 * Used to compute the alignment pad for "aligned" channel plans.
 */
export function entryTableSize(entries: Entry[]): number {
  const enc = new TextEncoder();
  let n = 0;
  for (const e of entries)
    n +=
      2 +
      enc.encode(e.mimetype || "application/octet-stream").length +
      2 +
      enc.encode(e.name || "").length +
      4;
  return n;
}

/**
 * Total interior stream bytes: table records + all payload bytes.
 * Does NOT include the alignment pad (pad depends on the resolved channel plan).
 */
export function containerInteriorBytes(entries: Entry[]): number {
  const enc = new TextEncoder();
  let total = 0;
  for (const e of entries) {
    total += 2 + enc.encode(e.mimetype || "application/octet-stream").length;
    total += 2 + enc.encode(e.name || "").length;
    total += 4;
    total += e.data ? toU8(e.data).length : 0;
  }
  return total;
}

/**
 * Build the complete interior byte stream:
 *   [entry table records] [pad × zero bytes] [payload 0] [payload 1] …
 *
 * `pad` aligns the first payload to a pixel boundary (aligned channel plans).
 */
export function buildInteriorStream(
  entries: Entry[],
  pad = 0
): Uint8Array {
  const enc = new TextEncoder();
  const norm = entries.map((e) => ({
    mt: enc.encode(e.mimetype || "application/octet-stream"),
    nm: enc.encode(e.name || ""),
    data: toU8(e.data),
  }));

  let tableSize = 0;
  for (const r of norm) tableSize += 2 + r.mt.length + 2 + r.nm.length + 4;
  const totalPayload = norm.reduce((s, r) => s + r.data.length, 0);
  const stream = new Uint8Array(tableSize + pad + totalPayload);

  let off = 0;
  for (const r of norm) {
    stream[off++] = r.mt.length & 0xff;
    stream[off++] = (r.mt.length >> 8) & 0xff;
    stream.set(r.mt, off);
    off += r.mt.length;
    stream[off++] = r.nm.length & 0xff;
    stream[off++] = (r.nm.length >> 8) & 0xff;
    stream.set(r.nm, off);
    off += r.nm.length;
    const dl = r.data.length;
    stream[off++] = dl & 0xff;
    stream[off++] = (dl >> 8) & 0xff;
    stream[off++] = (dl >> 16) & 0xff;
    stream[off++] = (dl >> 24) & 0xff;
  }
  off += pad; // zero-filled alignment gap
  for (const r of norm) {
    stream.set(r.data, off);
    off += r.data.length;
  }
  return stream;
}

/**
 * Parse entry-table records from the beginning of the interior stream.
 * Returns DecodedEntry[] with absolute dataOffset values within the stream.
 */
export function parseEntryTable(
  stream: Uint8Array,
  entryCount: number,
  pad = 0
): DecodedEntry[] {
  const dec = new TextDecoder();
  const meta: Array<{ mimetype: string; name: string; payloadLen: number; dataOffset: number }> = [];
  let off = 0;

  for (let i = 0; i < entryCount; i++) {
    const mtLen = stream[off] | (stream[off + 1] << 8);
    off += 2;
    const mimetype = dec.decode(stream.slice(off, off + mtLen));
    off += mtLen;
    const nmLen = stream[off] | (stream[off + 1] << 8);
    off += 2;
    const name = dec.decode(stream.slice(off, off + nmLen));
    off += nmLen;
    const payloadLen =
      ((stream[off] |
        (stream[off + 1] << 8) |
        (stream[off + 2] << 16) |
        (stream[off + 3] << 24)) >>>
        0);
    off += 4;
    meta.push({ mimetype, name, payloadLen, dataOffset: 0 });
  }

  let payloadOff = off + pad; // skip alignment gap before first payload
  for (const m of meta) {
    m.dataOffset = payloadOff;
    payloadOff += m.payloadLen;
  }

  return meta.map((m) => ({
    mimetype: m.mimetype,
    name: m.name,
    data: stream.slice(m.dataOffset, m.dataOffset + m.payloadLen),
    dataOffset: m.dataOffset,
  }));
}

// ---- RFC-2586 audio mimetype helpers --------------------------

/**
 * Build an RFC-2586 audio mimetype string.
 * Example: "audio/L16; rate=44100; channels=2; layout=interleaved"
 */
export function buildAudioMime(params: AudioMimeParams): string {
  let s = `audio/L${params.bits}; rate=${params.rate}; channels=${params.channels}`;
  if (params.layout && params.layout !== "planar") s += `; layout=${params.layout}`;
  if (params.layout === "block" && params.blockSize) s += `; block=${params.blockSize}`;
  return s;
}

/** Parse an RFC-2586 audio mimetype string into its fields. */
export function parseAudioMime(s: string): Required<AudioMimeParams> {
  const bits = parseInt(
    (s.match(/audio\/L(\d+)/i) || [])[1] || "16"
  ) as 8 | 16 | 24;
  const rate = parseInt((s.match(/rate=(\d+)/i) || [])[1] || "44100");
  const channels = parseInt((s.match(/channels=(\d+)/i) || [])[1] || "1");
  const layout = ((s.match(/layout=([\w-]+)/i) || [])[1] || "planar") as
    | "planar"
    | "interleaved"
    | "block";
  const blockSize = parseInt((s.match(/block=(\d+)/i) || [])[1]) || 0;
  return { bits, rate, channels, layout, blockSize };
}
