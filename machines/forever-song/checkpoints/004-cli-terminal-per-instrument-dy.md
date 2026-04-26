<overview>
The user is building `forever-song`, an infinite procedural generative music machine where astronomical data and geographic location shape the composition. The underlying score (key, mode, tempo, meter) is universal and deterministic (identical across all listeners on Earth), while the regional texture (dynamics, timbre, articulation) varies by location and time of day. The latest phase transformed the UI from buttons/sliders to a monospace CLI terminal matching GitHub Copilot's aesthetic, with a scrolling beat stream (left), fixed status panel with performance meters (right), and command interface (bottom). Currently mid-implementation of per-instrument dynamics and an interactive 2D map for location selection.
</overview>

<history>
1. User asked to revisit `@amplib/cosmos` with better models
   - Explored the rebuilt cosmos library for accuracy
   - Planned a comprehensive music engine using astronomical signals

2. User said "get going" and built the first version
   - Created `src/app.ts` with full cosmos→audio pipeline (ChromaticWall synth + Clock)
   - Created minimal `src/index.html` UI with listen button, status rows, mute button
   - Build succeeded: 36.58 kB

3. User asked for location configuration via URL
   - Added `?lat=X&lon=Y` URL parameter parsing
   - Falls back to browser geolocation if absent
   - Button text changes based on whether location was provided

4. User asked clarifying questions about determinism and what changes by location
   - Explained: composition rules (key, mode, BPM) are fully deterministic from orbital math; note events are stochastic within those constraints
   - Explained what varies by location: sun elevation → density/filter, Jupiter altitude → FM depth, Venus altitude → twinkle character

5. User identified a sync bug: "so they should be playing the same notes?"
   - Found issue: `stepPosition` was local per-tab, so different note sequences across tabs
   - Added `withSeededRandom(wallBeatIndex, ...)` using xorshift32 PRNG for universal note selection
   - Fixed beat phase with `wallBeatIndex = Math.floor(Date.now() / beatIntervalMs)` anchored to Unix epoch
   - Now all tabs at same moment play identical notes

6. User asked for visual sync lights
   - Modified `ChromaticWall.tick()` to return `{ main, twinkle }` booleans
   - Added two flash dot indicators in HTML
   - Fixed CSS build failure (malformed selector, switched to inline styles)

7. User said notes aren't firing often enough
   - Increased subdivision 8 → 16 (tick rate 2.4/s → 4.9/s)
   - Tightened chance formulas: more frequent 3–5 notes/sec instead of 1–2

