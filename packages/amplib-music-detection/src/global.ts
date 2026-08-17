/**
 * IIFE build entry — produces `dist/music-detection.global.js`, exposing the
 * offline analysis as `window.MusicDetection`.
 *
 * This is what the no-build static sites consume. `stega.now/mix` loads it with
 * a plain `<script src>` alongside `lib/stegassette.js`.
 *
 * Only `analyze`. `DetectTone` and `DetectBPM` run off an `AnalyserNode` in a
 * live graph, which a page reading a file off disk has no use for, and
 * `DetectTone` carries the `Chord` and `Note` classes with it.
 */

export {
  chromagram,
  detectKey,
  detectLoopBeats,
  detectTempo,
  onsetEnvelope,
  toMono,
} from "./analyze";
export type {
  KeyEstimate,
  LoopBeats,
  OnsetEnvelope,
  TempoEstimate,
} from "./analyze";
