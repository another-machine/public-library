<overview>
The user wants to redesign `@amplib/cosmos`, a TypeScript astronomical data library in a monorepo (`another-machine/public-library`), from an aspirational but inaccurate prototype into a **rich, accurate, normalized signal source** for deterministic music generation and visualization. The library's core design (everything returns `{ value, unitRange: 0-1, bipolarRange: -1 to 1, description }`) is correct and should be preserved; the problems are fake planet positions and insufficient generative signal coverage. The approach is three-phased: (1) fix planet position accuracy using proper Keplerian orbital mechanics, (2) enrich moon data and expose hidden calculations, (3) add new `relationships` and `signals` sections purpose-built for generative use.
</overview>

<history>
1. User pointed to `@amplib/cosmos` and asked to revisit it with better models to "hone in on and then execute a cool idea"
   - Read all source files: `generate.ts`, `generateEarth.ts`, `generateMoon.ts`, `generateObserver.ts`, `generatePlanets.ts`, `generateSun.ts`, `utilities.ts`, `constants.ts`
   - Key finding: planet positions are fake — altitude/azimuth is just sun position + an offset, `heliocentricDist` is a hardcoded constant, not computed
   - Several already-calculated values (`getLunarLibration`, `getTopocentricMoonPosition`, `getLunarPhaseEvents`) are never exposed in output
   - Asked user which direction excited them most

2. User said "accuracy and generative — an awesome procedural data engine for deterministic music generation and visualization"
   - Created a detailed plan in `/Users/jake/.copilot/session-state/5808604f-0ac7-4c1b-8e1a-fe812de008c3/plan.md`
   - Loaded todos into SQL database with dependency tracking
   - Plan has three phases: accuracy (planet positions), richness (expose hidden data + elongations/orbital clocks), signals layer (generative-first outputs)

3. User said "get going" — implementation began
   - Consulted rubber-duck agent before writing code
   - **Blocking issues caught by rubber duck:**
     - Schlyter's orbital elements epoch is 1999-12-31 00:00 UTC (JD 2451543.5), NOT J2000.0 (JD 2451545.0) — 1.5 day difference causes ~6° error for Mercury
     - Need perturbation corrections for Jupiter/Saturn/Uranus for < 1° accuracy
     - Need 3D vector elongation, not longitude-only
     - Rename `synodicPhase` → `synodicClock` to be clear it's a synthetic LFO
   - Began writing the new files
</history>

<work_done>
Files created:
- `src/generateCoordinates.ts` — NEW: core coordinate pipeline with Schlyter orbital elements, Kepler solver, perturbation corrections for Jupiter/Saturn/Uranus, full heliocentric→geocentric→equatorial→horizontal transform. Exports `computeAllPlanetPositions()`, `angularSeparation()`, `SIDEREAL_PERIODS_DAYS`, `SYNODIC_PERIODS_DAYS`, `GeocentricPosition`, `AllPlanetPositions`.
- `src/generateRelationships.ts` — NEW: computes Moon-Sun phase angle (0-360°) and planet-pair angular separations (Jupiter-Saturn, Venus-Jupiter, Mars-Saturn, Mercury-Venus, Mars-Jupiter).
- `src/generateSignals.ts` — NEW: generative signal layer with orbital clocks (diurnal, lunar, annual, per-planet synodic), resonance proximity signals (Jupiter-Saturn 5:2, Venus-Earth 8:13), visible planet count, planetary spread.

Files modified:
- `src/generatePlanets.ts` — REWRITTEN: now `formatPlanetPositions()` takes pre-computed `AllPlanetPositions` from coordinate engine; adds `orbitalPhase`, `synodicClock`, `elongation`, `isRetrograde` (placeholder), proper `geocentric` and `equatorial` sub-objects, real magnitude/angular diameter calculations.
- `src/generateMoon.ts` — UPDATED: `generateMoon()` now exposes `libration.longitude`, `libration.latitude` (calling existing `getLunarLibration()`), and all four phase events (`nextNewMoon`, `nextFirstQuarter`, `nextFullMoon`, `nextLastQuarter`) using existing `getLunarPhaseEvents()`.

