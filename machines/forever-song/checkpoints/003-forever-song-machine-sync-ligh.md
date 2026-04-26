<overview>
The user wanted to build `forever-song` — an infinite procedurally-generated web music machine where geographic location changes the texture of the music while the underlying composition (notes, scale, tempo) remains universal. This was built on top of `@amplib/cosmos`, a previously-rebuilt accurate astronomical data library. The approach: cosmos orbital signals → universal composition layer; sun/planet altitudes from observer's location → regional texture layer; ChromaticWall FM synth + Clock for audio output.
</overview>

<history>
1. **User asked to build the forever-song machine** (resuming from prior checkpoint where cosmos was fixed)
   - Checked observer output structure, Clock API, ChromaticWall constructor/tick API
   - Created `src/app.ts` with full music engine: geolocation → cosmos → ChromaticWall + Clock
   - Updated `src/index.html` with minimal dark UI, listen button, status display
   - Build succeeded: 36.58 kB

2. **User asked to make location configurable via URL**
   - Added `?lat=40.71&lon=-74.00` URL param parsing in `app.ts` `init()`
   - URL params bypass geolocation; fallback to browser geolocation if absent
   - Button says "starting…" vs "locating…" based on whether URL has params
   - Build succeeded

3. **User asked about determinism** (question, no code change)
   - Explained: composition rules (key, mode, BPM, scale interval) are fully deterministic from orbital math. Note *events* within those rules use `Math.random()` — stochastic within deterministic constraints.

4. **User asked what changes based on location** (question, no code change)
   - Explained: sun elevation → note density + filter; Jupiter altitude → FM modulation depth; Venus altitude → twinkle character; sidereal time → subtle highpass shimmer

5. **User asked "so they should be playing the same notes?"** — exposed a design gap
   - Identified: two tabs in same city had same harmonic space but independent `Math.random()` calls = different note sequences
   - Fixed: added `withSeededRandom(wallBeatIndex, ...)` using xorshift32 PRNG that temporarily replaces `Math.random` during `tick()`
   - Also fixed beat phase: replaced `beatIndex` (local to each Clock) with `wallBeatIndex = Math.floor(Date.now() / beatIntervalMs)` — anchored to Unix epoch so all tabs are phase-locked regardless of when they start
   - Build succeeded

6. **User asked for visual sync lights**
   - Modified `ChromaticWall.tick()` to return `{ main: boolean, twinkle: boolean }`
   - Added `onFire` callback parameter to `init()`
   - Added two dot indicators (`#light-main`, `#light-twinkle`) to HTML
   - Flash via inline style + setTimeout (CSS class approach caused Parcel CSS parser error due to missing `#mute-btn {` opener — edit collision removed the opening selector)
   - Debugged CSS build failure via Python binary search, found malformed CSS, fixed it
   - Build succeeded: 38.2 kB

7. **User said notes not firing often enough**
   - Changed `subdivision: 8 → 16` (tick rate 2.4/s → 4.9/s)
   - Changed mainChance formula: `0.85 - b*0.75` → `max(0.05, 0.5 - b*0.4)` (fires 50–95% of ticks)
   - Changed twinkleChance formula: `0.1 + b*0.8` → `0.15 + b*0.6` (fires 25–85% of ticks)
   - At mid-brightness (4pm): main 1.2/s → 3.4/s; twinkle 1.3/s → 2.8/s
   - Build succeeded

8. **User asked for a sync button** — IN PROGRESS when compaction occurred
   - Request: button that syncs to nearest 5-second interval; click in both tabs and they fire at the same next moment; use rAF for accuracy
   - Was about to implement when compaction occurred
</history>

<work_done>
Files created:
- `public-library/machines/forever-song/src/app.ts` — full music engine

Files modified:
- `public-library/machines/forever-song/src/index.html` — UI with lights, mute button, status
- `public-library/packages/amplib-sound-synthesis/src/ChromaticWall.ts` — `tick()` now returns `{ main: boolean, twinkle: boolean }`

Work completed:
- [x] `forever-song` machine built and working
- [x] URL location params (`?lat=&lon=`)
- [x] Seeded RNG for universal note sequence (xorshift32, seed=wallBeatIndex)
- [x] Phase-locked beat grid (wallBeatIndex from Date.now())
- [x] Visual flash indicators for main/twinkle synth
- [x] Mute button
- [x] Increased firing rate (subdivision 16, tighter chance ranges)
- [ ] **Sync button** — requested but not yet implemented

Current build: ✨ 38.2 kB, clean.
</work_done>

<technical_details>
**Universal vs Regional split:**
- Universal (same everywhere): `moon.phase.value * 12` → root; `signals.lunarClock.value * 7` → mode; `signals.annualClock.value * 40 + 60` → BPM; `signals.jupiterSaturnResonance.value` → stepFactor
- Regional: `sun.elevation` → brightness → lowpass + note density; `planets.jupiter.altitude` → FM depth; `planets.venus.altitude` → twinkle depth; `observer.siderealTime.unitRange` → highpass shimmer

**Seeded RNG for universal notes:**
- `withSeededRandom(wallBeatIndex, fn)` temporarily replaces `Math.random` with xorshift32 seeded by `wallBeatIndex`
- Seed init: `let s = (seed ^ 0xdeadbeef) >>> 0 || 1`
- Restores original `Math.random` after `fn()` runs
- Browser is single-threaded so this is safe

