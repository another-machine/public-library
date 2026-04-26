<overview>
The user is building `@amplib/cosmos` (a TypeScript astronomical data library) into an accurate, generative-signal-rich engine for procedural music and visualization, and then wants to use it as the backbone for `forever-song` — an infinite procedurally-generated web music machine where geographic location changes the texture of the music while the underlying composition (notes, scale, tempo) remains universal. The approach is: fix orbital mechanics accuracy → expose hidden data → add generative signals → wire into a browser music machine using existing `@amplib/sound-synthesis` and `@amplib/music-theory` packages.
</overview>

<history>
1. **User asked to revisit `@amplib/cosmos` and find a cool direction to execute**
   - Read all source files; found planet positions were fake (altitude = sun + offset, hardcoded heliocentric distance)
   - Several values already computed (`getLunarLibration`, `getLunarPhaseEvents`, `getTopocentricMoonPosition`) were never exposed
   - User chose "accuracy and generative — a procedural data engine for deterministic music generation and visualization"

2. **Created a three-phase plan and got approval to begin**
   - Consulted rubber-duck agent before coding; caught critical issues:
     - Schlyter epoch is 1999-12-31 00:00 UTC (JD 2451543.5), NOT J2000.0 — 1.5 day difference causes ~6° Mercury error
     - Need perturbation corrections for Jupiter/Saturn/Uranus
     - Elongation must use 3D vectors, not longitude difference
   - Created `generateCoordinates.ts`, `generateRelationships.ts`, `generateSignals.ts`
   - Rewrote `generatePlanets.ts` as a formatter, updated `generateMoon.ts` to expose libration and phase events
   - Wired everything together in `generate.ts` with retrograde detection (±12h longitude comparison)

3. **Build succeeded but planet positions were wrong**
   - Ran validation: Saturn elongation showed 146.7° in April 2026 (should be ~27° — just past conjunction)
   - Discovered root cause: Schlyter's "earth" orbital elements compute the **Sun's geocentric position vector** (pointing Earth→Sun), NOT Earth's heliocentric position. This means the geocentric subtraction had the wrong sign throughout.
   - Verified with JS computation: Schlyter earth elements at epoch give ecliptic lon ~278.9° = Sun's geocentric lon ✓ (not 98.9° = Earth's heliocentric lon)

