<overview>
The user is building "forever-song," an infinite procedural generative music system where astronomical data (moon phase, planetary altitudes, time-of-day) and geographic location shape a deterministic universal composition. The music is identical for all listeners on Earth at the same moment, but regional texture varies by location and time of day. The work in this session focused on: (1) adding per-instrument dynamics with individual astronomical drivers, (2) implementing an interactive 2D world map for location selection with live updates, (3) expanding the note palette beyond triads, and (4) adding multiple new instrument types (pad, arpeggios) with variable envelope lengths. The user's most recent request is to make the bass more musically interesting using music theory (rather than just playing the root), and to add a separate celestial visualization showing sun/moon/planets relative to Earth based on location.
</overview>

<history>
1. User asked to add per-instrument dynamics and interactive map
   - Added VoiceDynamic interface with label (ppp–fff), level (0–1), and driver description
   - Created per-voice metrics: main (sun-driven), twinkle (Venus-driven), bass (Jupiter-driven)
   - Built interactive 2D canvas map with Mercator projection, clickable location selection, and "current location" reset button
   - Updated StatusData to include lat/lon for map rendering
   - Result: Per-voice dynamics display + interactive map in UI; build succeeded at 43.44 kB

2. User noted that location changes required restart
   - Added setLocation() function that regenerates cosmos instantly
   - Updated map click and reset button handlers to call setLocation() instead of just updating URL
   - Now location changes are live without restarting playback
   - Result: Seamless location switching while music plays; build succeeded at 58.87 kB

3. User asked to expand beyond triads and add more instrument types with variable note lengths
   - Added buildNotePool() helper that blends triad → pentatonic → full scale based on Venus-Earth resonance
   - Extended FireEvent interface to include pad and arpeggios voices
   - Created triggerPad() (3–5.5s release) and triggerArpeggios() (80ms staccato) functions
   - Updated beat callback to calculate note pool and fire new instruments with seeded RNG
   - Updated StatusData to include padDynamic, arpeggiosDynamic, notePoolSize, notePoolLabel
   - Result: app.ts compiles successfully at 61.61 kB; HTML VOICES config updated to 5 instruments

4. User requested bass improve musically using music theory + separate celestial visualization
   - Currently working on this request; need to enhance bass to play scale degrees, not just root
   - Plan to add celestial visualization component showing sun/moon/planets/Earth based on location
</history>

<work_done>
Files modified:
- `public-library/machines/forever-song/src/app.ts`:
  - Added buildNotePool() function (Venus-Earth resonance → note pool richness)
  - Added triggerPad() and triggerArpeggios() synth voices with distinct envelopes
  - Extended FireEvent interface to include pad and arpeggios
  - Updated StatusData to include padDynamic, arpeggiosDynamic, notePoolSize, notePoolLabel
  - Updated beat callback to:
    - Calculate note pool from Venus-Earth resonance
    - Pass notePool to wall.tick()
    - Fire pad and arpeggios instruments with seeded RNG
    - Pass note pool info to onStatus()
  - Updated buildStatus() signature to accept notePoolLabel and notePoolSize
  - Updated setTimeOffset() and setLocation() to calculate and pass note pool info
  - Fixed setLocation() to regenerate cosmos and update UI live

- `public-library/machines/forever-song/src/index.html`:
  - Updated VOICES config: added pad (▬) and arpeggios (≋) entries

Work completed:
- [x] Per-instrument dynamics with individual astronomical drivers
- [x] Interactive 2D location map with click-to-select and reset button
- [x] Live location changes (no restart required)
- [x] Note pool expansion (triads → pentatonic → full scale)
- [x] New instrument types (pad, arpeggios) with variable envelopes
- [ ] Enhanced bass using music theory (scale degrees, inversions)
- [ ] Celestial visualization (sun/moon/planets/Earth)

Current state:
- Build succeeds: 61.61 kB
- 5 instruments now fire with correct seeded RNG
- Note pool blends based on Venus-Earth resonance
- All new code compiled but HTML visualization not yet updated for new instruments
- Bass still plays root note only; needs harmonic enhancement
</work_done>

<technical_details>
**Note Pool Architecture:**
- Venus-Earth resonance (0–1) drives harmonic richness: 0–0.33 = triad, 0.33–0.67 = pentatonic blend, 0.67–1 = full scale
- buildNotePool() returns all notes from all intervals, filtering duplicates by (notation, octave) pair
- Rationale: Venus-Earth resonance is the unused signal—perfect for harmonic complexity over long cycles

