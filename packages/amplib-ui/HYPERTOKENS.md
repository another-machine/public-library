# Hypertokens for CSS systems

This file is portable guidance for an agent designing or extending a visual
system in HTML and CSS. It applies to a one-page interface, a site with a few
repeated patterns, and a component library with generated outputs.

Do not assume that every project needs the same architecture. Preserve the
project's existing conventions when they are coherent. Add only the amount of
system needed to make the interface clearer, more consistent, and easier to
change.

## The idea

A design token names a value or decision:

```css
:root {
  --color-accent: #465dcc;
  --space-control-inline: 1rem;
}
```

A component names a reusable interface concept:

```html
<button class="button">Continue</button>
```

A **hypertoken** sits between them. It names a coherent, reusable group of
presentation decisions:

```css
.ht-type-control {
  font: 650 1rem/1.25 system-ui, sans-serif;
  letter-spacing: -0.01em;
}

.ht-shape-control {
  min-block-size: 2.75rem;
  padding-inline: var(--space-control-inline);
  border: 1px solid transparent;
  border-radius: 0.625rem;
}
```

The exact syntax is not important. A hypertoken may be a class, a declaration
block emitted by a build step, a mixin, a structured object, or another native
abstraction. Its important properties are:

- It groups properties that form one recognizable design decision.
- It is named for its role or intent, not for the literal values it contains.
- It can be reused without requiring a whole component.
- Its output is ordinary, understandable CSS.
- It removes repeated judgment rather than merely moving repeated text.

A text style is a familiar example: one name can stand for a coordinated font
family, size, weight, line height, and tracking. Hypertokens generalize that
pattern to the other kinds of presentation a system needs.

## Start with the smallest useful system

The goal is not to maximize abstraction. The goal is to put settled decisions
in one place and leave unresolved decisions easy to explore.

Choose the lightest starting point that fits the work:

### A small, one-off interface

Use:

- Custom properties for values that repeat, vary by theme, or need coordinated
  change.
- A few semantic grouped classes for visual patterns that repeat or are
  important enough to name.
- Native HTML elements and ordinary selectors for everything else.

A single `styles.css` is enough. Layers are optional, but can make the roles
clear without creating more files:

```css
@layer reset, tokens, hypertokens, components, page;
```

Do not create a manifest, generator, exhaustive taxonomy, or component API
unless the interface has a real need for one.

### A growing site or application

Use:

- Primitive or semantic custom properties for shared values and modes.
- Named hypertoken classes or shared declaration blocks.
- Component recipes that compose those hypertokens.
- A small set of explicit rules for states, variants, slots, or containers.

Separate files only when ownership or navigation improves:

```text
styles/
  tokens.css
  hypertokens.css
  components.css
  pages.css
```

This is an example, not a required structure.

### A multi-platform or generated component library

Consider a structured source only when the same intent must produce several
outputs or when drift is already costly:

```text
system source
  ├─ values and modes
  ├─ named style fragments
  ├─ component recipes
  └─ conditional rules
       ↓ deterministic transforms
  CSS, components, design assets, documentation, and agent context
```

The structured source may be JSON, TypeScript, YAML, or a domain-specific
format. Choose it based on the maintainers and build environment. Generated CSS
should still be readable and debuggable.

Use deterministic code for decisions the system has already made. Use agent
judgment for discovery, migration, and genuinely new design problems—not to
re-infer settled styling on every run.

## Tailor the shape to the scenario

Before changing code, inspect:

1. What presentation decisions repeat?
2. Which repetitions are intentional patterns, and which are coincidence?
3. Which values change together across themes, density, brand, or platform?
4. Which patterns cross component boundaries?
5. Which decisions are stable enough to name?
6. Who will edit the system, and what syntax will they understand?
7. Is the source of truth handwritten CSS, generated CSS, or a higher-level
   schema?
8. What is the cost of adding a new abstraction here?

Then state the proposed shape in plain language. For example:

> This is a three-page site with no build step. Keep tokens and hypertokens in
> one CSS file. Extract the repeated editorial typography and card surface, but
> leave the unique hero composition local to the page.

Or:

> This library has several output targets. Represent fragments and rules in
> typed data, compile them to stable class names and platform-native styles, and
> treat the generated artifacts as outputs rather than parallel sources of
> truth.

Do not impose a large-system answer on a small interface. Do not keep a small
interface's accidental conventions when the project has become a shared
library.

## A practical CSS model

The following is a useful baseline, not a universal prescription.

### 1. Values and modes

Custom properties carry raw values, semantic values, and mode changes:

```css
@layer tokens {
  :root {
    --blue-600: #465dcc;
    --blue-700: #3548a8;
    --white: #fff;
    --space-2: 0.5rem;
    --space-3: 0.75rem;
    --space-4: 1rem;

    --content-action: var(--white);
    --surface-action: var(--blue-600);
    --surface-action-hover: var(--blue-700);
    --focus-ring: #7896ff;
  }

  [data-theme="dark"] {
    /* Rebind semantic values here when the mode needs it. */
  }
}
```

Not every literal needs a token. Extract a value when at least one is true:

