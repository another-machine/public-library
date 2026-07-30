/**
 * Minimal RIFF/WAVE reader and writer for the Node entry point.
 *
 * Ported from the lab's `lib/wav.js`. Deliberately tiny: it handles the
 * uncompressed PCM files the encode pipeline actually produces and consumes,
 * not the full WAVE zoo. Anything exotic should go through ffmpeg instead.
 */

export interface WavData {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** Raw PCM bytes, exactly as stored in the data chunk. */
  data: Uint8Array;
}

/** Parse a WAV file's bytes into its format fields and raw PCM payload. */
export function decodeWav(bytes: Uint8Array): WavData {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.subarray(start, end));

  if (bytes.byteLength < 12) throw new Error("Not a RIFF file (too short)");
  if (ascii(0, 4) !== "RIFF") throw new Error("Not a RIFF file");
  if (ascii(8, 12) !== "WAVE") throw new Error("Not a WAVE file");

  let offset = 12;
  let sampleRate: number | undefined;
  let channels: number | undefined;
  let bitsPerSample: number | undefined;
  let dataStart: number | undefined;
  let dataLength = 0;

  // Walk the chunk list. Chunks are word-aligned, so an odd size is followed
  // by a pad byte that is not counted in the size field.
  while (offset < bytes.byteLength - 8) {
    const id = ascii(offset, offset + 4);
    const size = view.getUint32(offset + 4, true);

    if (id === "fmt ") {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (id === "data") {
      dataStart = offset + 8;
      dataLength = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }

  if (!sampleRate || dataStart === undefined) throw new Error("Malformed WAV");

  // Clamp to what is actually present — truncated files are common enough
  // that trusting the header's length outright causes confusing overruns.
  const end = Math.min(dataStart + dataLength, bytes.byteLength);

  return {
    sampleRate,
    channels: channels ?? 1,
    bitsPerSample: bitsPerSample ?? 16,
    data: bytes.subarray(dataStart, end),
  };
}

/** Wrap raw PCM bytes in a 44-byte canonical WAV header. */
export function encodeWav(
  pcm: Uint8Array,
  sampleRate: number,
  channels: number,
  bitsPerSample: number
): Uint8Array {
  const dataSize = pcm.byteLength;
  const blockAlign = channels * (bitsPerSample >> 3);
  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);
  const write = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[offset + i] = s.charCodeAt(i);
  };

  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  out.set(pcm, 44);

  return out;
}
