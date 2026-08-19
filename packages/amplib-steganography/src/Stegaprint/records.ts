/**
 * Entry records — fixed width, so the parser has no state to desynchronize.
 *
 * This is the redesign argued for in Stegaprint.md §7.2, and the reason the
 * format needs no error correction on its own structure. Stegassette's table
 * advances the read offset by values that came off the wire:
 *
 *     off += mtLen        // ← mtLen was just read from the stream
 *
 * One bad bit in an unbounded length there does not corrupt an entry, it
 * relocates every field after it, and the file decodes to nothing. Here every
 * record is exactly RECORD_SIZE bytes at a known offset, so a corrupted field
 * corrupts itself and stops.
 */

export const RECORD_SIZE = 32;

/**
 * Payload lengths are counted in CHUNK-byte units, not bytes (§7.2).
 *
 * The point is the failure mode. A bit error in a byte length yields a wildly
 * wrong slice; the same error in a chunk count yields a payload that is short
 * or long by some power of two chunks — audio that ends early, or a burst of
 * noise at the tail. Both are degradation rather than absence.
 */
export const CHUNK = 16;

/**
 * Largest chunk count a record can address (uint32).
 *
 * Bounded on purpose — §7.2 wants lengths that cannot express nonsense — but
 * bounded far above any real payload rather than at 1 MiB. Decode still clamps
 * to what the stream actually holds, so a corrupted count truncates one entry
 * instead of throwing.
 */
export const MAX_CHUNKS = 0xffffffff;

/** Payload type registry — replaces the variable-length mimetype string. */
export enum EntryType {
  Binary = 0,
  Text = 1,
  Json = 2,
  Audio = 3,
  Pointer = 4,
  Jpeg = 5,
  Png = 6,
}

const MIME: Record<number, string> = {
  [EntryType.Binary]: "application/octet-stream",
  [EntryType.Text]: "text/plain",
  [EntryType.Json]: "application/json",
  [EntryType.Pointer]: "application/vnd.stegaprint.pointer+json",
  [EntryType.Jpeg]: "image/jpeg",
  [EntryType.Png]: "image/png",
};

const NAME_BYTES = 18;

/** Audio format, packed into the record's 4 param bytes. */
export interface AudioParams {
  bits: 4 | 8 | 16 | 24;
  rate: number;
  channels: number;
}

const BITS_CODE: Record<number, number> = { 4: 0, 8: 1, 16: 2, 24: 3 };
const CODE_BITS: Array<4 | 8 | 16 | 24> = [4, 8, 16, 24];

export interface PrintEntry {
  type: EntryType;
  name: string;
  data: Uint8Array;
  audio?: AudioParams;
}

export interface DecodedRecord {
  type: EntryType;
  mimetype: string;
  name: string;
  chunkCount: number;
  /** Zero-padding bytes in the final chunk; `data` already excludes them. */
  pad: number;
  audio?: AudioParams;
  /** CRC-32 of the payload as written. Diagnostic only — see `crcOk`. */
  crc: number;
}

export interface DecodedPrintEntry extends DecodedRecord {
  data: Uint8Array;
  /**
   * Whether the payload still matches its recorded CRC.
   *
   * This never causes a decode to fail. It marks an entry as damaged so a
   * caller can decide — which is the whole difference between this format and
   * one that throws: a grainy payload is a legitimate outcome (§7.3).
   */
  crcOk: boolean;
}

export function mimeFor(rec: { type: EntryType; audio?: AudioParams }): string {
  if (rec.type === EntryType.Audio && rec.audio) {
    const { bits, rate, channels } = rec.audio;
    return `audio/L${bits}; rate=${rate}; channels=${channels}`;
  }
  return MIME[rec.type] ?? MIME[EntryType.Binary];
}

/** Bytes of payload for a chunk count, i.e. the padded length. */
export function chunkBytes(chunkCount: number): number {
  return chunkCount * CHUNK;
}

export function chunksFor(byteLength: number): number {
  return Math.ceil(byteLength / CHUNK);
}

// ---- serialization ---------------------------------------------

