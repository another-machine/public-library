# @amplib/ui

A hypertoken theme for dense tool interfaces. It grew out of the stegassette
encoder, player and jobs queue, and carries nothing specific to them — any
tool that wants the same language can use it.

Stark black and white. Monospaced. Zero radius. No colour, no shadows, no
gradients except one hatch texture. Emphasis is made with **polarity** (ink on
paper / paper on ink), the weight of a hairline, and letter-spacing.

```
ui.css       the tool language — tokens, hypertokens, base, components
gallery.css  the exhibit language — see "The gallery" below
docs.css     the reference language — see "The reference" below
demo.html           kitchen sink; open it directly, no server needed
gallery-demo.html   the same, for the gallery; also needs no server
HYPERTOKENS.md      the portable guidance this system was built from
VOICE.md            the same, for the words on the page
README.md           this file
```

Three languages, one page each. Load exactly one: the tool file and the
reference file define the same names at different scales, and the gallery is
a different vocabulary entirely.

No build step, no dependencies, no JavaScript.

## Install

```sh
npm i @amplib/ui
```

```css
@import "@amplib/ui";            /* the tool language */
@import "@amplib/ui/docs.css";   /* or the reference language */
@import "@amplib/ui/gallery.css";
```

**Parcel needs its own scheme and the filename** — it reads a bare specifier in
CSS as a relative path, and it does not consult `exports`:

```css
@import "npm:@amplib/ui/ui.css";
```

**From TypeScript, use the subpath.** `tsc` resolves a CSS import through the
bundler's ambient `declare module "*.css"`, and that wildcard only matches a
specifier ending in `.css` — the root export has no extension to match, and a
stylesheet has no types to fall back on:

```ts
import "@amplib/ui/ui.css"; // not "@amplib/ui"
```

With no build step at all, copy the file out of `node_modules` and link it —
there is nothing to compile:

```html
<link rel="stylesheet" href="ui.css" />
```

---

## Modes

Two orthogonal modes, both plain attributes. Set them on `<html>` or `<body>`,
or on any subtree.

| attribute                 | effect                                         |
| ------------------------- | ---------------------------------------------- |
| _(none)_                  | dark — paper `#000`, ink `#fff`                |
| `data-theme="light"`      | light — paper `#fff`, ink `#000`               |
| `data-theme="auto"`       | follows the system preference, no JavaScript   |
| `data-density="compact"`  | 11px tool density: smaller type, tighter boxes |
| `data-density="default"`  | 12px, roomier — the default                    |

```html
<body data-density="compact">
  …
</body>
```

`color-scheme` is set for you, so native scrollbars, date pickers, select
popups and the caret follow the theme.

### Inverting a region

`.ht-surface-invert` crosses the ink/paper pair for its subtree and re-derives
every value from the crossed pair. Borders, links, inputs and buttons inside it
stay in system automatically.

```html
<section class="panel ht-surface-invert">…</section>
```

Inverting inside an inverted region does not re-flip — in a two-value system
that is a smell, not a feature.

---

## Layers

```css
@layer amplib.reset, amplib.tokens, amplib.base, amplib.hypertokens,
  amplib.components, amplib.utilities;
```

A later layer wins outright, whatever the specificity — so `base` sits before
`hypertokens`, and `.ht-type-display` on an `<h1>` beats the element default.

Anything you write outside a layer wins over all of it, so app CSS never needs
`!important` or specificity games. To override _inside_ the system's order,
declare your own layer after them:

```css
@layer amplib.app {
  .waveform {
    block-size: 5rem;
  }
}
```

---

## 1. Tokens — what value is used

Only two literals exist: `--ht-black` and `--ht-white`. Everything else is a
`color-mix` of the current pair, which is why a polarity flip recomputes the
entire palette.

```css
--ht-fg-base / --ht-bg-base   theme pair, never swapped
--ht-ink / --ht-paper         current polarity
--ht-ink-dim                  secondary text        (82% toward ink)
--ht-ink-faint                tertiary text         (58%)
--ht-ink-ghost                lines and texture ONLY — never type (25%)
--ht-line / --ht-line-strong  hairline, and its hover/active weight
--ht-raised / --ht-sunken     button fill, input well
```

Both text weights clear 5:1 against paper in either polarity. `--ht-ink-ghost`
is decorative; if you set type in it, it will fail contrast.

