import { buildAudioMime, parseAudioMime } from "./entries";
import { float32ToPcm, layoutChannels, toFloat32, unlayoutChannels } from "./pcm";
import type { AudioMimeParams, DecodedEntry, Entry } from "./types";

/** Parameters for encoding audio channels into a STGC audio entry. */
export interface BuildAudioEntryParams {
  /** Per-channel Float32 samples in [-1, 1], planar (one array per channel). */
  channels: Float32Array[];
  sampleRate: number;
  /** Bits per sample: 8, 16, or 24 (default 16). */
  bitsPerSample?: 8 | 16 | 24;
  /**
   * How multiple channels share the one stream — and therefore which pixels
   * carry which channel, so it shapes a visual reveal as much as the
   * traversal does. "planar" writes each channel whole, one after the other,
   * so the first half of the path is one ear; "interleaved" alternates sample
   * by sample, so both develop together; "block" alternates in runs of
   * `blockSize` samples. Mono has nothing to order and ignores it. Stored in
   * the entry's mimetype, so decoding needs no separate telling.
   * Default "planar".
   */
  layout?: "planar" | "interleaved" | "block";
  /** Samples per channel per run — read by the "block" layout only. */
  blockSize?: number;
  name?: string;
}

/** Result of decoding a STGC audio entry. */
export interface ParsedAudioEntry {
  /** Per-channel Float32 samples, planar. */
  channels: Float32Array[];
  sampleRate: number;
  bitsPerSample: 8 | 16 | 24;
  layout: "planar" | "interleaved" | "block";
  blockSize: number;
}

/**
 * Encode one or more Float32 audio channels into a STGC entry.
 * PCM is unsigned offset-binary big-endian (MSB first per sample).
 */
export function buildAudioEntry({
  channels,
  sampleRate,
  bitsPerSample = 16,
  layout = "planar",
  blockSize,
  name,
}: BuildAudioEntryParams): Entry {
  const nChannels = channels.length;
  const mimeParams: AudioMimeParams = {
    bits: bitsPerSample,
    rate: sampleRate,
    channels: nChannels,
    layout,
    blockSize,
  };

  // Permute channels into stream layout, then convert to raw PCM bytes
  const mixed = layoutChannels({ mixed: channels, layout, blockSize });
  const data = float32ToPcm(mixed, bitsPerSample);

  return {
    mimetype: buildAudioMime(mimeParams),
    name,
    data,
  };
}

/**
 * Decode a STGC audio entry into per-channel Float32 arrays.
 * Returns samples in planar order (ch0 run, ch1 run, …) ready for AudioBuffer fills.
 */
export function parseAudioEntry(entry: DecodedEntry | Entry): ParsedAudioEntry {
  const mime = parseAudioMime(entry.mimetype);
  const data =
    entry.data instanceof Uint8Array
      ? entry.data
      : new Uint8Array(entry.data as ArrayBuffer);

  const flat = toFloat32(data, mime.bits);
  const N = (flat.length / mime.channels) | 0;

  // de-interleave / de-block back to planar
  const planar = unlayoutChannels({
    f32: flat,
    channels: mime.channels,
    layout: mime.layout,
    blockSize: mime.blockSize,
  });

  const channelArrays: Float32Array[] = [];
  for (let c = 0; c < mime.channels; c++) {
    channelArrays.push(planar.subarray(c * N, (c + 1) * N));
  }

  return {
    channels: channelArrays,
    sampleRate: mime.rate,
    bitsPerSample: mime.bits,
    layout: mime.layout,
    blockSize: mime.blockSize,
  };
}

/** Returns true when the entry's mimetype is an audio type. */
export function isAudioEntry(entry: { mimetype: string }): boolean {
  return /^audio\//i.test(entry.mimetype);
}
