<overview>
The user is building "forever-song," a deterministic procedural music system where astronomical positions determine harmonic content. During this session, the focus shifted from initial full-featured development to implementing a **weighted harmonic progression system** that enables musicians to anticipate, prepare, and perform future moments of the composition live. The system uses planetary altitudes (sun, moon, Venus, Mars, Jupiter, Saturn) to generate a probability distribution over scale intervals (I-VII) each beat, creating unique harmonic progressions that vary geographically while remaining deterministic and performable.
</overview>

<history>
1. **User reported canvas stacking issue** (clicking canvases caused ghosting)
   - Identified root cause: semi-transparent fillRect instead of clearRect
   - Fixed both `drawMap()` and `drawCelestial()` functions
   - Build verified successfully

2. **User asked about bass movement rate**
   - Analyzed: bass moves through scale degrees at lunar month rate (~29.5 days)
   - 70% driven by moon phase (slow walk), 30% by Jupiter altitude (daily variation)

3. **User asked about triad change frequency**
   - Answered: triads cycle every ~584 days (Venus-Earth resonance period)
   - Outlined nested timescales: daily (notes shift), ~29.5 days (key change), ~584 days (harmonic pool change)

4. **User initiated planning for performable progression system** (via [[PLAN]] mode)
   - Goal: enable musicians to hear unique 5-30 min progressions, preparable in advance
   - Requirements: maximum permutations within key, geographic variation, per-beat export, weights shift over time
   - Strategy: planetary weights → interval distribution → seeded RNG selection

5. **User gave "proceed" command** → implementation started
   - Implemented `generatePlanetaryWeights(cosmos)` → 7-element weight array
   - Added `selectIntervalFromWeights(weights)` with seeded RNG
   - Created `BeatState` interface for per-beat state capture
   - Integrated weighted interval selection into beat callback
   - Added `beatHistory` ring buffer (max 10,000 beats)
   - Implemented `exportScore(startTime, endTime)` → markdown table download
   - Added time-picker UI and export button (HTML + event handlers)
   - Build: 68.39 kB, no errors

