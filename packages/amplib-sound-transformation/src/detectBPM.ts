import { analyze } from "web-audio-beat-detector";

/**
 * Estimate the tempo of an AudioBuffer, in beats per minute.
 *
 * Its own module because detection pulls `web-audio-beat-detector`, and that
 * reaches `standardized-audio-context` through its broker: 33 KB gzipped,
 * against 4 KB for the vocoder bundle that would otherwise carry it. The
 * browser builds import `SoundTransformation` alone and never pay it.
 *
 * A caller reading tempo out of metadata passes it to `initialize({ bpm })`
 * and never loads this.
 */
export async function detectBPM(audioBuffer: AudioBuffer): Promise<number> {
  return analyze(audioBuffer);
}