Files NOT yet updated (still needed):
- `src/generate.ts` — needs to call `computeAllPlanetPositions()`, detect retrograde, call `generateRelationships()` and `generateSignals()`, and wire everything together
- `src/index.ts` — may need export updates

Work completed:
- [x] `coordinate-pipeline` todo: Create generateCoordinates.ts
- [x] `moon-richness` todo: Expose hidden moon data
- [ ] `planet-accuracy` todo: In progress — generatePlanets.ts rewritten but generate.ts not yet updated to use new pipeline
- [ ] `relationships-section` todo: generateRelationships.ts written but not wired into generate.ts
- [ ] `signals-section` todo: generateSignals.ts written but not wired into generate.ts
- [ ] Build/compile verification not yet run
</work_done>

<technical_details>
**Schlyter epoch is critical:** Paul Schlyter's orbital elements use epoch `d = 0` = 1999-12-31 00:00 UTC (JD 2451543.5), NOT the standard J2000.0 (JD 2451545.0). The existing `J2000_EPOCH` constant in the codebase is JD 2451545.0. The new code defines `SCHLYTER_EPOCH_MS = Date.UTC(1999, 11, 31, 0, 0, 0, 0)` (note: month is 0-indexed, so 11 = December). This 1.5-day difference causes ~6° error for Mercury if wrong.

**Coordinate pipeline flow:**
1. Mean anomaly M from elements → solve Kepler's equation → eccentric anomaly E → true anomaly v + distance r (heliocentric)
2. Apply rotation matrix (N, i, v+w angles) → heliocentric ecliptic rectangular (x,y,z)
3. Compute for Earth too; subtract Earth's position → geocentric ecliptic rectangular
4. Convert geocentric ecliptic (lon, lat) → apply perturbation corrections (Jupiter/Saturn/Uranus)
5. Recompute Cartesian from corrected spherical → apply obliquity rotation → equatorial (RA, Dec)
6. Convert RA/Dec + local sidereal time + observer lat → horizontal (alt, az)

**LST calculation:** `LST_degrees = getSiderealTime(timestamp) * 15 + observerLon` where `getSiderealTime()` returns GMST in hours (already in existing `utilities.ts`). This is correct: multiply by 15 to get degrees, add longitude directly in degrees.

**Perturbation corrections:** Applied to geocentric ecliptic longitude/latitude AFTER converting from heliocentric. For Jupiter: ~0.33° peak term; for Saturn: ~0.81° peak term; for Uranus: ~0.04° peak term. Without these, Jupiter/Saturn accuracy is ~1-2°.

**Elongation uses 3D vectors:** `dot(normalize(geocentric_planet), normalize(-earth_helio))` → `acos()` → degrees. This handles ecliptic latitude correctly, unlike a simple longitude difference.

**Retrograde detection:** The `isRetrograde` field is currently a placeholder `false` in `generatePlanets.ts`. It needs to be computed in `generate.ts` by calling `computeAllPlanetPositions()` twice (current timestamp and +1 day) and checking if geocentric longitude is decreasing. The `retrogradeSet: Set<string>` parameter is already wired into `formatPlanetPositions()`.

**Resonance proximity formula:** `(1 + cos(p*angle1 - q*angle2)) / 2` where angles are `2π * d / period`. Peaks at 1 when the resonance condition is met, oscillates smoothly between 0 and 1.

**Architecture change in generate.ts:** The old `generatePlanets()` computed positions internally. The new architecture separates concerns: `generate.ts` calls `computeAllPlanetPositions()` once, passes results to `formatPlanetPositions()`, `generateRelationships()`, and `generateSignals()`. This avoids triple-computing planet positions.

**Dead code cleanup:** A `vw` variable was left as dead code in `generateCoordinates.ts` computeHeliocentricPos — was cleaned up by replacing with single `sum` variable.

**Moon data that was already computed but not exposed:** `getLunarLibration()` and `getLunarPhaseEvents()` were both already fully implemented in `generateMoon.ts` — they just weren't called from `generateMoon()`. Now they are.