**Phase-locked beat grid:**
- `wallBeatIndex = Math.floor(Date.now() / beatIntervalMs)` where `beatIntervalMs = (60 / bpm) * (4 / clock.subdivision) * 1000`
- Any tab started at any moment computes the same `wallBeatIndex` at the same wall-clock time
- Used for: cosmos refresh gating (`% 8`), BPM update gating (`% 64`), UI update gating (`% 8`)

**ChromaticWall API gotchas:**
- `mainChance`/`twinkleChance` are inverted: higher value = LESS likely to play (`Math.random() > this.mainChance`)
- `tick()` now returns `{ main: boolean, twinkle: boolean }` (modified)
- `synthMain.modulationDepth` and `synthTwinkle.modulationDepth` are directly mutable properties
- Filter mapping: `lowpassFactor * 12000 + 100` Hz (0→100Hz, 1→12100Hz)

**Sun elevation brightness mapping:**
- `brightness = clamp((elevation + 18) / 108, 0, 1)` — 0 at astronomical twilight (-18°), 1 at zenith (+90°)

**Cosmos output keys actually used:**
- `c.moon.phase.value` (0–1), `c.moon.phaseDescription.value` (string)
- `c.signals.{annualClock, lunarClock, jupiterSaturnResonance}.value`
- `c.sun.elevation.value` (degrees)
- `c.planets.jupiter.altitude.value`, `c.planets.venus.altitude.value` (degrees)
- `c.observer.siderealTime.unitRange` (0–1)

**Cosmos generate() performance:**
- Calls `computeAllPlanetPositions` 3× per call (retrograde detection: ±12h)
- Cached in `cachedCosmos`, refreshed every 3000ms to avoid hammering

**Parcel CSS parser quirk:**
- Chained class selectors like `.light.flash-main  {` (with extra spaces) caused "Invalid token in pseudo element: WhiteSpace" error
- Edit collision earlier had removed the `#mute-btn {` opening selector, causing dangling CSS properties that confused the parser
- Fix: use inline `el.style.background` manipulation instead of CSS classes for flash effect

**Monorepo import pattern:**
- Machines import packages via relative paths: `../../../packages/amplib-X/src/index`
- Parcel compiles TypeScript from source — no npm install needed for local packages

**Clock subdivision:**
- `baseIntervalMs = (60 / bpm) * (4 / subdivision) * 1000`
- subdivision=16, BPM=73: ~205ms per tick = ~4.9 ticks/sec
- `clock.subdivision` is a public property

**Sync button plan (pending):**
- User wants: click button in both tabs → both restart clock at next 5-second boundary
- Use rAF loop (accurate ~1ms) not setTimeout (~4ms drift)
- Show live countdown on button: `↺ 3.2s` updating via rAF
- On click: stop clock, arm for `Math.ceil(Date.now() / 5000) * 5000`, restart via rAF polling
</technical_details>

<important_files>
- `public-library/machines/forever-song/src/app.ts`
  - Main music engine — all cosmos→audio wiring lives here
  - Key sections: `withSeededRandom()` (~line 11), `brightnessToMainChance/TwinkleChance()` (~line 45), `init()` function (~line 90), beat callback (~line 140)
  - Returns `{ wall, clock }` from `init(onFire)` — `onFire` callback receives `{ main, twinkle }` booleans each tick

- `public-library/machines/forever-song/src/index.html`
  - UI: dark minimal, listen button, two flash dots, status rows, mute button
  - Script wires `init()` callback to flash lights via `el.style.background` + setTimeout
  - Sync button needs to be added here (pending)

- `public-library/packages/amplib-sound-synthesis/src/ChromaticWall.ts`
  - Modified `tick()` to return `{ main: boolean, twinkle: boolean }`
  - `mainChance`/`twinkleChance` are inverted probability thresholds
  - `synthMain`/`synthTwinkle` have mutable `modulationDepth` and `modulationFrequency`

- `public-library/packages/amplib-cosmos/src/generateCoordinates.ts`
  - Core orbital mechanics (Schlyter elements, Kepler solver, perturbations)
  - Schlyter epoch: `Date.UTC(1999, 11, 31, 0, 0, 0, 0)` (month=11=December)
  - Sign convention: `sunGeo = helio["earth"]` is Sun's geocentric vector; planet geocentric = `planet + sunGeo` (addition)

- `public-library/packages/amplib-cosmos/src/generate.ts`
  - Main entry point; exports `generate({ latitude, longitude, timestamp })`
  - Returns: `observer`, `earth`, `moon`, `sun`, `planets`, `relationships`, `signals`
</important_files>

<next_steps>
Remaining work:
- [ ] **Sync button** — the user's most recent request, not yet implemented

Planned implementation for sync button:
1. Add `#sync-btn` to `index.html` status area (appears after start, alongside mute button)
2. CSS: similar minimal style to mute button
3. JS in index.html script block:
   - rAF loop runs continuously updating button text with `↺ X.Xs` countdown to next 5s boundary: `Math.ceil(Date.now() / 5000) * 5000`
   - On click: call `clock.stop()`, set `syncArmed = true` with `syncTarget = Math.ceil(Date.now() / 5000) * 5000`
   - rAF loop checks: if armed and `Date.now() >= syncTarget`, call `clock.start()` and disarm
   - Button shows `● X.Xs` when armed (different color), returns to `↺ X.Xs` after firing
4. `clock` must be accessible — already returned from `init()` as `{ wall, clock }`; just need to destructure it in the HTML script
</next_steps>