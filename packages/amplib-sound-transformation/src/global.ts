/**
 * IIFE build entry — produces `dist/sound-transformation.global.js`, exposing
 * the vocoder as `window.SoundTransformationLib`.
 *
 * This is what the no-build static sites consume. `stega.now/mix` loads it with
 * a plain `<script src>` alongside `lib/stegassette.js`, so an ESM package out
 * of node_modules is not enough on its own.
 *
 * `detectBPM` stays out: it pulls `web-audio-beat-detector` and
 * `standardized-audio-context` in behind it, 33 KB gzipped for a number a
 * consumer reading metadata already has. Detection means taking the ESM
 * package and a bundler.
 *
 * The companion worklet is a second artifact — `dist/phase-vocoder-processor.js`
 * — because `audioWorklet.addModule` needs its own URL and runs in a scope this
 * bundle cannot reach.
 */

export { SoundTransformation } from "./SoundTransformation";
export type { SoundTransformationInitializeParams } from "./SoundTransformation";
