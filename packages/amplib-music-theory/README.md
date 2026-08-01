# @amplib/music-theory

Chromatic scales, modes, intervals and chords, as plain objects you can read.

```ts
import { Scale, Mode, Note, parseChord } from "@amplib/music-theory";

const scale = new Scale({ root: "C", mode: "minor" });

scale.label; // "C Aeolian" — the vanity mode resolves to the mode it means
scale.noteIds; // ["C0", "D0", "D#0", "F0", "G0", "G#0", "A#0", "C1", …]
scale.intervals; // the 7 intervals, each with label, notation and meta

Mode.types; // ionian … locrian, plus melodic, harmonic, major, minor
Note.notationsUnique; // the 12 sharps and the 5 flats that alias them
```

`parseChord` goes the other way, from written notes to a recognized quality:

```ts
const parsed = parseChord("CEG");

parsed.pitchClasses; // [0, 4, 7]
parsed.notations; // ["C", "E", "G"]
parsed.chord?.label; // "C"
```

Origin [ja-k-e/musical-scale](https://github.com/ja-k-e/musical-scale).

## Modules

| Module       | Description                                                             |
| ------------ | ----------------------------------------------------------------------- |
| `Scale`      | A root plus a mode, expanded into intervals and playable note ids        |
| `Mode`       | The seven church modes, plus melodic and harmonic minor                  |
| `Note`       | Pitch classes and their notations, sharp and flat                        |
| `Interval`   | One scale degree — its quality, notation and metadata                    |
| `Chord`      | A triad or seventh, named by quality                                     |
| `parseChord` | Written notes (`"CEG"`) → pitch classes, notations and a matching chord  |

## Design

**Vanity modes are inputs, not a separate concept.** `Scale` accepts `"major"`
and `"minor"` alongside the seven mode names, and resolves them — asking for
`"minor"` gives you a scale that labels itself `"C Aeolian"`. Callers get to use
the word people actually say without the library carrying two parallel notions
of what a mode is.

**Chords are recognized, not assumed.** `parseChord` accepts any set of notes,
including one or two, and only sets `chord` when they form a triad or a seventh.
Most inputs do not, so `parsed.chord` is optional by design rather than as a
failure case. Duplicates collapse to their first occurrence, which makes order
meaningful: the first note written is the root.

**Flats are aliases, not separate notes.** `Note` has 12 pitch classes; the five
flat spellings resolve onto the sharps they share. `notationsUnique` lists all
17 names, so a UI can offer `Eb` while the scale still works in one chromatic
space.
