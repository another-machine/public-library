// ---- PCM conversion (unsigned offset-binary, big-endian MSB-first) -----------
// MSB-first means the coarsest amplitude byte lands in the most-visible channel
// (R), which is both audibly and visually appropriate.

/**
 * Convert raw unsigned offset-binary PCM bytes to Float32 samples in [-1, 1].
 *
 * | bits | range     | silence |
 * | 8    | 0-255     | 128     |
 * | 16   | 0-65535   | 32768   |
 * | 24   | 0-16777215| 8388608 |
 */
export function toFloat32(pcm: Uint8Array, bps: 8 | 16 | 24): Float32Array {
  const n = (pcm.length / (bps >> 3)) | 0;
  const f = new Float32Array(n);
  if (bps === 8) {
    for (let i = 0; i < n; i++) f[i] = (pcm[i] - 128) / 128;
  } else if (bps === 16) {
    for (let i = 0; i < n; i++)
      f[i] = (pcm[i * 2] * 256 + pcm[i * 2 + 1]) / 32767.5 - 1;
  } else {
    for (let i = 0; i < n; i++)
      f[i] =
        (pcm[i * 3] * 65536 + pcm[i * 3 + 1] * 256 + pcm[i * 3 + 2]) /
          8388607.5 -
        1;
  }
  return f;
}

/**
 * Convert Float32 samples in [-1, 1] to raw unsigned offset-binary PCM bytes,
 * big-endian (MSB first per sample).
 */
export function float32ToPcm(samples: Float32Array, bps: 8 | 16 | 24): Uint8Array {
  const out = new Uint8Array(samples.length * (bps >> 3));
  if (bps === 8) {
    for (let i = 0; i < samples.length; i++)
      out[i] = Math.max(0, Math.min(255, Math.round((samples[i] + 1) * 127.5)));
  } else if (bps === 16) {
    for (let i = 0; i < samples.length; i++) {
      const v = Math.max(0, Math.min(65535, Math.floor((samples[i] + 1) * 32767.5)));
      out[i * 2] = v >>> 8;
      out[i * 2 + 1] = v & 0xff;
    }
  } else {
    for (let i = 0; i < samples.length; i++) {
      const v = Math.max(0, Math.min(16777215, Math.floor((samples[i] + 1) * 8388607.5)));
      out[i * 3] = v >>> 16;
      out[i * 3 + 1] = (v >>> 8) & 0xff;
      out[i * 3 + 2] = v & 0xff;
    }
  }
  return out;
}

/**
 * Scale all channels by a single shared gain so the loudest sample across ALL
 * channels lands at `targetDb` dBFS. Mutates in place; returns the same array.
 * No-op on silence. Works identically in Node and browser (pure float math).
 */
export function peakNormalize(
  mixed: Float32Array[],
  { targetDb = -1 } = {}
): Float32Array[] {
  if (!mixed || !mixed.length) return mixed;
  let peak = 0;
  for (const ch of mixed)
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
    }
  if (peak === 0) return mixed;
  const gain = Math.pow(10, targetDb / 20) / peak;
  for (const ch of mixed)
    for (let i = 0; i < ch.length; i++) ch[i] *= gain;
  return mixed;
}

// ---- multi-channel layouts ------------------------------------

interface LayoutParams {
  mixed: Float32Array[];
  layout?: "planar" | "interleaved" | "block";
  blockSize?: number;
}

interface UnlayoutParams {
  f32: Float32Array;
  channels: number;
  layout?: "planar" | "interleaved" | "block";
  blockSize?: number;
}

/**
 * Stream position of sample `s` of channel `c` under the block layout: blocks
 * of `K` samples per channel across `M` channels, `full` samples per channel
 * covered by whole blocks, `tail = N - full` left over.
 *
 * The trailing block is SHORT whenever N is not a multiple of K, and it must be
 * strided by `tail` rather than by `K`. Striding it by K walks past the end of
 * the N*M stream for every channel above 0 — typed-array writes there are
 * silently dropped and reads come back undefined, which is why the symptom was
 * NaNs in the last N % K frames rather than wrong sample values. `tail === 0`
 * never reaches the second branch, so exact-multiple streams (and interleaved,
 * where K is 1) permute exactly as they always have.
 */
