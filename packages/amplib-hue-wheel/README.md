# @amplib/hue-wheel

A hue wheel divided into equal sectors.

```ts
import { Palette } from "@amplib/hue-wheel";

const palette = new Palette({ slots: ["g1", "g2", "g2", "g1", "g3"] });

palette.hueToSlot(210).slot.value; // "g2" — which slot this hue names
palette.hueToBlend(210); // the same, blended near a sector edge
palette.slotToHue(0); // the display hue at the centre of sector 0
palette.bands; // the four visual bands these five sectors make
```

Slots hold whatever you put in them. Attach meaning with `map`:

```ts
import { parseChord } from "@amplib/music-theory";

const chords = new Palette({ slots: ["CEG", "CEG", "FAC", "GBD"] }).map(parseChord);
chords.hueToSlot(210).slot.value.chord?.label; // "F"
```

[Live demo](https://amplib.app/hue-wheel) — the same palette drawn twice, once
with display hue as the angle and once with perceptual hue, which is the
shortest way to see why the distinction matters.

Origin [another-machine/avva](https://github.com/another-machine/avva), where
one machine turns music into colour and the other colour into music.

## Modules

| Module          | Description                                                   |
| --------------- | ------------------------------------------------------------- |
| `Palette<T>`    | A hue wheel divided into equal sectors, in both directions     |
| `huePerception` | Bijection between display (HSV) hue and perceptual (oklch) hue |
| `parseSlotList` | Splits a comma- or pipe-separated list into slot values        |

## Design

**Weight is repetition, not a number.** Every sector is the same width, so a
value gets a wider arc by being written more than once. `["g1","g2","g2","g3"]`
gives g2 half the wheel and its neighbours a quarter each. The list reads as
the wheel it describes, rather than as a set of multipliers to work out in your
head.

It also expresses something a bias field could not: **a value can appear in
more than one place.** In `["g1","g2","g2","g1","g3"]` the two g1 sectors are
separated by g2, so g1 is reachable from two different regions of colour
without being one continuous band. Adjacent repeats widen a band; separated
repeats create a second one.

`bands` is the distinction made concrete — it merges runs of adjacent equal
sectors and leaves separated ones alone, so the example above reports four
bands from five sectors. It wraps, so a band straddling 0° is reported once
rather than as two fragments.

**Repeats do not crossfade with themselves.** `hueToBlend` returns two slots
near a sector edge, except where the neighbour holds the same value — there is
no transition inside a continuous band, and returning the same value twice at
half weight each would read downstream as a two-slot mix when nothing is
changing.

**`map` memoises by input.** Equal inputs are transformed once and share the
result. That is not an optimisation: `bands` and `hueToBlend` decide what
counts as the same slot by identity, so mapping `"CEG"` twice into two
equal-but-separate objects would silently split one band in two and start
crossfading a value with itself.

**Sectors are divided in perceptual hue, not display hue.** The mapping between
the two is severely non-linear, and not in the direction most descriptions
suggest — measured as perceptual degrees per display degree:

| red   | orange | yellow | green | cyan  | blue  | deep blue | magenta |
| ----- | ------ | ------ | ----- | ----- | ----- | --------- | ------- |
| 0.21× | 1.76×  | 1.29×  | 0.05× | 2.23× | 0.14× | 0.01×     | 0.94×   |

Green and deep blue barely move — a wide sweep of display hue is almost one
perceptual colour — while cyan and orange stretch. Over two hundredfold between
the extremes. Slice the wheel evenly in HSV and the slices look wildly uneven;
slice it in oklch and they look right.

**The round-trip is measured, not assumed.** The forward table samples oklch
once per display degree; the inverse searches it backwards at twenty times that
resolution, because the deep-blue zone squeezes roughly 16 display degrees into
half a perceptual degree and would otherwise collapse to a single bin. The two
are built by different methods and only approximately invert each other, so
`worstRoundTripError()` measures the disagreement and `npm test` fails the
build above 1.5°.

Raw oklch hue also steps *backwards* by a fraction of a degree around display
231–240°, which would make the mapping non-invertible exactly there. Every
backward run is replaced with a straight interpolation across it.

**The error check is exported, not run on import.** A library that asserts at
load time charges every consumer for the check whether they want it or not, and
still cannot fail a build when it matters.

**Blend weights top out at 0.5.** Capping a neighbour's weight at half means a
slot never loses its majority, and at the boundary itself the two are equal, so
there is no discontinuity to see or hear. `crossZone` is a fraction of a
sector, so blending stays proportionate rather than becoming a fixed smear.
