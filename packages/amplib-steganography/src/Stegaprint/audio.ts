/**
 * Audio entries for STGP.
 *
 * The Stegassette equivalent carries its format in an RFC-2586 mimetype string.
 * This one cannot: the record is fixed-width and stores a type enum instead
 * (Stegaprint.md §7.2), so bit depth, sample rate and channel count live in the
 * record's four parameter bytes and the mimetype is derived on the way out.
 *
 * The PCM conversion itself is shared with Stegassette — `float32ToPcm` and
 * `toFloat32` know nothing about either container, which is the same reason the
 * traversals and keymaps carry over untouched (§4.1, §4.3).
 *
 * Layout is planar only. Stegassette offers interleaved and block because they
 * shape a visual reveal; nothing here reveals, and a second layout would be a
 * second thing to get wrong for no gain. Multi-channel writes channel 0 whole,
 * then channel 1.
 */

import { float32ToPcm, toFloat32 } from "../Stegassette/pcm";
import { EntryType } from "./records";
import type { AudioParams, DecodedPrintEntry, PrintEntry } from "./records";

/** Bit depths the record's 4-bit depth code can express. */
export type AudioBits = 4 | 8 | 16 | 24;

export interface BuildAudioEntryParams {
  /** Per-channel Float32 samples in [-1, 1], planar. */
  channels: Float32Array[];
  sampleRate: number;
  /** Default 8 — the depth this format's capacity actually affords (§3.1). */
  bitsPerSample?: AudioBits;
  name?: string;
}

export interface ParsedAudioEntry {
  channels: Float32Array[];
  sampleRate: number;
  bitsPerSample: AudioBits;
}

/**
 * 4-bit PCM, packed two samples per byte.
 *
 * Not in the shared converter because 8/16/24 are whole numbers of bytes and
 * this one is not. It earns its place here: at M=4 a 4-bit sample is exactly
 * two symbols, and halving the depth doubles the duration a canvas can hold,
 * which is the trade §3.1 is built around.
 */
function float32ToPcm4(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(samples.length / 2));
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(0, Math.min(15, Math.round((samples[i] + 1) * 7.5)));
    if (i % 2 === 0) out[i >> 1] = v << 4;
    else out[i >> 1] |= v;
  }
  return out;
}

function pcm4ToFloat32(pcm: Uint8Array, sampleCount: number): Float32Array {
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const byte = pcm[i >> 1] ?? 0;
    const v = i % 2 === 0 ? byte >> 4 : byte & 0x0f;
    out[i] = v / 7.5 - 1;
  }
  return out;
}

/** Concatenate planar channels into one stream, then convert to PCM bytes. */
export function buildAudioEntry({
  channels,
  sampleRate,
  bitsPerSample = 8,
  name,
}: BuildAudioEntryParams): PrintEntry {
  const N = channels.length ? channels[0].length : 0;
  const flat = new Float32Array(N * channels.length);
  channels.forEach((ch, i) => flat.set(ch.subarray(0, N), i * N));

  const data =
    bitsPerSample === 4
      ? float32ToPcm4(flat)
      : float32ToPcm(flat, bitsPerSample);

  return {
    type: EntryType.Audio,
    name: name ?? "audio",
    data,
    audio: { bits: bitsPerSample, rate: sampleRate, channels: channels.length },
  };
}

/**
 * Recover per-channel Float32 samples from an audio entry.
 *
 * Note the sample count comes from the payload length rather than from a stored
 * count: the payload is chunk-padded, and the record's pad byte has already
 * trimmed it back to the exact byte length by the time an entry reaches here.
 */
export function parseAudioEntry(
  entry: DecodedPrintEntry | PrintEntry
): ParsedAudioEntry {
  const audio: AudioParams = entry.audio ?? { bits: 8, rate: 8000, channels: 1 };
  const data =
    entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
  const nCh = Math.max(1, audio.channels);

  const total =
    audio.bits === 4 ? data.length * 2 : (data.length / (audio.bits >> 3)) | 0;
  const N = (total / nCh) | 0;

  const flat =
    audio.bits === 4
      ? pcm4ToFloat32(data, N * nCh)
      : toFloat32(data, audio.bits as 8 | 16 | 24);

  const channels: Float32Array[] = [];
  for (let c = 0; c < nCh; c++) channels.push(flat.subarray(c * N, (c + 1) * N));

  return {
    channels,
    sampleRate: audio.rate,
    bitsPerSample: audio.bits as AudioBits,
  };
}

/** Bytes one second of audio costs at this rate and depth — for sizing a canvas. */
export function bytesPerSecond(
  sampleRate: number,
  bitsPerSample: AudioBits,
  channels = 1
): number {
  return Math.ceil((sampleRate * bitsPerSample * channels) / 8);
}
