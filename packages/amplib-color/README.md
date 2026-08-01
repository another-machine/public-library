# @amplib/color

Color analysis utilities.

```ts
import { toPerceptual, fromPerceptual } from "@amplib/color";

toPerceptual(210); // 256.22 — display blue is much further round than it looks
fromPerceptual(180); // 172.88 — the display hue that reads as halfway to cyan
```

Divide a hue wheel into six equal slices in HSV and the slices do not look
equal. Divide it in oklch and they do. That is the entire purpose of this
package: a bijection between the hue you write down and the hue people see.

```ts
// Six hues that actually look evenly spaced.
const spaced = Array.from({ length: 6 }, (_, i) => fromPerceptual(i * 60));
// 328.0, 33.8, 68.9, 172.9, 198.9, 274.6 — not 0, 60, 120, 180, 240, 300
```

Note where that list starts. Perceptual 0° is display **328°**, not 0° — the
angle vision reads as the origin of the wheel sits in magenta, some way before
display red. The two wheels do not share a zero, so there is no offset you
could apply instead of the mapping.

## Modules

| Module                 | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `toPerceptual`         | Display (HSV) hue → perceptual (oklch) hue           |
| `fromPerceptual`       | Perceptual (oklch) hue → display (HSV) hue           |
| `worstRoundTripError`  | Measured disagreement between the two directions     |

## Design

**The wheel is severely non-linear, and not in the direction most descriptions
suggest.** Measured as perceptual degrees per display degree:

| red   | orange | yellow | green | cyan  | blue  | deep blue | magenta |
| ----- | ------ | ------ | ----- | ----- | ----- | --------- | ------- |
| 0.21× | 1.76×  | 1.29×  | 0.05× | 2.23× | 0.14× | 0.01×     | 0.94×   |

Green and deep blue barely move — a wide sweep of display hue is almost one
perceptual color — while cyan and orange stretch. Over two hundredfold between
the extremes.

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

**Hue only, saturation and lightness untouched.** Full-saturation, full-value
HSV is the sampling line, so this answers "which angle" and says nothing about
how light or vivid the result is. Anything needing the other two axes wants a
full color-space conversion, not this.

Matrix constants from Björn Ottosson's oklab reference implementation (2020).