Three text sizes, deliberately — no ramp to pick from. Anything that isn't
secondary or the page title is `--ht-text-ui`. Hierarchy below that comes from
ink weight, tracking and case, which is what a monospaced two-value system
actually reads; a 1px size step just looks like a mistake.

The one exception is not a fourth size but a floor: `<input>`, `<textarea>` and
`<select>` resolve to `max(--ht-text-ui, --ht-text-control-floor)`, and that
floor becomes 16px under `(pointer: coarse)`. iOS Safari zooms the page when a
field computing under 16px takes focus and never zooms back out, and no viewport
key declines it. Controls that never take a caret — buttons, checkboxes, radios,
ranges, colour swatches — stay at the UI size on every pointer.

```css
--ht-font-mono                the only family
--ht-text-small               secondary text        10px  (10 in compact)
--ht-text-ui                  everything else       12px  (11 in compact)
--ht-text-display             the one page title    24px  (18 in compact)
--ht-text-control-floor       text-entry floor       0px  (16 on a coarse pointer)
--ht-leading-flat/-ui/-prose  1 · 1.5 · 1.7
--ht-track-none/-wide         0 · 0.14em

--ht-space-1 … --ht-space-9   2 · 4 · 6 · 8 · 12 · 16 · 24 · 32 · 48 px
--ht-gap                      inline rhythm   (row gaps)
--ht-flow                     block rhythm    (stack gaps)
--ht-flow-section             between document sections
--ht-pad-panel / --ht-pad-control-inline / --ht-pad-control-block

--ht-hairline: 1px            the only border width
--ht-radius: 0                the only radius; do not raise it
--ht-control-size(-sm)        control height
--ht-page-max / --ht-measure / --ht-sidebar / --ht-grid-min
--ht-code-max                 scroll cap on a code block
--ht-anchor-offset            in-page anchor clearance under a sticky masthead
--ht-duration / --ht-ease     90ms linear
```

Layout hypertokens read `--ht-gap` and `--ht-flow`, so retuning a whole region
is one declaration:

```html
<div class="ht-arrange-stack" style="--ht-flow: var(--ht-space-2)">…</div>
```

---

## 2. Hypertokens — what coordinated decision is applied

Grouped, reusable presentation decisions. Compose them on plain HTML; no
component required.

**Typography** — `.ht-type-ui` `.ht-type-small` `.ht-type-eyebrow`
`.ht-type-display` `.ht-type-prose` `.ht-type-code`

`.ht-type-small` covers every kind of secondary text — labels, captions, byte
counts, hints. Pair it with `.u-dim` or `.u-faint` when a line needs to sit
above or below its neighbours; that's the whole hierarchy mechanism.
`.ht-type-eyebrow` is the same size, differing only in case and tracking. That
uppercase is why an eyebrow cannot label a region with an identifier —
`loadImageFromImageUrl` becomes `LOADIMAGEFROMIMAGEURL`, and camel case is the
only thing that made it readable. Set symbol names in `.ht-type-code`, which
keeps their case; the eyebrow is for words.

**Arrangement** — `.ht-arrange-stack` `.ht-arrange-row` `.ht-arrange-split`
`.ht-arrange-inline` `.ht-arrange-grid` `.ht-arrange-sidebar`
`.ht-arrange-page` `.ht-arrange-layer`

**Shape** — `.ht-shape-control` `.ht-shape-control-square` `.ht-shape-panel`
`.ht-shape-flush` `.ht-shape-divide`

**Surface** — `.ht-surface-paper` `.ht-surface-raised` `.ht-surface-sunken`
`.ht-surface-invert` `.ht-surface-outline` `.ht-surface-dashed`
`.ht-surface-hatch`

**Media** — `.ht-media-raw` `.ht-media-square` `.ht-media-flush`

**Participation** — `.ht-participation-action` `.ht-participation-input`
`.ht-participation-focus` `.ht-participation-scroll`

**Time** — `.ht-time-ui` (colour/border only, 90ms, off under reduced motion)

`.ht-media-raw` is not decorative: it sets `image-rendering: pixelated`, and
encoded imagery must never be smoothed — an interpolated pixel misreports the
payload. When that is the only thing you mean, and the element is already sized
and framed, reach for the `.u-pixelated` utility instead; the hypertoken is a
whole framing decision that happens to include it.