**Instrument Envelope Profiles:**
- Main: attack=0.01s, release=0.5–3.5s (brightness-modulated)
- Twinkle: attack=0.001s, release=0.2–0.8s (Venus-modulated)
- Bass: attack=0.04s, release=0.7–2s (quarter-note sustain)
- Pad: attack=0.1s, release=3–5.5s (ambient, Jupiter-driven fire probability)
- Arpeggios: attack=0.005s, release=80ms (staccato runs, Mars-driven density)

**Seeded RNG Strategy:**
- Each voice fires using distinct seed offsets: main=wallBeatIndex, bass=+1M, pad=+2M, arpeggios=+3M
- Ensures cross-tab determinism; all tabs on Earth produce identical sequences

**Music Theory Limitation (Current):**
- Bass plays only root note (triadic root at octaves 2–3)
- Needs enhancement: use scale intervals to vary bass by harmonic context
- Potential approach: walk up/down scale via moon phase or other signal

**Gotchas:**
- Note pool from scale.intervals returns notes in order; flattening all intervals produces chromatic-ish sequence, not ordered by pitch
- buildStatus() now requires 10 parameters; must pass notePoolLabel/Size through all callbacks
- Gain nodes created per-beat (pad, arpeggios); potential memory concern if not garbage collected properly
</technical_details>

<important_files>
- `public-library/machines/forever-song/src/app.ts`
  - Central music engine; all cosmos-to-audio wiring
  - Why: Contains all synth trigger logic, note pool building, seeded RNG, beat callbacks
  - Changes: Added buildNotePool(), triggerPad(), triggerArpeggios(); expanded FireEvent; updated buildStatus() signature
  - Key sections: buildNotePool() ~145–170, trigger functions ~302–360, beat callback ~417–540, setTimeOffset/setLocation ~548–580

- `public-library/machines/forever-song/src/index.html`
  - UI and command interface
  - Why: Displays all streaming beat data, status panel, celestial visualization (to be added)
  - Changes: Updated VOICES config to 5 instruments; renderFireLine() and renderStatus() loop over VOICES
  - Key sections: VOICES config ~541–545, renderFireLine() ~593–610, renderStatus() ~615–680

- `public-library/machines/forever-song/dist/index.html`
  - Built output (61.61 kB)
  - Rebuilt after each app.ts/index.html change; always run `npm run build` before testing

- `public-library/packages/amplib-music-theory/src/Scale.ts`, `Interval.ts`
  - Scale generation and interval mappings (used, not modified)
  - Why: Provides scale.intervals[i].notes arrays; required for note pool building
</important_files>

<next_steps>
Immediate tasks (priority order):

1. **Enhance bass with music theory**
   - Current: plays root only
   - Goal: vary bass line using scale degrees, not just root
   - Approach:
     - Calculate bass scale degree from moon phase or diurnal clock (circular walk through scale)
     - Use scale intervals, not just root note
     - Vary octave based on Jupiter altitude (inversion)
     - Fire probability per time signature (already coded)
   - Files affected: app.ts (triggerBass refactoring, beat callback logic)

2. **Add celestial visualization**
   - Goal: Show sun, moon, planets, Earth positions relative to each other based on location/time
   - Approach:
     - New section in status panel (below map or alternate tab)
     - Canvas-based visualization: sun at center, Earth/observer, planets in orbit/altitude
     - Or: Simple 2D projection showing altitude (y-axis) vs azimuth (x-axis)
     - Use cosmos data: sun.altitude, planets[*].altitude, moon.altitude, observer lat/lon
   - Files affected: index.html (CSS + canvas), possibly app.ts (pass planet data to StatusData)

3. **Update HTML stream renderer**
   - renderFireLine() already loops over VOICES; should auto-display pad + arpeggios characters
   - Test: start app and verify 5 indicators show in stream
   - May need CSS for new .hit-pad and .hit-arpeggios classes

4. **Test cross-talk determinism**
   - Verify two tabs at same moment produce identical sequences for all 5 instruments
   - Verify note pool changes smoothly as Venus-Earth resonance shifts

5. **Performance check**
   - Monitor: multiple synths + gain nodes per beat; any audio dropout?
   - Potential fix: reuse gain nodes instead of creating new ones each beat

Blockers / open questions:
- Should bass play scale degrees (how to select which degree? signal-based walk?)
- Should celestial viz be 2D projection (azimuth × altitude) or orbital mechanics?
- Should new instruments have independent note pools or share main notePool?
</next_steps>