- It repeats as part of the system.
- It has semantic meaning.
- It changes by mode or context.
- It should be changed centrally.
- Naming it makes the design decision clearer.

### 2. Reusable style fragments

Hypertokens group coordinated declarations:

```css
@layer hypertokens {
  .ht-arrange-inline-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    inline-size: fit-content;
  }

  .ht-type-action {
    font-family: system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 650;
    line-height: 1.25;
  }

  .ht-shape-control-medium {
    min-block-size: 2.75rem;
    padding-inline: var(--space-4);
    border: 1px solid transparent;
    border-radius: 0.625rem;
  }

  .ht-surface-action-primary {
    color: var(--content-action);
    background: var(--surface-action);
    box-shadow: 0 1px 2px rgb(27 30 43 / 14%);
  }

  .ht-surface-action-primary:hover {
    background: var(--surface-action-hover);
  }

  .ht-participation-action {
    appearance: none;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    text-decoration: none;
  }

  .ht-participation-action:focus-visible {
    outline: 3px solid var(--focus-ring);
    outline-offset: 3px;
  }
}
```

They can be used directly in small HTML:

```html
<button
  class="
    ht-arrange-inline-action
    ht-type-action
    ht-shape-control-medium
    ht-surface-action-primary
    ht-participation-action
  "
  type="button"
>
  Continue
</button>
```

This is intentionally framework-free. It gives a small interface the same
benefit—named, reusable design decisions—without requiring a component library.

### 3. Component recipes when repetition earns them

If the same group appears repeatedly, give the composition a component class:

```css
@layer components {
  .button {
    /* This recipe may inline the declarations, compose them at build time,
       or share them through the project's preferred CSS mechanism. */
  }
}
```

```html
<button class="button" type="button">Continue</button>
```

Plain CSS cannot reliably make one class inherit arbitrary declaration blocks
from several other classes. Choose among these approaches deliberately:

- Put hypertoken classes in the HTML. This is explicit and works with no build
  step.
- Duplicate the composed declarations into a component recipe. This can be
  reasonable for a small codebase if the relationship is documented and tested.
- Use a build-time facility to compose or generate the recipe. This is useful
  when drift or scale justifies tooling.
- Use a custom-property contract: fragments set semantic variables and the
  component consumes them. This works well when variants mostly change values,
  but less well when they change structure or unrelated property sets.

Do not hide a fragile `@apply`, preprocessor, or generator behind the word
"hypertoken." The mechanism should match the project's actual toolchain.

## Categories are a lens, not a law

One useful way to discover fragments is to consider:

- **Surface:** fills, borders, foreground relationships, and visual emphasis.
- **Shape:** dimensions, padding, radius, clipping, and geometry.
- **Arrangement:** layout, alignment, gaps, wrapping, and placement.
- **Participation:** interaction affordances, selection, focus, hit behavior,
  and visibility in interaction.
- **Typography:** font, size, weight, line height, tracking, and text treatment.
- **Effects:** shadows, filters, overlays, and other visual effects.
- **Transformation:** transforms and changes between visual states.
- **Time:** duration, easing, delay, and reduced-motion behavior.

These categories help an agent look for coherent groups and avoid a single
giant "style" object. They are not required namespaces or an exhaustive
ontology.

Merge categories when users always understand and change them together. Split a
category when it contains independent decisions with different reuse. Add a
project-specific category when it clarifies a real domain, such as data
visualization marks, editorial rhythm, or spatial depth. Omit categories that
the interface does not use.

The quality test is not "does this fit the official bucket?" It is "does this
name capture a reusable decision at the right level?"

## Naming

Prefer names that describe purpose:

```text
type.control
surface.action.primary
shape.control.compact
arrangement.toolbar
effect.overlay.elevated
```

Avoid names that merely serialize implementation:

```text
blue-background-white-text
padding-12-radius-8
flex-center-gap-2
```

Names do not have to be globally abstract. A small editorial site may benefit
more from `type.article-deck` than from `type.content.prominent`. Use the
narrowest name that remains true everywhere the fragment is reused.

Use stable class syntax that fits the repository:

```text
.ht-type-control
.type-control
.u-type-control
[data-surface="action-primary"]
```

The prefix is optional. Consistency and collision safety matter more than the
spelling.

## Rules and conditions

Variants and states are rules that add, remove, or replace style fragments under
known conditions.

For small CSS systems, express the rule in native CSS:

```css
.button[data-size="small"] {
  min-block-size: 2.25rem;
  padding-inline: var(--space-3);
  font-size: 0.875rem;
}

.button[aria-busy="true"] {
  cursor: wait;
  opacity: 0.72;
}

@container (inline-size < 24rem) {
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ht-time-responsive {
    transition: none;
  }
}
```

For larger systems, a rule may be structured data that a compiler resolves.
Regardless of representation, keep these distinctions clear:

- Values answer **what value is used?**
- Hypertokens answer **what coordinated presentation decision is applied?**
- Rules answer **when does that decision apply?**
- Components answer **what reusable interface concept is this?**
- HTML answers **what does this content or control mean?**

