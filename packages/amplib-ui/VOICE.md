# Voice for amplib surfaces

Portable guidance for an agent writing the words in one of these interfaces:
catalog entries, reference pages, README prose, code comments, empty states,
error text.

The stylesheets already refuse decoration — no colour, no shadow, no radius.
The writing refuses it the same way. A system that says everything with
polarity and a hairline cannot be narrated in a voice that oversells.

Three CSS files, three registers. Same voice at three distances.

```
ui.css       tool        terse, imperative, present tense
docs.css     reference   explanatory, evidence-first
gallery.css  exhibit     plainest of the three; the work is the argument
```

## Rules that hold in all three

**Say it once.** A page states its premise in one place. If the second
paragraph restates the first in different words, delete the second. If a
section header and its first sentence carry the same content, the sentence
goes.

**Lead with the thing.** Not with what kind of thing it is, not with why it is
about to be described.

> A Palette divides the hue wheel into equal sectors, so that any hue names a
> slot and any slot names a hue.

Not "This section covers the Palette class, which is designed to…".

**A claim needs a number or it needs cutting.** The register is confident
because it is specific, not because it is emphatic.

> accurate to roughly an arcminute for the Sun, Moon, and planets over
> 1700–2200
>
> an 840-sample sweep under nine timezones
>
> The spread between the extremes is over two hundredfold.

**Name the constraint, not the road not taken.** Write what is true of the
code. Do not stage a debate with an alternative nobody proposed, and do not
congratulate the code for avoiding it. The exception is a fact that cost
someone an afternoon and would cost the next reader the same — say that
plainly, once, where it happened.

**Prefer the concrete noun.** "The handle is kept in IndexedDB" over "state is
persisted". "Two phones have to agree without talking to each other" over "the
system supports distributed determinism".

**No hype.** Never: powerful, seamless, robust, elegant, blazing, effortless,
rich, comprehensive, cutting-edge, simply, just, of course, obviously.

**Sentences run short.** Median 15 words across these packages; a quarter run
under 9. A long one is fine when the thought is long. Follow it with a short
one.

**Second person for instructions, third for behaviour.** "Choose a folder in
the controller." / "The wheel never inspects them."

## Catalog entries

The one-liner under a name, on the site and in the docs index. It is the most
copied piece of writing in the system, so it has the tightest rules.

- A noun phrase. No verb at the head, no "A library that…".
- Sentence case.
- **No terminal period.**
- Say what it is, not what it is for.

```
@amplib/color              Color analysis utilities
@amplib/cosmos             Calculations about the relationship between the
                           earth, moon, sun, planets, and more
@amplib/steganography      Encoding and decoding data in image pixels
avva                       Hearing color and seeing sound
unison                     Chromatic note detection and aural mirror
omnichord                  A modern tribute to the Om-108
```

Project names are lowercase — `avva`, `modulo`, `another machine` — including
at the start of a sentence. Package names keep their scope: `@amplib/color`.

## Headings

Either the identifier being documented, verbatim and in its own casing:

> `generate` · `Scale` · `DetectTone` · `noise2d` · `AudioGraph, FMVoice`

Or a short sentence-case phrase naming the idea:

> Perceptual hue · Round trip · The same division, drawn twice ·
> The value contract · Tradeoffs, stated plainly

Never a question, never a gerund label ("Getting started", "Understanding
colour"), never a number ("3 ways to…").

## README shape

Lede, then code, then the sections that matter, then `## Design`.

The lede is one or two sentences and does the catalog entry's job in full
prose. `## Design` is where the reasoning lives — bold the claim, then support
it:

> **It is a pure function.** Given the same latitude, longitude, and UTC
> timestamp, `generate()` returns the same result on every machine…

State costs in the open. `## Tradeoffs, stated plainly` is a real heading in
this repo, and the honesty is load-bearing: a system that admits what it is bad
at is believed about what it is good at.

## Code comments

A comment earns its place by holding what the code cannot:

- a constraint from outside the file (an API that fails a certain way, a
  browser behaviour, a hardware limit)
- a measured number and where it came from
- a unit, a range, or a coordinate convention
- why an obvious-looking line is load-bearing

Not: a restatement of the next line, a defence of the approach, or history the
reader cannot see. Density lands near one comment word per line of code across
these packages, and the dense files earn it with measurements.

Never write "note that", "actually", "simply", or "of course".

## Spelling and typography

**Prose leans British, identifiers stay American.** `colour`, `normalised`,
`behaviour` in sentences; `color`, `normalize` in code, filenames and package
names. Inside `@amplib/color`, prose follows the package.

**Straight quotes. Spaced en dash or em dash, used sparingly** — one per
paragraph is plenty, and a colon is usually the better tool.

**No orphans in display text.** On marketing and catalog surfaces, bind the
last two words with `&nbsp;` so a single word never wraps alone:

```html
<p>Hearing color and seeing&nbsp;sound</p>
<p>...as the shape of the web spoils into something it never had to&nbsp;be.</p>
```

**Lists take no terminal punctuation** unless an item is a full sentence.

## Tells that mean a rewrite

Search for these before shipping. Each is a symptom of writing that is
performing rather than describing:

| pattern | fix |
| --- | --- |
| "which is what makes it X", "that is the property that" | state X |
| "not X, but Y" where nobody proposed X | state Y |
| "the whole point of", "the whole reason" | usually deletable entire |
| "rather than", "instead of" three times on a page | keep the one that is a real gotcha |
| a was/now table comparing to an earlier version | describe the current behaviour |
| the premise restated in the second, third and fourth file | keep the first |
| "at all", "genuinely", "essentially", "deliberately" | delete the word |
| every paragraph the same length | vary, or cut |

The test: read it back as if someone competent handed it to you without
explanation. If it sounds like it is convincing you, it needs cutting. If it
sounds like it is telling you, it is done.
