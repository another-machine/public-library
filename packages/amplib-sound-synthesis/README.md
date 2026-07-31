# @amplib/sound-synthesis

Making sound with the Web Audio API.

```ts
import { AudioGraph, FMVoice } from "@amplib/sound-synthesis";

const audioContext = new AudioContext();
const graph = new AudioGraph({ audioContext });
graph.bypassInsert();

const voice = new FMVoice({
  audioContext,
  destination: graph.midBus,
  ratio: 2,
  index: 1.5,
});
voice.pluck(440);
```

Origin of the FM, layer, drum, and worklet modules:
[another-machine/avva](https://github.com/another-machine/avva).

## Modules

| Module                                   | Description                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `AudioGraph`                             | Bus and routing topology — slotting filters, master chain, swappable limiter stage  |
| `FMVoice`                                | Two-operator FM voice with glide and a one-shot `pluck`                             |
| `NodeTierBackend` / `WorkletTierBackend` | One five-voice FM tier, as a node graph or an AudioWorklet, behind one interface    |
| `TapeDelay`                              | Delay with damping inside the feedback loop, mono or ping-pong                      |
| `Reverb`                                 | Convolution reverb on a generated impulse — no file to fetch                        |
| `NoiseLayer`                             | Looped noise through chord-tuned high-Q bandpass resonators                         |
| `ShimmerLayer`                           | Two sine voices above the root under slow, mismatched amplitude LFOs                |
| `DrumSynth` / `DrumMachine`              | Sample-free percussion and a lookahead scheduler for it                             |
| `ChromaticWall`                          | A drifting wall of scale notes with a sparser layer of high twinkles                |
| `Clock`                                  | Worker-driven beat clock with swing                                                 |
| `WorkletHost`                            | Loads the fm-tier, ks-string, and lookahead-limiter worklets                        |

[Live demo](https://amplib.app/sound-synthesis) — an arpeggio through pooled
FM voices over a scheduled drum pattern, with the lookahead limiter reporting
LUFS as it runs.

There is also a standalone `demo` directory for `ChromaticWall`. It imports
from `dist`, so run `npm run build` before opening it.

## Design

**Worklets ship as source strings, not as URLs.** `WorkletHost` blobs the
worklet text and calls `addModule` on the blob URL, the same way `Clock` carries
its timing worker. The alternative — importing the worklet file and letting the
bundler emit a URL — ties the package to one bundler: `?url` is Vite,
`new URL(..., import.meta.url)` needs Parcel's worklet transformer, and the
global bundle published to `amplib.app/lib` has no bundler at all. A blob URL
works in all three.

`SoundTransformation` in the sibling package takes the opposite approach and
asks its caller for a path or a script tag. That is the right call for a
processor a consumer might want to swap out; these three are fixed parts of the
synth, so the package owns them.

**Every worklet load can fail without taking the sound with it.** The loaders
return `false` rather than throwing, and each has a fallback already wired:
`AudioGraph` runs a `DynamicsCompressor` until `swapToWorkletLimiter` replaces
it, and `NodeTierBackend` is a complete implementation of the same interface as
`WorkletTierBackend`. Worklets fail for reasons that have nothing to do with the
code — a cross-origin bundle, a strict CSP, an older browser — so nothing here
treats them as guaranteed.

**The effects are sends, not inserts.** `TapeDelay` and `Reverb` output wet
only, and the caller keeps its own dry path. A class that mixes dry internally
can serve an insert but not a send, whereas a wet-only one serves both — an
insert is a send plus a dry gain the caller already has. It also means the two
compose without arguing about who owns the dry signal: routing the delay's
output into the reverb's input puts the repeats inside the room, and neither
class needed to know the other exists.

`AudioGraph` has been shaped for these since before they existed — it pads 6 dB
of headroom ahead of its insert point and makes it back up after, and
`updateAutoMakeup` carries coefficients measured against a chain that lived in a
consuming app rather than here. These two are the beginning of closing that gap.

**Pitched voices are pooled; percussion is not.** `FMVoice` starts its
oscillators once and keeps them running, because `pluck`'s 3 ms retrigger
crossfade only works on a carrier that is already going, and because dense
passages would otherwise allocate an oscillator pair per note. `DrumSynth` does
build nodes per hit, which is correct there: drum hits are short and sparse, so
they never stack up, and each wants its own envelope from silence.

**Two writers never share an AudioParam.** `AudioGraph` keeps `masterTrim`,
`dimGain`, and `tremoloSum` as separate nodes rather than one gain, because
`setTargetAtTime` from two sources on one param means the last write wins and
the other silently stops working — a bug with no error attached to it.

### A note on `ChromaticWall`

Its modulator used to run at a fixed 14.3 Hz into `carrier.detune` at a depth of
±10 cents, which is a slow vibrato rather than frequency modulation. It now
plays through a pool of `FMVoice`, so the modulator tracks a ratio of the
carrier and goes into `carrier.frequency`, putting real sidebands in the tone.

**This changes how it sounds**, and the settings changed shape with it:
`modulationDepth` and `modulationFrequency` are gone, replaced by `ratio` and
`index`. Set `index` to 0 on either synth for a plain oscillator. The
constructor and `tick` signatures are unchanged apart from an optional
`voiceCount`.
