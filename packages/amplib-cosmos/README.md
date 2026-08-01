# @amplib/cosmos

The state of the sky for a given time and place, normalized for driving sound.

```ts
import { generate } from "@amplib/cosmos";

const cosmos = generate({ latitude: 40.7128, longitude: -74.006 });

cosmos.moon.phase.unitRange; // 0.56 — position in the synodic cycle
cosmos.moon.phase.sin; // continuous across the new-moon wrap
cosmos.sun.daylightProgress.unitRange; // 0.24 — sunrise to sunset
cosmos.tides.potential.unitRange; // 0.72 — two peaks per lunar day
cosmos.seed.code; // "005FJZ96" — feed to @amplib/procedural-generation
```

[Live demo](https://another-machine.github.io/public-library/cosmos/)

## Design

**It is a pure function.** Given the same latitude, longitude, and UTC
timestamp, `generate()` returns the same result on every machine, in every
timezone, in any JavaScript runtime. Nothing in the library reads the host
clock, the host timezone, or the host locale. This matters because the sibling
package exists for "shared procedural experiences between disconnected
devices" — two phones have to agree without talking to each other, and that is
only possible if the input fully determines the output.

`npm test` checks this by running an 840-sample sweep under nine timezones,
including half-hour and 45-minute offsets, and comparing hashes.

**Positions come from an ephemeris.** `astronomy-engine` (MIT, no
dependencies) is accurate to roughly an arcminute for the Sun, Moon, and
planets over 1700–2200. It is reached through exactly one file,
[`src/ephemeris.ts`](src/ephemeris.ts), so the backend can be swapped without
touching anything else.

**Interpretation is ours.** The sidereal-time and rotation-angle derivations,
the tidal model, the normalization contract, the timescale grouping, and the
seed derivation all live in this package. That is where the value is — an
ephemeris says where Jupiter is, but nothing about how a number should behave
when it feeds an oscillator.

## The value contract

Every numeric leaf carries its real-world value alongside pre-normalized forms:

```ts
{
  value: 0.5077,      // real value, never clamped
  unit: "degrees",
  min: 0.4885,        // the domain used to normalize
  max: 0.5683,
  unitRange: 0.24,    // always in [0, 1]
  bipolarRange: -0.52 // always in [-1, 1], always 2 * unitRange - 1
}
```

Three guarantees hold everywhere, and the test suite sweeps eight locations
across six years asserting them:

1. `unitRange` is in `[0, 1]`.
2. `bipolarRange` is in `[-1, 1]` and equals `2 * unitRange - 1`.
3. `min`/`max` state the domain, so you can re-derive or re-scale.

There is a fourth property the tests check that is a design goal rather than a
hard guarantee: **no value is pinned to a sliver of its range.** A field
normalized against the wrong domain is technically in contract and useless in
practice. Each planet's distance, brightness, and apparent size are therefore
normalized against that planet's own extremes rather than a solar-system-wide
scale — otherwise Venus's near-circular orbit would occupy 0.03% of the range
and read as a constant.

### Cyclic values

Anything that wraps — an angle, a phase, a time of day — is a `CyclicValue`,
which adds `sin`, `cos`, and `period`:

```ts
cosmos.moon.phase.unitRange; // jumps 1 → 0 at new moon
cosmos.moon.phase.sin; // continuous through it
cosmos.moon.phase.cos;
```

Use `unitRange` when you want the hard reset — triggering an event, indexing a
table. Use `sin`/`cos` for anything continuous, because feeding the wrap point
into a filter cutoff produces an audible click.

### Events

Rise and set times are `EventValue`:

```ts
{ timestamp: 1785535912153, iso: "2026-07-31T09:51:52.153Z", secondsUntil: -12420 }
```

`null` is a real answer, not an error: inside the polar circles the Sun stays
up or down for weeks, and the Moon skips a rise roughly once a month because
its day is 24h50m. Branch on it rather than substituting zero. `sun.dayLength`
reports 24 or 0 in those cases so you always have a usable number.

## Timescales

The result tree is organized by body, but the useful question when mapping the
sky onto music is how fast something moves. `cosmos.timescales` regroups the
same value objects — by reference, nothing is copied — into four bands:

| Band         | Period        | Suits                                  |
| ------------ | ------------- | -------------------------------------- |
| `rotational` | hours         | rhythm, filter sweeps, stereo movement |
| `lunar`      | days to weeks | phrase length, register, density       |
| `annual`     | months        | key center, mode, timbre               |
| `epochal`    | years         | long-form structure, tuning drift      |

```ts
for (const signal of cosmos.timescales.rotational.signals) {
  signal.path; // "sun.hourAngle"
  signal.periodSeconds; // 86400
  signal.cyclic; // true — carries sin/cos
  signal.value.unitRange;
}
```

## Tides

`cosmos.tides` is the equilibrium tide-generating potential — the real
second-degree term, `(3cos²θ − 1) / 2` scaled by `GM/d³`, summed over the Moon
and the Sun.

Because it goes as `cos²`, the Moon overhead and the Moon underfoot both raise
a bulge: two high tides a lunar day, not one. And because the solar term adds
to the lunar one only when they share an axis, spring and neap tides fall out
without being modelled — `tides.range` traces the synodic month on its own.
Musically that is the useful part: a semidiurnal pulse whose depth breathes
over four weeks.

These are equilibrium tides on a hypothetical ocean over a rigid Earth. Real
coastal tides are dominated by basin resonance and can lag this by hours. It is
an honest astronomical driving force, not a tide table.

## Seeds

`cosmos.seed` is derived from **quantized inputs**, not from the computed sky:

```ts
generate({
  latitude,
  longitude,
  timestamp,
  seedResolution: { seconds: 3600, degrees: 0.25 },
});
```

Two devices in the same position cell and time bucket agree with no
coordination. The quantization absorbs GPS jitter and clock drift.

Deriving the seed from the cosmic state instead is tempting and wrong.
ECMAScript specifies `Math.sin`, `Math.cos`, and `Math.pow` as
implementation-approximated — V8, JavaScriptCore, and SpiderMonkey each return
results differing in the last bits. Every value here passes through dozens of
those calls. Two engines would usually land in the same quantized bucket and
agree, but near a boundary they would not, and the failure would be rare,
silent, and unreproducible. Latitude, longitude, and a timestamp are exact
doubles, and the hash is FNV-1a over `Math.imul`, which is exact everywhere.

The state still shapes the music. It just does not shape the seed.

## Descriptions

`generate()` allocates no strings, which is what makes calling it every frame
reasonable. Text is opt-in:

```ts
import { describe, describeLines } from "@amplib/cosmos";

describe(cosmos)["moon.phase"]; // "0.5616 (0.562)"
console.log(describeLines(cosmos)); // aligned and sorted, for a <pre> or a log
```

## Performance

A full warm evaluation is about 0.24 ms; sun and moon only (`skipPlanets:
true`) is about 0.07 ms. Both fit comfortably inside a 16 ms frame.

Rise/set and moon-quarter searches are iterative and cost roughly a millisecond
each, so they are memoised per local solar day and per observer position
rounded to 0.01°. A running clock hits the same cache entry all day. Continuous
quantities are recomputed every call.

## Accuracy

Verified against external references in [`test/run.ts`](test/run.ts) — defining
constants, published rise/set times, and eclipse instants, which are
unambiguous syzygies:

| Check                              | Result                           |
| ---------------------------------- | -------------------------------- |
| GMST at J2000.0                    | matches 18h41m50.548s to 1e-6 h  |
| Moon phase at six eclipse instants | within 0.5° of elongation        |
| Sunrise/sunset, three cities       | within 2 minutes of published    |
| Equation of time extremes          | within 1 minute                  |
| Inner-planet elongation limits     | never exceeded over 1500 samples |
| Planet magnitudes                  | inside published ranges          |

```bash
npm test              # accuracy suite + timezone determinism
npm run test:accuracy # accuracy only
```