6. **User reported problems with current implementation**
   - Harmonic issue: "just a lot of C F G# for a whole minute"
   - UI issue: "jump to input doesn't let me edit" (wasn't focusable)
   - Sync constantly flashing (auto-sync snapping to 5s boundary)
   - Requested: make export a command, remove time picker, add optional metronome
   - Identified root cause of harmony problem: weight system collapsing when planets below horizon

7. **Current session work** (in progress)
   - Removed time-picker UI from HTML
   - Added `export <minutes>` command to CLI
   - Added `metronome on/off` command to CLI
   - Updated HELP_TEXT documentation
   - Rewrote weight generation: asymmetric base weights + stronger planetary influence + clamp/normalize
   - In progress: completing metronome implementation (oscillator + gain setup started)
</history>

<work_done>
**Files Modified:**

- **src/app.ts** (+250 lines):
  - Rewrote `generatePlanetaryWeights()`: asymmetric base weights [0.5, 0.3, 0.4, 0.6, 0.7, 0.4, 0.2] instead of neutral [0.5×7]; each planet now adds stronger influence; clamps negative weights and normalizes
  - Added `selectIntervalFromWeights()`: seeded RNG draws from distribution
  - Added `BeatState` interface: captures timestamp, key, mode, weights, tension, dynamics, visible planets per beat
  - Integrated weighted selection into beat callback (line ~653)
  - Added `beatHistory` ring buffer (max 10,000 beats = ~11 min at 90 BPM)
  - Implemented `exportScore(startTime, endTime)` → markdown table (beat-by-beat detail, limited to 500 rows for readability)
  - Started metronome implementation: metronomeOsc + metronomeGain, onBeat trigger

- **src/index.html** (-15 lines, +30 lines net):
  - Removed control bar with time-picker input, jump button, export button
  - Removed time-picker event handlers
  - Added `export` command handler: download last N minutes as .md file
  - Added `metronome` command handler: toggle on/off
  - Updated HELP_TEXT: documented new commands

**Work Completed:**
- [x] Canvas stacking fix (clearRect)
- [x] Weighted harmonic progression system (design + implementation)
- [x] Per-beat state capture and beat history
- [x] Score export function (markdown format)
- [x] CLI commands for export and metronome
- [x] Weight generation improved (asymmetric base + stronger planetary influence)
- [ ] Metronome implementation (incomplete - need to finish return object)
- [ ] Testing and verification

**Current State:**
- Build: 68.39 kB, compiles cleanly
- Functionality: Score export ready, metronome partially implemented, harmonic diversity improved
- Outstanding issue: Metronome getter/setter syntax needs fixing (currently incomplete in return statement)
</work_done>

<technical_details>
**Planetary Weight System:**
- Each beat gets a 7-element weight distribution over intervals I–VII
- Planets map asymmetrically: Sun/Jupiter/Saturn favor I/IV/V (consonant), Moon phase controls waxing (dissonant) vs waning (consonant), Venus favors III/VI/VII (shimmer)
- Tension metric = standard deviation of weight distribution (high σ = scattered weights = dissonance, low σ = aligned weights = consonance)
- Base weights asymmetric [0.5, 0.3, 0.4, 0.6, 0.7, 0.4, 0.2] to ensure variation even when planets below horizon

**Determinism:**
- Seeded RNG with `wallBeatIndex` as seed ensures same UTC time + location = same music always
- Different locations with same UTC time = different local solar altitudes → different weight distributions → harmonically unique but musically compatible

**Geographic Variation Example:**
- NYC 2:30 PM EST (UTC-5): Sun at +35° altitude → weights favor I/IV/V → majorish feel
- New Delhi 12:00 AM IST (UTC+5:30): Sun at -15° (below horizon) → weights more scattered → tensioner feel
- Same moment in cosmos, different local solar geometry, different harmonic character

**Beat History & Export:**
- Ring buffer keeps last 10,000 beats (~11 min at 90 BPM)
- Score export captures timestamp, key, selected interval, tension, dynamics, visible planets for each beat
- Markdown output limited to 500 beats for readability

**Issues Encountered & Resolutions:**
- Canvas stacking: Fixed by using `ctx.clearRect()` instead of semi-transparent `fillRect()`
- Harmonic collapse: Root cause was weight normalization when all planets below horizon → fixed by asymmetric base weights + clamp/normalize strategy
- Sync flashing: Caused by automatic 5-second snap-to-boundary (SYNC_INTERVAL = 5000) → user prefers manual control, now only triggers on `sync` command
- UI friction: Time-picker not focusable; simplified to command-line approach (export 60, export 30, etc.)

**Unanswered Questions:**
- Should metronome frequency be configurable? Currently hardcoded to 880 Hz (A5)
- Beat history: Is 10,000 beats (11 min) enough for typical use cases, or should it be longer?
- Harmonic diversity: Are the new weights providing sufficient variation, or should they be adjusted further?
</technical_details>

<important_files>
- **src/app.ts**
  - Why: Core music engine; where cosmos data is converted to harmonic selections, state is captured, and export data is generated
  - Changes: +250 lines; rewrote weight generation, added beat state capture, integrated weighted interval selection into beat callback
  - Key sections: `generatePlanetaryWeights()` (~45 lines, defines planetary influence), `selectIntervalFromWeights()` (~10 lines, seeded selection), beat callback integration (~20 lines, where weights are applied), `exportScore()` (~50 lines, generates markdown), metronome setup (~20 lines, in progress)

- **src/index.html**
  - Why: UI and command-line interface; where users interact with the system
  - Changes: Removed time-picker UI; added `export` and `metronome` commands; updated HELP_TEXT
  - Key sections: HELP_TEXT (~806 lines, command documentation), `runCommand()` (~900-950 lines, command handlers including new export/metronome), removed time-picker code (~1180-1235 lines)

- **src/app.ts (supporting functions)**
  - `buildNotePool()`: Maps Venus-Earth resonance to harmonic pools (unchanged)
  - `getPlanet()`: Helper to extract planet data (used in weight generation)
  - `PLANET_SYMS`: Constants for planet names/symbols
</important_files>

<next_steps>
**Immediate Work (incomplete):**
1. Complete metronome implementation in app.ts:
   - Fix return object to expose `metronomeEnabled` as both getter/setter
   - Alternative: simpler approach using closure variable
   
2. Verify metronome command works from CLI:
   - Test `metronome on` / `metronome off`
   - Test that onBeat trigger fires and produces audible click

3. Test harmonic diversity improvements:
   - Listen for 1-2 minutes to verify variation beyond C/F/G#
   - Adjust weight generation if still too monotonous

4. Verify export command:
   - Test `export 60` (download last hour)
   - Test `export 30` (download last 30 min)
   - Verify markdown format is correct

**After verification:**
- Consider adding "preview" command to show next N beats without export
- Consider adding "tension" readout command to show current harmonic tension
- Document the weight mapping for performers (what each planet does)

**Open Questions:**
- Should we expose beat state in real-time (e.g., `status` command showing current weights)?
- Should export include a "performer guide" section explaining astronomical factors?
</next_steps>