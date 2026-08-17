# @amplib/sound-transformation

Transforming sound with the Web Audio API.

`SoundTransformation` wraps an `AudioBufferSourceNode` in a phase vocoder, so
tempo and pitch move independently. `adjustSpeedToBPM` sets the source's
playback rate; the vocoder takes the reciprocal, holding pitch until
`adjustPitchBySemitones` moves it. Shifts land within 0.6 cents across ±12
semitones and 110–1760 Hz.

```js
const transformation = new SoundTransformation({ audioContext });
await transformation.initialize({
  audioBuffer: source,
  processorJSPath: "./phase-vocoder-processor.js",
  bpm: 120,
  destination: voiceGain, // omit and it goes straight to the destination
});
transformation.adjustSpeedToBPM(128);
transformation.adjustPitchBySemitones(-3);
```

`bpm` is the source's own tempo and is required: `adjustSpeedToBPM` is a ratio
against it. `detectBPM(audioBuffer)` estimates one and is a **separate import**,
33 KB gzipped through `standardized-audio-context`. Code holding a tempo
already passes it in.

`destination` matters as soon as more than one sound plays. Left out, the
vocoder connects to `audioContext.destination` and there is nowhere to put a
per-voice gain.

Overlap-add delays every voice by the same 2048 samples, so voices stay in
phase with each other. Bypassing the vocoder on one of them costs that.

## Builds

| artifact | for |
| --- | --- |
| `dist/index.js` | the ESM package — bundler consumers |
| `dist/sound-transformation.global.js` | `window.SoundTransformationLib` for no-build pages |
| `dist/phase-vocoder-processor.global.js` | the worklet, for `audioWorklet.addModule` |

The two browser artifacts are self-contained IIFEs with `fft.js` bundled in.
That is what the `tsup.config.ts` is for: tsup leaves dependencies external by
default, and `noExternal` has no command-line form, so a `tsup` key in
`package.json` cannot express it.

PhaseVocoderProcessor heavily based off of [github.com/olvb/phaze](https://github.com/olvb/phaze)