`image-rendering` inherits, which is the utility's real use: put `.u-pixelated`
on a `figure` and it covers a canvas a script appends into it later. A class on
the element itself cannot, because nothing gives an injected canvas a class —
and a smoothed one is not a cosmetic bug, it is the payload rendered wrong.

`.ht-arrange-layer` stacks children in one grid cell (reconstruction under
encoded overlay, waveform under playhead) so the tallest still sizes the box.
`.ht-media-flush` opts a canvas or image out of the base framing — no border,
no surface — for imagery that is pure subject matter, like an overlay canvas or
a reveal.

There is no effects category. This system has no shadows, blurs or overlays;
`.ht-surface-hatch` is its only texture, for inert or unavailable regions.

```html
<a
  class="ht-arrange-inline ht-type-ui ht-shape-control
         ht-participation-action ht-time-ui"
  href="/decode"
  >decode ↗</a
>
```

`.ht-arrange-sidebar` is the main-column-plus-rail shell — the stegassette
encoder's layout: first child is the main column, last child is the rail, and
it wraps to one column when the container is narrow.

```html
<div class="ht-arrange-sidebar">
  <div class="ht-arrange-stack">…main…</div>
  <aside class="ht-arrange-stack">…settings…</aside>
</div>
```

---

## 3. Base — plain HTML is already in system

Every native control is styled from the same decisions, so markup with no
classes at all looks correct: headings, links, `hr`, lists, `table`, `details`,
`dialog`, `pre`/`code`/`kbd`, `figure`/`figcaption`, `canvas`, `audio`,
`video`, `progress`, and the full form set — text inputs (a bare `<input>`
with no `type` counts as one), `select` (with a redrawn square caret),
`textarea`, `range`, `color`, `file`, and square `checkbox`/`radio`.

A checked checkbox is a solid block; a checked radio is a block inside a ring.
No glyphs, no icon font, nothing to recolour.

Headings come in two levels, not six: `h1`/`h2` at display size, `h3`–`h6` at
eyebrow. Inline `code` (outside `<pre>`) gets a hairline box and keeps its
surrounding size — in an all-monospaced system it has nothing else to set it
apart. Anything with an `id` gets `scroll-margin-block-start`, so in-page
anchors clear a sticky masthead; set `--ht-anchor-offset` to its height.

Native `audio`/`video` controls live in shadow DOM: their radius and internal
chrome cannot be restyled, only the box around them. They get full width, a
hairline frame and the theme's `color-scheme` — that is the ceiling, and a
player pill will still look rounder than everything else on the page.

`aria-selected="true"` and `aria-pressed="true"` invert a button. State lives in
ARIA, not in a class, so the styling and the accessibility tree cannot drift.

---

## 4. Components — recipes that earned a name

| recipe                                                    | for                                            |
| --------------------------------------------------------- | ---------------------------------------------- |
| `.app`                                                     | centred page column                            |
| `.panel` `.panel__header/__body/__footer`                  | bordered region with header and footer bars     |
| `.field` `.field--check` `.field__hint` `.fieldset-stack`  | label + control rows (the settings rail)        |
| `.toolbar`                                                 | action row with a rule under it                 |
| `.tabs`                                                    | capture-mode bar; selection is polarity         |
| `.list` `.list__item/__index/__name/__meta`                | jobs queue, chunk list, entries                 |
| `.drop` `.drop__label` `.drop__sub`                        | file target                                     |
| `.badge`                                                   | boxed metadata token                            |
| `.status`                                                  | one line of machine output                      |
| `.meter` `.meter__fill`                                    | capacity / payload fit                          |
| `.frame` `.frame__caption`                                 | canvas or preview with a caption                |
| `.masthead`                                                | sticky page banner with a hairline under it     |
| `.doc`                                                     | prose page: section rhythm + measure            |
| `.code`                                                    | scrollable code block with colourless emphasis  |

States are data attributes and ARIA, never extra classes:

```html
<div class="drop" data-ready>…</div>
<!-- transient data-state: empty | over · persistent boolean: data-ready.
     Two attributes because a drag can pass over a drop that is already
     loaded — the states coexist. -->
<p class="status" data-state="error">payload exceeds capacity</p>
<!-- busy | done | error -->
<span class="badge" data-emphasis="strong">on every chunk</span>
<!-- strong | quiet -->
<div class="meter" style="--ht-meter-value: 71%"><span class="meter__fill"></span></div>
<section class="panel" data-flush>…</section>
<!-- body padding off -->
```