8. User asked for sync button
   - Added button that arms to next 5-second boundary
   - Uses rAF for accurate timing (~1ms vs setTimeout's ~4ms)
   - Shows live countdown on button

9. User asked for more character + when key changes
   - Added rhythmic groove via 16-step accent table (4/4 bar)
   - Replaced frozen Jupiter-Saturn resonance with `diurnalClock` (0→1 over 24h) for daily melodic arc
   - Added night/day envelope modifiers (0.5s release day → 3.5s night)
   - Mars synodic clock (780d) → main FM frequency sweep (4–28 Hz)
   - Saturn synodic clock (378d) → twinkle FM frequency (8–22 Hz)
   - Key status now shows countdown to next root/mode change

10. User asked for time-travel via URL
    - Added `?days=X` URL param + slider (−180 to +180 days) in UI
    - Shows simulated date when offset is active
    - Instantly changes key, mode, FM texture when slider moves

11. User asked for variable time signature
    - Created TIME_SIGNATURES table: 4/4, 3/4, 6/8, 5/4, 7/8
    - Driven by `venusSynodicClock` (584-day cycle, ~117 days per meter)
    - Each meter has custom accent weights + bass probability pattern
    - Fully deterministic — same era everywhere on Earth

12. User asked for bass instrument
    - Added dedicated FM bass voice (sawtooth carrier, sine sub-harmonic modulator)
    - Fires on strong quarter-note beats per time signature
    - Warm lowpass filter (500 Hz, Q 0.8)
    - Plays root at octave 2–3
    - Night releases longer than day (dreamy ↔ punchy)

13. User asked for CLI terminal aesthetic like Copilot
    - Complete UI redesign: monospace dark theme, scrolling beat stream (left), fixed status panel (right), command line (bottom)
    - Each stream line shows: bar address · voice indicators (♦ melodic ◆ twinkle ● bass) · note names
    - Commands: `start`, `stop`, `mute`, `unmute`, `offset <n>`, `sync`, `help`
    - Status panel shows key + change countdown, meter + BPM, dynamics, performer guidance, planets, location
    - All meters and instructions designed for analog/human performance interpretation

14. User asked for per-instrument dynamics
    - Identified that build succeeded but implementation of per-voice dynamics was cut short
    - Started adding `VoiceDynamic` interface to StatusData (label, level, driver)
    - Work interrupted mid-way through adding dynamics calculations

15. User asked to allow instruments to play beyond triad notes
    - Modified `ChromaticWall.tick()` signature to accept optional `notePool: IntervalNote[]`
    - Allows full scale, pentatonic, chromatic, or any custom note set instead of just current interval's triad
    - Work interrupted before updating app.ts to build and pass note pools

16. User asked for interactive 2D map to visualize and change location
    - Work not yet started
    - Requested: small 2D map in status panel showing current location as dot, clickable for location selection, "current location" button to reset
</history>

<work_done>
Files modified:
- `public-library/machines/forever-song/src/app.ts` — Refactored to emit FireEvent + StatusData, added per-voice interfaces, started per-instrument dynamics (incomplete)
- `public-library/machines/forever-song/src/index.html` — Complete rewrite as CLI terminal with stream, panel, command interface, VOICES config for extensibility
- `public-library/packages/amplib-sound-synthesis/src/ChromaticWall.ts` — Added `notePool` optional parameter to `tick()` method, added IntervalNote import

Work completed in this session:
- [x] More character added: rhythmic groove (16-step accents), daily melodic arc (diurnal stepFactor), night/day envelopes, FM sweeps (Mars/Saturn), Venus-Earth resonance driving
- [x] Time signature variation: 5 meters (4/4, 3/4, 6/8, 5/4, 7/8) cycled by Venus synodic clock (~117 days per meter)
- [x] Bass voice: dedicated FM synth, fires on strong beats, warm lowpass, dynamic releases
- [x] CLI terminal UI: monospace aesthetic, scrolling beat stream, fixed status panel, command interface
- [x] Performer guidance: all meters described in human-readable terms (ppp–fff, legato–marcato, vibrato ranges, timbre descriptors)
- [x] Extensible voice architecture: VOICES config in HTML, FireEvent interface allows easy addition of new instruments

Work in progress:
- [ ] Per-instrument dynamics — StatusData now has VoiceDynamic for main/twinkle/bass, but calculations not completed
- [ ] Note pool expansion — ChromaticWall accepts notePool parameter, but app.ts doesn't yet build/pass pools based on Venus-Earth resonance
- [ ] Per-voice volume control — ChromaticWall synths need independent gain multipliers (not yet added)
- [ ] Interactive 2D map — not yet started

Current state:
- Build succeeds (42.31 kB)
- All features from previous work intact: seeded RNG, phase-locked beats, time sig switching, cosmos caching, etc.
- UI is fully functional with commands, but dynamics display incomplete and map missing
- Ready to continue with per-voice dynamics + note pool + map features
</work_done>

<technical_details>
**Astronomical signal mapping (universal):**
- Moon phase (0–1) × 12 → root (C–B)
- Lunar clock (0–1) × 7 → mode (Lydian–Locrian)
- Annual clock (0–1) × 40 + 60 → BPM (60–100)
- Jupiter-Saturn resonance (0–1) × 0.35 + diurnal × 0.65 → stepFactor (daily melodic sweep with long-term color shifts)
- Venus synodic clock (0–1) × 5 → time signature era (each ~117 days)
- Mars synodic clock (0–1) × 24 + 4 → main FM frequency (4–28 Hz, 780-day sweep)
- Saturn synodic clock (0–1) × 14 + 8 → twinkle FM frequency (8–22 Hz, 378-day sweep)

**Regional modulation (location-dependent):**
- Sun elevation → brightness (0–1, rescaled from –18° to +90°)
- Brightness → main note density, envelope release, lowpass filter, dynamics label
- Jupiter altitude (degrees above horizon) / 90 → main FM depth (0.4–3.0 range)
- Venus altitude → twinkle FM depth (0.5–2.5 range)
- Venus retrograde → timbre hint ("bend downward")
- Visible planet count (0–7) / 7 → richness multiplier (+0.6 to FM depth)

**Seeded RNG implementation:**
- `withSeededRandom(seed, fn)` temporarily replaces `Math.random` with xorshift32
- Seed initialization: `s = (seed ^ 0xdeadbeef) >>> 0 || 1`
- All tabs at same `wallBeatIndex` produce identical note sequences
- Used twice per tick: once for main/twinkle (seed=wallBeatIndex), once for bass (seed=wallBeatIndex+1000000)

**Phase-locked beat grid:**
- `beatIntervalMs = (60 / bpm) * (4 / subdivision) * 1000`
- `wallBeatIndex = Math.floor(Date.now() / beatIntervalMs)` — shared across all tabs regardless of start time
- Used to anchor bar phase: `barPhase = wallBeatIndex % timeSig.steps`
- Critical for sync lights and cross-tab determinism

**Time signatures architecture:**
- Each entry has `.steps` (bar length in 16ths), `.mainWeights` (inverted chance multipliers), `.bassProbs` (direct fire probability)
- Selection purely deterministic: `timeSigIdx = Math.floor(venusSynodicClock * 5) % 5`
- Weights < 1 = accent (more notes), weights > 1 = suppress
- Bass probs are direct (0–0.9); positioned at quarter-note beat positions, 0 elsewhere

**Note selection logic:**
- Currently: `scale.intervals[step].notes` (triad notes from current interval)
- New optional path: `notePool` parameter allows full scale, pentatonic, chromatic, or custom set
- Venus-Earth resonance (0–1) planned to blend: 0 = triad only, 1 = all 7 scale intervals combined

**ChromaticWall API gotchas:**
- `mainChance` / `twinkleChance` are inverted thresholds: `Math.random() > threshold` fires (higher threshold = fewer notes)
- `synthMain.modulationDepth` and `synthTwinkle.modulationFrequency` are directly mutable properties (not getters)
- `tick()` returns `{ main: boolean, twinkle: boolean }` — now will include `{ bass: boolean, note: string, bar, step, totalSteps }`
- Envelope modifiers (attack, release, volume) are multipliers applied to base envelope

**UI architecture:**
- VOICES config array in index.html allows extensible instrument support; adding new voice = 1 entry in array + 1 key in FireEvent
- `renderFireLine(ev)` loops over VOICES to build colored character per position
- Per-voice dynamics planned as separate bars in panel (main bar, twinkle bar, bass bar)
- Stream auto-scrolls and caps at 300 lines to prevent memory bloat

**CSS and build quirks:**
- Parcel's CSS parser had issues with malformed selectors (e.g., missing `{` opener); fixed by using inline `el.style` manipulation instead of CSS classes for flashing lights
- Monospace font cascade: "Cascadia Code" → "Fira Code" → "JetBrains Mono" → "Menlo"
- Slider styling requires `-webkit-appearance: none` override for cross-browser consistency

**Unresolved/incomplete:**
- Per-instrument dynamics: VoiceDynamic interface created but calculations for main/twinkle/bass drivers not yet implemented
- Note pool expansion: parameter added to ChromaticWall but app.ts doesn't yet build pools based on astro signals
- Per-voice volume in ChromaticWall: no independent gain multiplier yet; both synths share single volume param
- Map rendering: not yet designed or implemented
- Location update handler: no callback wired when user clicks on map
</technical_details>

<important_files>
- `public-library/machines/forever-song/src/app.ts`
  - Central music engine; all cosmos→audio wiring lives here
  - Exports `init(onFire, onStatus, timeOffset)` which runs the Clock beat loop
  - Key functions: `buildStatus()` (creates StatusData), `triggerBass()` (sawtooth FM), `withSeededRandom()` (xorshift32 PRNG)
  - Contains all signal mappings (moon→key, sun→brightness, etc.) and time signature logic
  - Lines ~350; recently refactored to emit FireEvent + StatusData interfaces
  - Status: per-instrument dynamics implementation incomplete; note pool building not yet started

- `public-library/machines/forever-song/src/index.html`
  - Complete CLI terminal UI; primary user-facing interface
  - VOICES config array (~4 entries) for extensible instrument support
  - `runCommand()` handler for `start`, `stop`, `mute`, `offset`, `sync`, `help`
  - `renderFireLine(ev)` creates scrolling beat stream with colored voice indicators
  - `renderStatus(s)` updates all meters in right panel
  - Status panel includes: key section, meter/BPM, dynamics (currently missing per-voice bars), guidance, planets, location
  - No map implementation yet; planned for right panel below planets
  - Lines ~600; recently completely rewritten from buttons/sliders to terminal aesthetic

- `public-library/packages/amplib-sound-synthesis/src/ChromaticWall.ts`
  - FM synth voice engine for main and twinkle voices
  - Modified in this session: added `notePool?: IntervalNote[]` parameter to `tick()`
  - Key quirk: `mainChance`/`twinkleChance` are inverted thresholds (higher = fewer notes)
  - `triggerNote()` creates carrier + modulator oscillators, applies envelope, stereo panning
  - Status: notePool parameter added but not yet fully integrated; per-voice volume control not yet added

- `public-library/packages/amplib-cosmos/src/generate.ts`, `generateSignals.ts`, `generatePlanets.ts`
  - Orbital mechanics engine; returns all astronomical data
  - Key signals used: `diurnalClock`, `lunarClock`, `annualClock`, `marsSynodicClock`, `saturnSynodicClock`, `venusSynodicClock`, `jupiterSaturnResonance`, `venusEarthResonance`, `visiblePlanetCount`
  - Key planet properties used: `.altitude`, `.isRetrograde`, `.isVisible`
  - Cached in `cachedCosmos`; refreshed every 3s to avoid hammering orbital math
  - Critical for both universal composition rules and regional texture modulation
</important_files>

<next_steps>
Remaining work:
1. **Per-instrument dynamics** — Complete the VoiceDynamic calculations
   - Main: brightness-driven (ppp at night → fff by day)
   - Twinkle: Venus altitude-driven (silent when below horizon → strong when high)
   - Bass: Jupiter altitude-driven
   - Each should have `.label` (e.g. "pp"), `.level` (0–1 for display), `.driver` (e.g. "sun · day")

2. **Note pool expansion** — Build note pools based on Venus-Earth resonance
   - At resonance 0: use triad (current behavior)
   - At resonance 1: use all 7 scale intervals (full scale)
   - Blend between: linearly interpolate pool size or stochastically select notes
   - Pass `notePool` to `wall.tick()`

3. **Per-voice volume in ChromaticWall** — Add independent gain multipliers
   - Modify `synthMain` and `synthTwinkle` to have `.volume` property (or add to envelope)
   - Update `triggerNote()` to apply voice-specific volume scaling

4. **HTML panel updates** — Add per-voice dynamics display
   - Three separate bars below "dynamics" section: one for main, twinkle, bass
   - Each shows label (pp/mf/fff) + color-coded bar + driver description
   - Remove current single "dynamics" field

5. **Interactive 2D map** — Add clickable world map to panel
   - Small SVG/canvas (150×100px) showing world map outline
   - Current location as dot (lat/lon projected to 2D)
   - Click to select new location; update cosmos + StatusData
   - "Current location" button to reset to browser geolocation
   - Display current lat/lon coords below map

Immediate next steps:
1. Finish `buildStatus()` implementation: add per-voice dynamics calculations
2. Update HTML panel CSS/structure for per-voice dynamics bars
3. Build note pool expansion logic in app.ts beat callback
4. Add SVG map to HTML panel with click handler
5. Wire location update to `setTimeOffset()` pattern (regenerate cosmos immediately)
6. Test cross-voice dynamics variation and note pool switching

Blockers/questions:
- Should per-voice volume affect note selection (e.g., bass only plays when Jupiter high enough)? Or only output level?
- For note pool blending: interpolate pool size continuously, or snap to discrete pool at thresholds?
- Map projection: Mercator (standard), or Equirectangular (simpler)? Given performance constraints, Equirectangular is safer.
</next_steps>