**Uncertain area:** The Schlyter perturbation correction terms were written from memory and should be validated against the source (http://www.stjarnhimlen.se/comp/ppcomp.html) or against JPL Horizons for known dates like Mars opposition 2020-10-13, Jupiter opposition 2023-11-03.
</technical_details>

<important_files>
- `src/generateCoordinates.ts`
  - Core of the whole redesign — the accurate orbital mechanics engine
  - NEW file; exports `computeAllPlanetPositions()` as the main entry point
  - Key sections: `ELEMENTS` dict (lines ~38-100), `solveKepler()` (~115-130), `computeHeliocentricPos()` (~132-165), `computePerturbations()` (~167-210), `computeAllPlanetPositions()` (~240-310), `angularSeparation()` (~330-350)

- `src/generatePlanets.ts`
  - REWRITTEN — now a formatter, not a calculator
  - Takes `AllPlanetPositions` from coordinate engine; exposes `elongation`, `orbitalPhase`, `synodicClock`, `isRetrograde`, proper `geocentric` and `equatorial` sub-objects
  - Key: `formatPlanetPositions(allPositions, timestamp, sunAltitude, retrogradeSet)` signature

- `src/generate.ts`
  - NOT YET UPDATED — this is the immediate next task
  - Needs to: import `computeAllPlanetPositions`, detect retrograde (two calls with Δt=1 day), call `formatPlanetPositions`, `generateRelationships`, `generateSignals`, wire the `moonGeoLon` from moon calculation into `generateRelationships`

- `src/generateMoon.ts`
  - Updated to expose libration and all 4 lunar phase events
  - Key change: `generateMoon()` return now includes `libration: { longitude, latitude }` and `nextFirstQuarter`, `nextLastQuarter` (alongside existing `nextFullMoon`, `nextNewMoon`)

- `src/generateRelationships.ts`
  - NEW file — planet-pair angular separations and Moon-Sun phase angle
  - `generateRelationships(allPositions, moonGeoLon)` — needs moonGeoLon passed from moon calculation

- `src/generateSignals.ts`
  - NEW file — generative signal layer (clocks, resonances, composites)
  - `generateSignals(allPositions, timestamp)`

- `/Users/jake/.copilot/session-state/5808604f-0ac7-4c1b-8e1a-fe812de008c3/plan.md`
  - Full design plan with rationale, output shape, implementation order
</important_files>

<next_steps>
Remaining work:
- [ ] Update `src/generate.ts` — the most critical remaining step:
  1. Import `computeAllPlanetPositions` from `generateCoordinates`
  2. Import `formatPlanetPositions` from `generatePlanets`
  3. Import `generateRelationships` from `generateRelationships`
  4. Import `generateSignals` from `generateSignals`
  5. Compute planet positions once: `const allPositions = computeAllPlanetPositions(timestamp, latitude, longitude)`
  6. Detect retrograde: compute positions at `timestamp + MILLISECONDS_PER_DAY`, compare geocentric longitudes, build `retrogradeSet: Set<string>`
  7. Get sun altitude from `generateSun` result or compute inline for visibility check
  8. Get moon geocentric ecliptic longitude for `generateRelationships` — need to either expose it from `generateMoon` or compute it separately (the moon's geocentric ecliptic lon is computed inside `getMoonPosition()` which is private)
  9. Wire: `planets: formatPlanetPositions(allPositions, timestamp, sunAlt, retrogradeSet)`, add `relationships` and `signals` keys

- [ ] Expose moon geocentric longitude for relationships: either refactor `getMoonPosition()` to be exported from `generateMoon.ts`, or compute sun direction differently (the sun's geocentric longitude can be derived purely from Earth's heliocentric position in `allPositions`)

- [ ] Update `src/index.ts` — check if new types need to be exported

- [ ] Run `npm run build` in the package and fix any TypeScript errors

- [ ] Validate planet positions against known data (e.g., JPL Horizons) for a few test dates to confirm the orbital mechanics are correct

Immediate next actions:
1. Open `generate.ts` and rewrite it with the new architecture
2. Decide how to get `moonGeoLon` for `generateRelationships` — simplest is to compute the Sun's geocentric ecliptic longitude from `allPositions.sunDirX/Y/Z` (already available) and use that for the Moon-Sun phase angle without needing the moon's ecliptic coordinates directly (use moon phase value from `generateMoon` output instead)
3. Run build and fix errors
</next_steps>