function blockPos(
  s: number, c: number, K: number, M: number, full: number, tail: number
): number {
  return s < full
    ? Math.floor(s / K) * K * M + c * K + (s % K)
    : full * M + c * tail + (s - full);
}

/**
 * Permute per-channel planar samples into the byte-stream layout used by the
 * audio mimetype (planar = channel 0 run then channel 1 run …).
 */
export function layoutChannels({ mixed, layout, blockSize }: LayoutParams): Float32Array {
  const M = mixed.length, N = mixed[0].length;
  const out = new Float32Array(N * M);
  if (M === 1 || !layout || layout === "planar") {
    for (let c = 0; c < M; c++) out.set(mixed[c], c * N);
    return out;
  }
  const K = layout === "interleaved" ? 1 : blockSize || 1;
  const full = Math.floor(N / K) * K, tail = N - full;
  for (let c = 0; c < M; c++)
    for (let s = 0; s < N; s++)
      out[blockPos(s, c, K, M, full, tail)] = mixed[c][s];
  return out;
}

/**
 * Inverse of layoutChannels: returns a flat Float32Array in planar order
 * (ch0 run, ch1 run, …) ready for AudioBuffer.getChannelData() fills.
 */
export function unlayoutChannels({
  f32,
  channels,
  layout,
  blockSize,
}: UnlayoutParams): Float32Array {
  const M = channels, N = (f32.length / M) | 0;
  if (M === 1 || !layout || layout === "planar") return f32;
  const K = layout === "interleaved" ? 1 : blockSize || 1;
  const full = Math.floor(N / K) * K, tail = N - full;
  const out = new Float32Array(N * M);
  for (let c = 0; c < M; c++)
    for (let s = 0; s < N; s++)
      out[c * N + s] = f32[blockPos(s, c, K, M, full, tail)];
  return out;
}

interface RevealOrderParams {
  pathLen: number;
  channels: number;
  bits: 8 | 16 | 24;
  layout?: "planar" | "interleaved" | "block";
  blockSize?: number;
  bytesPerPixel?: number;
}

/**
 * Returns an Int32Array mapping each data pixel index (within the path used by
 * this audio entry) to the audio frame it carries. Used by the docs player to
 * sync the waveform overlay to playback position.
 *
 * pathLen: number of data pixels used by this audio entry.
 * Handles fractional pixel-to-sample boundaries by snapping each pixel to its
 * earliest-touched audio frame.
 */
export function computeRevealOrder({
  pathLen,
  channels,
  bits,
  layout,
  blockSize,
  bytesPerPixel = 3,
}: RevealOrderParams): Int32Array {
  const M = channels;
  const B = bits >> 3;
  const BPP = bytesPerPixel || 3;
  const N = Math.floor((pathLen * BPP) / B / M); // samples per channel

  const pixelRevealFrame = new Int32Array(pathLen).fill(N);

  function markRange(i: number, byteStart: number, byteEnd: number) {
    const px0 = Math.floor(byteStart / BPP);
    const px1 = Math.min(Math.floor(byteEnd / BPP), pathLen - 1);
    for (let px = px0; px <= px1; px++) {
      if (i < pixelRevealFrame[px]) pixelRevealFrame[px] = i;
    }
  }

  if (M === 1 || !layout || layout === "planar") {
    if (M === 1 && BPP === B)
      return Int32Array.from({ length: pathLen }, (_, i) => i);
    for (let i = 0; i < N; i++)
      for (let c = 0; c < M; c++) {
        const byteStart = (c * N + i) * B;
        markRange(i, byteStart, byteStart + B - 1);
      }
  } else {
    const K = layout === "interleaved" ? 1 : blockSize || 1;
    const full = Math.floor(N / K) * K, tail = N - full;
    for (let i = 0; i < N; i++)
      for (let c = 0; c < M; c++) {
        const byteStart = blockPos(i, c, K, M, full, tail) * B;
        markRange(i, byteStart, byteStart + B - 1);
      }
  }

  const sorted = Array.from({ length: pathLen }, (_, i) => i);
  sorted.sort((a, b) => pixelRevealFrame[a] - pixelRevealFrame[b] || a - b);
  return new Int32Array(sorted);
}