A `.drop` spans its container; put drops in a `.ht-arrange-row` and they share
the line equally instead.

Inside `.code`, emphasis is made without colour: body text sits at
`--ht-ink-dim`, a value bound to a live control is full ink and underlined, and
a region written at runtime is set off by a gutter rule. An empty output slot
hides itself until the example fills it.

```html
<pre class="code">
Stegassette.encode({ traversal: "<span data-value="traversal">serpentine</span>" });
<span data-output="decode"></span></pre>
```

A settings row, end to end:

```html
<div class="field">
  <label for="trav">traversal</label>
  <select id="trav">
    <option>serpentine</option>
  </select>
  <span class="field__hint">order data pixels are visited</span>
</div>
```

Override the label column locally with `--ht-field-label`, and the list height
with `--ht-list-max`.

---

## 5. Utilities

`.u-grow` `.u-fixed` `.u-full` `.u-inline` `.u-truncate` `.u-nowrap` `.u-dim`
`.u-faint` `.u-end` `.u-pixelated` `.u-sr-only`

`.u-inline` is the escape from full-width defaults: `progress`, `range` and
`.status` fill their container on their own line by design, and this lets one
sit inline in a transport row at its natural size instead.

That is the whole set. If you find yourself wanting a sixth spacing utility,
the answer is a hypertoken or a recipe, not more utilities.

---

## Rules of the system

1. **No colour.** Not for success, not for failure. Failure is full-contrast
   type with a `!!` prefix, so it survives greyscale, forced colours and print.
2. **No radius.** `--ht-radius` is `0` and every control — including range
   thumbs, checkboxes and radios — respects it.
3. **One family, one border width.** `--ht-font-mono`, `--ht-hairline`.
4. **Selection is inversion.** Selected, pressed and current all read as
   paper-on-ink. Nothing else may.
5. **Semantics first.** A link navigates with `<a href>`, an action is a
   `<button>`. Styling never substitutes for the right element.

## Accessibility

- One focus treatment system-wide: `2px solid var(--ht-ink)` at a hairline
  offset, applied on `:focus-visible` only.
- `prefers-contrast: more` collapses the grey ramp toward full ink.
- `prefers-reduced-motion: reduce` disables transitions globally.
- `forced-colors: active` hands surfaces to the system palette and keeps the
  hairlines, which are the entire structure of this theme.
- `@media print` forces black-on-white and unclips scrolling lists.
- Contrast: `--ht-ink-dim` and `--ht-ink-faint` clear 5:1 on paper in both
  polarities; `--ht-ink-ghost` is decorative only.

## Tradeoffs, stated plainly

- **Recipes restate their hypertokens.** Plain CSS cannot make one class
  inherit declaration blocks from others, and this library has no build step,
  so `.panel` and friends duplicate the declarations of the hypertokens named
  in a comment above each recipe. Change a hypertoken, change its recipes. If
  that pairing ever gets expensive, that is the signal to add a compiler — not
  before.
- **`color-mix()` is required.** Baseline in Chrome/Edge 111+, Safari 16.2+,
  Firefox 113+. Without it the derived greys fall back to nothing and the
  theme loses its ramp; there is no polyfill and none is planned. `:has()`
  (same era) is used once, to mirror a theme set on `<body>` up to the page
  canvas — without it only the overscroll area is wrong.
- **Density is a mode, not a variant.** It only retunes shared values. If a
  screen needs its own geometry, override the tokens on that screen.
- **The scale stops where the tools stop.** No cards, modal system, tooltips,
  menus, or icon set — those are unearned here. Add one when a second screen
  needs it, and add it as a recipe composed from existing hypertokens.

## The gallery

`gallery.css` is a second, standalone stylesheet for the pages where
finished work hangs — stega.now/live and stega.now/geese are its origin. It is
deliberately the opposite pole from the tool language: serif and letter-spaced
where the tools are monospaced, dark rooms where the tools are paper and ink,
brightness where the tools use polarity. The two files do not depend on each
other and are not meant to be mixed on one page.

Its vocabulary is the exhibit:

| recipe       | for                                                          |
| ------------ | ------------------------------------------------------------ |
| `.gallery`   | a deck of rooms, one per viewport, snap-scrolled — vertical, or a promenade with `data-axis="x"` |
| `.room`      | one full-viewport stop; `--gal-backdrop: url(…)` hangs a veiled enlargement behind the work |
| `.placard`   | an intro or colophon — serif text on solid black             |
| `.work`      | the chromeless toggle button a piece hangs in; state is `aria-pressed` |
| `.rail`      | a snap-scrolling strip of works sharing one wall             |
| `.gal-ghost` | withdrawn from view but still holding its place              |
| `.gal-glow`  | the halo a work casts on the room                            |

Attention is brightness: a work rests at `--gal-dim` and comes to full light
under hover or `aria-pressed="true"`; a rail rests deeper so the lit work
reads as current. Encoded pixels are the subject, so imagery is never
smoothed. The works themselves are in colour — the no-colour rule is about
the room, not the art.

While a piece is decoding, mark `data-loading` and its stand-in breathes. Put
it on the work itself — the precise case, and the only one that reads right
for a single work inside a rail — or on the room, when the room holds one
stand-in of its own. Either way a rail of other works keeps still.

`--gal-backdrop` needs an *absolute* URL (`img.src`, not the `src` attribute):
a relative `url()` inside a custom property resolves against the stylesheet
that consumes it, not the page that set it.

`gallery-demo.html` is the kitchen sink for all of this — both axes, a room
with its own backdrop and one sharing the page's, a rail, and the decode
pulse. It paints every work with a canvas at load, so it needs no assets and
opens straight off disk.

## The reference

`docs.css` is the third file: the same language as the tool, spoken at
reading distance. It exists because the amplib package documentation is not a
tool screen — it is read rather than operated, and the examples on it are live
tool UI that has to keep working.

That last point is why it is a fork and not a new vocabulary. Every class name
is identical to the tool file's, so a `.field`, a `.panel` or a `.code` block
can be pasted straight into its own documentation and simply comes out bigger.
The gallery could afford new nouns because a room shares nothing with an
encoder; a reference page shares almost everything.

| | tool | reference |
| ---------- | -------------- | ---------------- |
| secondary  | 10px           | 12px             |
| body       | 12px           | 14px             |
| code       | 10px (chrome)  | 14px (the subject) |
| section    | —              | 20px             |
| page title | 24px, upper    | 32px, case kept  |
| density    | `compact` mode | none             |

Four rungs instead of three, because a document has page, section and step
where a tool has a banner and then flat rows. Nothing is uppercased but the
eyebrow: what a reference names is usually an identifier, and case is the only
thing that makes `loadImageFromImageUrl` or `@amplib/cosmos` readable — the one
rule this file breaks with the tool language, and the reason it is a separate
file rather than a set of overrides.

Three recipes exist only here:

| recipe       | for                                                        |
| ------------ | ---------------------------------------------------------- |
| `.doc`       | the reference page; each `> section` is one entry, with a rule above it |
| `.signature` | the type contract an entry documents — unframed dim code   |
| `.entry`     | a name and the line about it, on an index where many share one section |

`.entry` exists because the two page shapes disagree about what a section is.
On a reference page a section _is_ an entry, and needs no wrapper. On an index,
one section holds nineteen of them, and the section's own rhythm puts a
description exactly as far from its name as from the next name — belonging to
neither. `.entry` is the tighter inner group.

`.signature` is the one place code is not `pre-wrap`: a signature is a single
logical line that should wrap to the column, and authoring it across several
source lines must not put that indentation on the page.

**The cost, stated plainly.** This is a fork, so the two files drift. A fix to
the base layer or a new recipe has to be made twice, and nothing enforces that.
It is the same trade this library already takes with recipes restating their
hypertokens: duplication is cheaper than a build step until it isn't. The
signal to reconsider is a third consumer, not a second one.

## Extending it

Read [HYPERTOKENS.md](HYPERTOKENS.md) first — it is the reasoning this system
was built from. Then, in order:

1. Can the change be a token override in a local scope? Do that.
2. Does a coordinated group of declarations now appear three times? Name it as
   a `.ht-*` hypertoken.
3. Does that whole composition repeat with the same meaning? Give it a recipe
   in `amplib.components`, and note the hypertokens it restates.
4. Verify in both polarities, both densities, at narrow widths, and with
   keyboard focus visible. `demo.html` exists for exactly this.