4. **Fixed the sign error; validated against known astronomical events**
   - Changed `gx = planet.x - earth.x` → `gx = planet.x + earth.x`
   - Changed `sunDirX = -earth.x / earthR` → `sunDirX = earth.x / earthR`
   - Changed exported `earthX: earth.x` → `earthX: -earth.x` (now stores Earth's true heliocentric position)
   - Fixed `generateRelationships.ts` to accept pre-computed phase angle (not geocentric longitude, which would double-subtract sun)
   - Validation results: Venus max elongation = **47.2° on 2025-01-10** ✓; Saturn opposition 2025-09-21 = **177.5°** + retrograde ✓; Jupiter opposition 2023-11-03 = **178.6°** + retrograde ✓

5. **User asked about building a geolocation-aware music maker using the cosmos library**
   - Explored the monorepo; found `forever-song` machine already exists as a stub with README: *"An infinite procedurally-generated song with universal composition and regional expression"*
   - Discovered the full tech stack: `@amplib/music-composition` (ProceduralMusicApp, seeded generation), `@amplib/sound-synthesis` (ChromaticWall FM synth + Clock), `@amplib/music-theory` (Scale, Mode)
   - Confirmed import pattern: machines use relative paths `../../../packages/amplib-X/src`
   - Ran live comparison across 4 cities: sun altitude, planet altitudes differ by location; orbital signals (diurnal clock) are identical everywhere — confirms the universal/regional split
   - Was about to check the observer output structure when the user went unavailable
</history>

<work_done>
Files created:
- `public-library/packages/amplib-cosmos/src/generateCoordinates.ts` — Core orbital mechanics engine (Schlyter elements, Kepler solver, perturbation corrections, full coordinate pipeline). Exports `computeAllPlanetPositions()`, `angularSeparation()`, `GeocentricPosition`, `AllPlanetPositions`, `SIDEREAL_PERIODS_DAYS`, `SYNODIC_PERIODS_DAYS`
- `public-library/packages/amplib-cosmos/src/generateRelationships.ts` — Moon-Sun phase angle + planet-pair angular separations (Jupiter-Saturn, Venus-Jupiter, Mars-Saturn, Mercury-Venus, Mars-Jupiter)
- `public-library/packages/amplib-cosmos/src/generateSignals.ts` — Generative signal layer: orbital clocks (diurnal/lunar/annual/per-planet synodic), resonance proximity (Jupiter-Saturn 5:2, Venus-Earth 8:13), visible planet count, planetary spread

Files modified:
- `public-library/packages/amplib-cosmos/src/generate.ts` — Rewritten to use `computeAllPlanetPositions()`, detect retrograde (±12h comparison), call all new generators, expose `relationships` and `signals` top-level keys
- `public-library/packages/amplib-cosmos/src/generatePlanets.ts` — Rewritten as formatter (`formatPlanetPositions()`), adds `elongation`, `orbitalPhase`, `synodicClock`, `isRetrograde`, `geocentric`, `equatorial`, `heliocentricPosition3D`
- `public-library/packages/amplib-cosmos/src/generateMoon.ts` — Now exposes `libration.longitude`, `libration.latitude`, `nextFirstQuarter`, `nextLastQuarter`

Work completed:
- [x] Accurate orbital mechanics via Schlyter elements
- [x] Perturbation corrections for Jupiter/Saturn/Uranus
- [x] Full heliocentric→geocentric ecliptic→equatorial→horizontal pipeline
- [x] Retrograde detection
- [x] Moon libration and all four phase events exposed
- [x] Relationships section (planet-pair aspects + moon-sun phase)
- [x] Signals section (clocks + resonances + generative values)
- [x] Build passes cleanly (`npm run build` in amplib-cosmos)
- [x] Validated against Venus max elongation, Saturn opposition, Jupiter opposition
- [ ] `forever-song` machine not yet built — was about to start
</work_done>

<technical_details>
**Critical sign convention for Schlyter's orbital elements:**
- Schlyter's "earth" entry (`ELEMENTS["earth"]`) computes the **Sun's geocentric position** (Earth→Sun vector), NOT Earth's heliocentric position. These differ by a sign flip.
- Correct geocentric planet = `planet_helio + sunGeo` (add, not subtract)
- `earthX` exported from `AllPlanetPositions` stores `-sunGeo.x` = Earth's true heliocentric position
- Sun direction unit vector = `sunGeo.x / earthR` (positive, not negative)
- `heliocentricPosition3D = gx + earthX` works because `(planet + sunGeo) + (-sunGeo) = planet` ✓

**Schlyter epoch:** `Date.UTC(1999, 11, 31, 0, 0, 0, 0)` = December 31, 1999 00:00 UTC. Note month is 0-indexed, so 11 = December. This is 1.5 days BEFORE J2000.0 — using the wrong epoch causes ~6° error for Mercury.

**Moon-Sun phase angle:** `moon.phase.value * 360` already gives the Moon-Sun elongation angle (0°=new, 180°=full). It should be passed directly to `generateRelationships` — do NOT subtract `sunLon` again (would double-count).

**ChromaticWall API (key gotcha):** `mainChance` and `twinkleChance` are inverted — `Math.random() > this.mainChance` triggers a note, so:
- `mainChance = 0.0` → always plays
- `mainChance = 1.0` → never plays
Mapping for day/night: `mainChance = 0.8 - brightness * 0.7` (night=0.8=sparse, day=0.1=dense)

**ChromaticWall `tick()` parameters:**
- `lowpassFactor` 0-1 → maps to `lowpassFactor * 12000 + 100` Hz (100–12100 Hz)
- `highpassFactor` 0-1 → same mapping
- `stepFactor` 0-1 → selects which interval in the Scale to play
- `mainEnvelopeModifier` / `twinkleEnvelopeModifier` → multipliers on attack/release/volume

**Monorepo import pattern:** Machines import packages via relative paths: `../../../packages/amplib-X/src` — NOT npm package names. Parcel handles the TS compilation.

**`observer` output keys:** `latitude`, `longitude`, `localTime`, `siderealTime` (note: `localSiderealTime` doesn't exist as a subfield — it's just `siderealTime`)

**Cosmos output split for music machine:**
- Universal (same everywhere): `moon.phase`, `signals.lunarClock`, `signals.annualClock`, `signals.jupiterSaturnResonance`, `signals.venusEarthResonance`, `relationships.moonSunPhaseAngle`
- Location-specific: `sun.elevation`, `planets.*.altitude`, `observer.siderealTime`

**Sun elevation for brightness mapping:** Use `-18°` (astronomical twilight) as the dark floor: `brightness = clamp((elevation + 18) / 108, 0, 1)` gives a smooth 0 (astronomical night) to 1 (solar noon).
</technical_details>

<important_files>
- `public-library/packages/amplib-cosmos/src/generateCoordinates.ts`
  - The heart of the redesign — all orbital mechanics live here
  - NEW file; key sections: `ELEMENTS` dict (lines ~38-103), `solveKepler()` (~118-128), `computeHeliocentricPos()` (~139-170), `computePerturbations()` (~177-219), `computeAllPlanetPositions()` (~322-421)
  - **Critical**: `sunGeo = helio["earth"]` is the Sun's geocentric direction; `gx = planet.x + sunGeo.x` (addition, not subtraction); `earthX: -sunGeo.x` exported

- `public-library/packages/amplib-cosmos/src/generate.ts`
  - Main entry point; wires all generators together
  - Imports `computeAllPlanetPositions`, `formatPlanetPositions`, `generateRelationships`, `generateSignals`, `generateSolarElevation`
  - Retrograde detection: ±12h comparison of geocentric longitudes with wraparound handling

- `public-library/packages/amplib-cosmos/src/generateRelationships.ts`
  - NEW file; accepts `moonSunPhaseAngleDeg` (pre-computed, `phase.value * 360`) — do NOT subtract sunLon again
  - Exports `Relationships` interface with `moonSunPhaseAngle` and `aspects`

- `public-library/packages/amplib-cosmos/src/generateSignals.ts`
  - NEW file; exports 12 signals: clocks, resonances, visiblePlanetCount, planetarySpread

- `public-library/packages/amplib-sound-synthesis/src/ChromaticWall.ts`
  - The FM synth used in the music machine — method is `tick()` not `step()`
  - `mainChance`/`twinkleChance` are inverted (higher = less likely to play)
  - `synthMain.modulationDepth` and `synthMain.modulationFrequency` are directly mutable properties

- `public-library/machines/forever-song/src/index.html`
  - The target machine to build — currently just a stub with commented-out import
  - Uses Parcel; build: `parcel build --public-url /forever-song/`

- `public-library/packages/amplib-music-theory/src/Scale.ts`
  - `new Scale({ root: "C", mode: "dorian" })` — root is Notation string, mode is ModeType
  - Valid modes: `"ionian"|"dorian"|"phrygian"|"lydian"|"mixolydian"|"aeolian"|"locrian"|"melodic"|"harmonic"|"major"|"minor"`
  - Valid roots: `"C"|"C#"|"D"|"D#"|"E"|"F"|"F#"|"G"|"G#"|"A"|"A#"|"B"` (plus flat alternates)
</important_files>

<next_steps>
Remaining work:
- [ ] Build the `forever-song` machine (the primary remaining task)
- [ ] Add dependency on cosmos/synthesis/theory packages in `forever-song/package.json` (via relative path or workspace — check if `npm install` is needed or if Parcel resolves from source directly)
- [ ] Create `public-library/machines/forever-song/src/app.ts` with the music engine
- [ ] Update `public-library/machines/forever-song/src/index.html` to import `./app.ts`

Planned architecture for `forever-song/src/app.ts`:
1. Request geolocation (`navigator.geolocation.getCurrentPosition`)
2. Start AudioContext on user gesture (browser requirement — need a start button)
3. Call `generate({ lat, lon, timestamp })` on every `Clock` tick
4. **Universal → composition**: `moon.phase.value * 12` → root note; `signals.lunarClock.value * 7` → mode; `signals.annualClock.value` → tempo (60-100 BPM); `signals.jupiterSaturnResonance.value` → `stepFactor`
5. **Regional → texture**: `sun.elevation` → brightness → `lowpassFactor` and inverted `mainChance`/`twinkleChance`; night → high `twinkleChance` (stars); `planets.jupiter.altitude` → `synthMain.modulationDepth`
6. Minimal UI: show current key/mode, sun elevation, moon phase, location

Known issue to watch:
- `observer.siderealTime` is the key (not `observer.localSiderealTime` which doesn't exist)
- ChromaticWall method is `tick()` not `step()`
- `mainChance` is inverted: 0.0 = always plays, 1.0 = never plays
</next_steps>