function writeRecord(
  out: Uint8Array,
  at: number,
  e: PrintEntry,
  crc: number
): void {
  const v = new DataView(out.buffer, out.byteOffset + at, RECORD_SIZE);
  const chunks = chunksFor(e.data.length);
  // Never clamp a length. A uint16 chunk count silently truncated anything over
  // 65535 chunks — exactly 1 MiB — and the loss was invisible: the record
  // claimed the shorter length, the CRC was computed over the shorter payload,
  // and decode returned a byte-perfect prefix of a file that was quietly cut in
  // half. Refusing is the only honest option, and the count is now 32-bit so the
  // ceiling is 64 GiB rather than 1 MiB.
  if (chunks > MAX_CHUNKS)
    throw new Error(
      `entry "${e.name || ""}" is ${e.data.length} bytes; the record can address ` +
        `${MAX_CHUNKS * CHUNK} (${MAX_CHUNKS} chunks of ${CHUNK})`
    );
  v.setUint8(0, e.type & 0xff);
  v.setUint8(1, 0); // flags, reserved
  v.setUint32(2, chunks, true);
  if (e.type === EntryType.Audio && e.audio) {
    v.setUint8(6, (BITS_CODE[e.audio.bits] & 0x0f) | ((e.audio.channels & 0x0f) << 4));
    v.setUint16(7, Math.min(0xffff, e.audio.rate), true);
  } else {
    v.setUint8(6, 0);
    v.setUint16(7, 0, true);
  }
  // Bytes of zero padding in the final chunk. Lengths are counted in chunks so
  // that a corrupted one degrades instead of relocating the stream (§7.2), and
  // the cost is that the exact byte length is otherwise unrecoverable: a binary
  // payload comes back with up to CHUNK-1 trailing zeros that are
  // indistinguishable from content. One byte buys the exact length back without
  // reintroducing an unbounded length field.
  v.setUint8(9, (chunkBytes(chunks) - e.data.length) & 0xff);
  const name = new TextEncoder().encode(e.name || "").subarray(0, NAME_BYTES);
  out.set(name, at + 10);
  for (let i = name.length; i < NAME_BYTES; i++) out[at + 10 + i] = 0;
  v.setUint32(28, crc >>> 0, true);
}

function readRecord(buf: Uint8Array, at: number): DecodedRecord {
  const v = new DataView(buf.buffer, buf.byteOffset + at, RECORD_SIZE);
  const type = v.getUint8(0) as EntryType;
  const chunkCount = v.getUint32(2, true);
  let audio: AudioParams | undefined;
  if (type === EntryType.Audio) {
    const b = v.getUint8(6);
    audio = {
      bits: CODE_BITS[b & 0x0f] ?? 8,
      channels: Math.max(1, (b >> 4) & 0x0f),
      rate: v.getUint16(7, true) || 8000,
    };
  }
  // Clamped: a corrupted pad byte must not make a payload longer than its own
  // chunks, nor negative.
  const pad = Math.min(CHUNK - 1, v.getUint8(9));
  const raw = buf.subarray(at + 10, at + 10 + NAME_BYTES);
  let end = raw.indexOf(0);
  if (end < 0) end = NAME_BYTES;
  const name = new TextDecoder().decode(raw.subarray(0, end));
  const rec: DecodedRecord = {
    type,
    mimetype: "",
    name,
    chunkCount,
    pad,
    audio,
    crc: v.getUint32(28, true),
  };
  rec.mimetype = mimeFor(rec);
  return rec;
}

/**
 * Serialize the record table followed by chunk-padded payloads.
 *
 * Payloads are padded to CHUNK so that a length is always expressible as a
 * chunk count and the next payload always starts where the count says.
 */
export function buildStream(
  entries: PrintEntry[],
  crc32: (b: Uint8Array) => number
): Uint8Array {
  const tableSize = entries.length * RECORD_SIZE;
  const payloadSize = entries.reduce(
    (s, e) => s + chunkBytes(chunksFor(e.data.length)),
    0
  );
  const out = new Uint8Array(tableSize + payloadSize);
  let payloadAt = tableSize;
  entries.forEach((e, i) => {
    const padded = chunkBytes(chunksFor(e.data.length));
    out.set(e.data, payloadAt);
    writeRecord(out, i * RECORD_SIZE, e, crc32(out.subarray(payloadAt, payloadAt + padded)));
    payloadAt += padded;
  });
  return out;
}

/**
 * Parse the table and slice payloads back out.
 *
 * Every length is clamped to what the stream actually holds (§7.2), so a
 * corrupted chunk count truncates one entry instead of throwing. Nothing here
 * can fail; a caller inspects `crcOk` to learn whether it should trust what it
 * got.
 */
export function parseStream(
  stream: Uint8Array,
  entryCount: number,
  crc32: (b: Uint8Array) => number
): DecodedPrintEntry[] {
  const n = Math.max(0, Math.min(entryCount, Math.floor(stream.length / RECORD_SIZE)));
  const recs: DecodedRecord[] = [];
  for (let i = 0; i < n; i++) recs.push(readRecord(stream, i * RECORD_SIZE));

  const out: DecodedPrintEntry[] = [];
  let at = n * RECORD_SIZE;
  for (const rec of recs) {
    const want = chunkBytes(rec.chunkCount);
    const avail = Math.max(0, stream.length - at);
    const take = Math.min(want, avail);
    const padded = stream.subarray(at, at + take);
    // The CRC was taken over the padded chunk as written, so it is checked
    // against that; the caller gets the payload with the padding removed.
    const crcOk = take === want && crc32(padded) === rec.crc;
    const data = padded.subarray(0, Math.max(0, take - rec.pad));
    out.push({ ...rec, data, crcOk });
    at += take;
  }
  return out;
}
