# @amplib/music-detection

Hearing what is already playing. Chromatic note presence and a chord guess,
frame by frame, from any Web Audio source.

```ts
import { DetectTone } from "@amplib/music-detection";

const audioContext = new AudioContext();
const detector = new DetectTone({ audioContext });
await detector.initialize(source); // a media element, a stream, or a buffer

loop();
function loop() {
  requestAnimationFrame(loop);
  const { label, tones } = detector.tick();
  // label: "Am" · tones: one entry per semitone, each with a prominence 0–1
}
```

## Modules

| Module       | Description                                                                           |
| ------------ | ------------------------------------------------------------------------------------- |
| `DetectTone` | Per-semitone presence over C2–B6, folded to pitch classes, plus the most likely chord  |
| `DetectBPM`  | Beat detection from low-band energy, live or over a rendered buffer                    |

`DetectTone.tick()` returns `tones` — one entry per semitone it tracks, each an
`@amplib/music-theory` `Note` plus a `prominence` — and `notes`, the same
energy folded to twelve pitch classes, most prominent first, with `label` and
`guess` for the chord. `analyzeKey(buffer)` answers the same question offline,
for a whole track at once.

## Design

**The analyser is configured before anything is derived from it.** Both the
data buffer and the note-to-bin mapping are functions of `fftSize`, so setting
it afterwards makes every index wrong by the ratio of the two sizes and leaves
a buffer covering only the bottom fraction of the spectrum. This package had
exactly that bug until 0.1.0 — a 440Hz tone read **0** at the bin it looked in.
If you reconfigure the analyser, change `fftSize` first and rebuild
`frequencyData` and `frequencyIndices` from it.

**32768, the maximum an AnalyserNode allows.** At 44.1kHz that is 1.35Hz per
bin, and the bottom octave needs it: C2 and C#2 are under 4Hz apart, so at the
default 2048 they share a bin.

**A band is ignored when a neighbour is louder.** A note's bin counts only if
it beats its semitone and octave neighbours, which is what keeps a harmonic
from being reported as a note in its own right.

**Presence is sharpened, then eased asymmetrically.** Raw bin magnitude is
raised to a high power, so only bands that are genuinely dominant survive; the
result rises slowly and falls four times faster, which is what makes a held
chord read as steady rather than flickering.

**Live and offline share one chord picker.** They had a copy each once, and the
copies disagreed — the offline one built its candidate chords from the loudest
*notes* rather than the loudest pitch classes, so its top four were usually
four octaves of the same note and it could never name a triad. `analyzeKey`
also does its own accumulation and never writes to the instance state, which it
used to: asking for a track's key corrupted the live detection running beside
it.

**`@amplib/music-theory` is a real dependency, not an inlined copy.** `tick()`
hands back its `Note` and `Chord` instances, so a consumer holding both
packages must hold the same one.

[Live demo](https://amplib.app/music-detection) — a chord loop and a
microphone through the same detector.
