/**
 * audioPrep — the environment-agnostic half of the encode-side audio pipeline.
 *
 * The full pipeline is:
 *
 *   decode → deinterleave → reverse? → normalize? → layout → PCM → entry
 *   └ env-specific ────┘   └───────────── shared (this module + audio.ts) ─┘
 *
 * Only the decode step differs by environment: Node shells out to ffmpeg,
 * the browser uses decodeAudioData / OfflineAudioContext. Everything after it
 * is pure array work, and was duplicated between the lab's `encode-batch.js`
 * and its `index.html`. This module owns that shared tail so the two cannot
 * drift — which they have before, notably over which sample rate ends up in
 * the mimetype (see resolveAudioRates).
 */

import { buildAudioEntry } from "./audio";
import { peakNormalize } from "./pcm";
import type { Entry } from "./types";

/** "relabel" keeps the source samples; "resample" actually converts them. */
export type AudioRateMode = "relabel" | "resample";

/** Default peak-normalization target when normalization is on without a value. */
export const NORMALIZE_DEFAULT_DB = -1;

/**
 * Split an interleaved Float32 buffer into planar per-channel arrays.
 * Decoders hand back interleaved frames (ffmpeg f32le, AudioBuffer reads);
 * everything downstream wants planar.
 */
export function deinterleave(
  interleaved: Float32Array,
  channels: number
): Float32Array[] {
  if (channels < 1) throw new Error(`channels must be >= 1, got ${channels}`);
  const frames = (interleaved.length / channels) | 0;
  const out: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const ch = new Float32Array(frames);
    for (let i = 0; i < frames; i++) ch[i] = interleaved[i * channels + c];
    out.push(ch);
  }
  return out;
}

/**
 * Resolve a normalization spec to a target dBFS, or null for "off".
 *
 * Accepts the loose forms job files use: booleans, numbers, and the strings
 * "on"/"off"/"none"/"" or a numeric string. Positive values are clamped to 0 —
 * normalizing *up* past full scale would only clip.
 *
 * KNOWN WART, kept deliberately for parity with the lab's `config.js`: an
 * unrecognized string falls through to `parseFloat`, which yields NaN, which
 * returns the DEFAULT rather than null. So `"no"` and `"nope"` turn
 * normalization *on* at -1 dBFS. That is surprising, but changing it would
 * change the output of any job file relying on it, so it is not a change to
 * make while two implementations must agree byte-for-byte. Fix it once
 * `steg-core.js` retires and this function is the only one left. (No job file
 * in the lab currently uses anything but `-1` and `null`.)
 */
export function resolveNormalize(
  spec: boolean | number | string | null | undefined
): number | null {
  if (spec == null || spec === false) return null;
  if (spec === true) return NORMALIZE_DEFAULT_DB;
  if (typeof spec === "string") {
    const s = spec.trim().toLowerCase();
    if (s === "" || s === "off" || s === "none" || s === "false") return null;
    if (s === "on" || s === "yes" || s === "true") return NORMALIZE_DEFAULT_DB;
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.min(0, n) : NORMALIZE_DEFAULT_DB;
  }
  if (typeof spec === "number")
    return Number.isFinite(spec) ? Math.min(0, spec) : null;
  return null;
}

export interface ResolveAudioRatesParams {
  mode: AudioRateMode;
  /** The file's own sample rate. Only consulted for "relabel". */
  sourceSampleRate: number;
  /** The rate the caller asked for. */
  targetSampleRate: number;
}

export interface ResolvedAudioRates {
  /** Decode the source at this rate. */
  decodeSampleRate: number;
  /** Write THIS into the entry's mimetype. */
  mimeSampleRate: number;
}

/**
 * Decide the two sample rates a mode implies.
 *
 * - "resample" converts the audio to the target rate, so both rates are the
 *   target: it decodes at the target and plays back at the target.
 * - "relabel" keeps the original samples untouched but *declares* the target
 *   rate, so playback runs fast or slow — that speed/pitch shift is the point
 *   of the mode. It decodes at the SOURCE rate and still labels with the
 *   TARGET rate.
 *
 * The mimeSampleRate is always the target, and that is the whole reason this
 * is a named function rather than two inline ternaries: writing the source
 * rate into a relabelled entry's mimetype was a real bug once, and it is
 * invisible until you hear the playback.
 */
export function resolveAudioRates({
  mode,
  sourceSampleRate,
  targetSampleRate,
}: ResolveAudioRatesParams): ResolvedAudioRates {
  return {
    decodeSampleRate: mode === "resample" ? targetSampleRate : sourceSampleRate,
    mimeSampleRate: targetSampleRate,
  };
}

export interface PrepareAudioEntryParams {
  /**
   * Decoded samples: either interleaved frames plus `channels`, or planar
   * per-channel arrays. Interleaved input is deinterleaved for you.
   */
  samples: Float32Array | Float32Array[];
  /** Required when `samples` is interleaved; ignored when it is planar. */
  channels?: number;
  /** The rate to declare in the mimetype — see resolveAudioRates. */
  sampleRate: number;
  bitsPerSample?: 8 | 16 | 24;
  /** "rev" reverses each channel in place. */
  direction?: "fwd" | "rev";
  /** Peak-normalize target; accepts the loose job-file forms. */
  normalize?: boolean | number | string | null;
  layout?: "planar" | "interleaved" | "block";
  blockSize?: number;
  name?: string;
}

/**
 * Run the shared tail of the pipeline over already-decoded samples and return
 * a ready STGC audio entry.
 *
 * Mutates the channel arrays it is given (reverse and normalize are in-place,
 * matching the lab's behaviour on freshly-decoded buffers). Pass copies if the
 * caller still needs the originals.
 */
export function prepareAudioEntry({
  samples,
  channels,
  sampleRate,
  bitsPerSample = 16,
  direction = "fwd",
  normalize = null,
  layout = "planar",
  blockSize,
  name,
}: PrepareAudioEntryParams): Entry {
  let planar: Float32Array[];
  if (Array.isArray(samples)) {
    planar = samples;
  } else {
    if (!channels)
      throw new Error("prepareAudioEntry: `channels` is required for interleaved samples");
    planar = deinterleave(samples, channels);
  }
  if (!planar.length) throw new Error("prepareAudioEntry: no audio channels");

  if (direction === "rev") for (const ch of planar) ch.reverse();

  const normalizeDb = resolveNormalize(normalize);
  if (normalizeDb != null) peakNormalize(planar, { targetDb: normalizeDb });

  // Single-channel audio has no meaningful interleave/block layout.
  const effectiveLayout = planar.length > 1 ? layout : "planar";

  return buildAudioEntry({
    channels: planar,
    sampleRate,
    bitsPerSample,
    layout: effectiveLayout,
    blockSize: effectiveLayout === "block" ? Math.max(1, blockSize ?? 64) : 0,
    name,
  });
}