Styling must not erase semantics. A link and a button may share presentation,
but navigation should still use `<a href>` and an action should still use
`<button>`.

## Bottom-up discovery is valid

Do not require a team to invent a complete hypertoken vocabulary before it can
style an interface.

A practical discovery loop is:

1. Build the interface with clear CSS and shared values.
2. Notice a coordinated declaration group appearing again.
3. Compare the uses. Decide whether the match is intentional.
4. Name the shared decision if doing so improves reuse or understanding.
5. Replace the matching uses with the canonical fragment.
6. Treat near-matches as a question, not an automatic deduplication:
   intentional distinction or accidental drift?

The same declaration group should not acquire several competing names. However,
identical CSS in two places is not automatically the same design decision; it
may change independently later. Deduplicate by shared intent, not text alone.

## Agent workflow

When asked to create or refactor a CSS-based system:

1. **Inspect before proposing.** Read the HTML, CSS, build configuration,
   existing token files, naming conventions, browser support, and accessibility
   requirements.
2. **Describe the current design vocabulary.** Identify repeated values,
   coordinated style groups, component concepts, and conditional rules.
3. **Choose a proportionate architecture.** Explain why a single file, split
   CSS files, or structured source fits this scenario.
4. **Preserve semantics and behavior.** Use native HTML correctly. Keep focus,
   keyboard, contrast, forced-color, and reduced-motion behavior intact.
5. **Extract only earned abstractions.** Start with repeated or strategically
   important decisions. Leave one-off expressive work local unless naming it
   adds real clarity.
6. **Separate the layers conceptually.** Values, fragments, rules, and
   components may live in one file, but they should not be confused.
7. **Implement in native output.** Produce readable CSS and minimal,
   understandable HTML. Do not introduce a framework only to support the model.
8. **Exercise the system.** Test representative components, non-component
   content, states, themes, responsive conditions, and accessibility settings.
9. **Report tradeoffs.** State what was generalized, what remained local, and
   what future scale would justify changing the structure.

When requirements are unclear, prefer a reversible first step and document the
assumption. Do not manufacture variants or taxonomies solely to make the system
look complete.

## What not to do

- Do not replace every literal with a custom property.
- Do not make one hypertoken per declaration.
- Do not create one enormous hypertoken that is effectively a component skin.
- Do not name fragments after current values when their purpose is known.
- Do not force all fragments into a fixed category list.
- Do not use CSS classes as a substitute for semantic HTML.
- Do not encode product logic into presentation tokens.
- Do not make runtime JavaScript resolve styling that CSS can express directly.
- Do not add a compiler before multiple outputs or maintenance costs justify it.
- Do not allow generated and handwritten artifacts to become competing sources
  of truth.
- Do not treat visually identical patterns as semantically identical without
  checking whether they are intended to change together.
- Do not abstract expressive exceptions until the abstraction makes them easier
  to understand.

## Validation checklist

A good result should make these answers clear:

- Can a reader distinguish values, hypertokens, rules, and components?
- Are grouped styles named by role or intent?
- Does each abstraction have more value than indirection cost?
- Can hypertokens style ordinary HTML outside a component?
- Does the system remain useful with no JavaScript framework?
- Are component states and variants explicit rather than selector accidents?
- Are themes and modes resolved through shared values where appropriate?
- Do focus, disabled, busy, hover, active, forced-color, and reduced-motion
  behaviors remain correct?
- Is unique expression still possible without fighting the system?
- Can a maintainer find every consumer of a fragment?
- If output is generated, is the source of truth unambiguous and the output
  deterministic?
- Could a smaller implementation provide the same benefit?

## The durable principle

Hypertokens are not a particular file tree, category list, or compiler. They are
a way to name and reuse coordinated design decisions below the component level.

For a small HTML page, that may mean three well-named CSS classes. For a mature
library, it may mean typed fragments, conditional rules, and deterministic
outputs across platforms. Both are valid when the structure is shaped by the
work rather than imposed on it.

---

## How this directory applies it

`ui.css` is the small-system answer: one file, a reset plus five
layers, no build step, no dependencies. Its shape, stated as the guidance
asks:

> These are dense internal tools with no build step and one visual language —
> black and white, monospaced, square. Keep tokens, hypertokens, base element
> styling, recipes and a handful of utilities in one file. Extract the
> decisions that repeat across the encoder, the player and the jobs queue —
> control shape, panel surface, field row, selectable list row, drop target —
> and leave anything specific to one screen in that screen's own CSS. Name
> nothing after stegassette: the same tools language is expected to serve
> other apps, and a recipe that carries a product name into a second one is
> the abstraction failing.

Two deviations from the model above, both deliberate:

- **No effects category.** The system has no shadows, blurs or overlays. A
  single hatch texture lives under `surface`, where it is used.
- **Recipes restate their hypertokens.** With no build step, `.panel` and
  friends duplicate the declarations of the hypertokens named in a comment
  above each recipe — the second option in "Component recipes when repetition
  earns them". Adding a compiler is the right move only once that pairing
  starts drifting.

See [README.md](README.md) for the catalog and the extension order.
