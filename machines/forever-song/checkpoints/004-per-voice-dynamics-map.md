# Checkpoint 004: Per-Instrument Dynamics + Interactive Location Map

## Summary
Added per-voice dynamics display with individual drivers for each instrument (main/twinkle/bass) and implemented an interactive 2D location map for geographic selection. All three voices now have distinct dynamics that vary based on different astronomical signals.

## Changes Made

### app.ts
- Fixed missing `vibratoLabel()` function declaration
- Updated `buildStatus()` signature to accept `lat` and `lon` parameters (previously hardcoded to 0)
- Replaced single `dynamics` field with three per-voice VoiceDynamic objects:
  - `mainDynamic`: driven by sun elevation (ppp at night → fff at day)
  - `twinkleDynamic`: driven by Venus altitude (silent below horizon → strong when high)
  - `bassDynamic`: driven by Jupiter altitude
- Each VoiceDynamic includes: `label` (ppp/pp/p/mp/mf/f/ff/fff), `level` (0–1), `driver` (description)
- Updated all three calls to `buildStatus()` to pass `lat` and `lon` from observer location

### index.html

**CSS additions:**
- Per-voice dynamic bars with individual colors (blue/main, yellow/twinkle, green/bass)
- Interactive 2D canvas-based world map with:
  - Equator + meridian reference lines
  - Current location shown as dot with aura ring
  - Simple Mercator projection (lat/lon → pixel coords)
  - Click-to-select location functionality
  - Reset location button to request browser geolocation

**HTML structure:**
- Replaced single "dynamics" section with "dynamics per voice" showing three rows
- Each row displays: voice name, dynamics label, colored bar fill, driver description
- Added map canvas below location label
- Added "current location" button for geolocation reset

**JavaScript additions:**
- `drawMap(lat, lon)`: renders world map with current position
  - Converts lat/lon to canvas coordinates using Mercator projection
  - Draws reference lines and location dot with outline
- Map click handler: converts click coords back to lat/lon and updates URL
- Reset button handler: requests browser geolocation and updates URL
- Updated `renderStatus()` to populate per-voice dynamics with live data
- Updated status annotation to use `mainDynamic.label` instead of removed `dynamics` field

## Technical Details

**Per-voice dynamics calculation:**
- Main: `brightness` (0–1) → dynamicsLabel() → ppp/fff range
- Twinkle: `Venus altitude / 90` clamped 0–1 → Venus visibility scale
- Bass: `Jupiter altitude / 90` clamped 0–1 → Jupiter visibility scale
- All three use same DYNAMICS_LABEL array: ["ppp","pp","p","mp","mf","f","ff","fff"]

**Map rendering:**
- Canvas 200×120px
- Mercator projection: `x = ((lon + 180) / 360) * w`, `y = ((90 - lat) / 180) * h`
- Reference lines drawn for equator and prime meridian
- Current location shown as dot (radius 3px) with circle outline (radius 5px)

**Location update flow:**
- Click on map or reset button → URL params update (`?lat=X&lon=Y`)
- User must restart (`start` command) for changes to take effect (cosmos is regenerated from params)
- Coordinates displayed in both N/S/E/W and decimal degree formats

## Build Status
✅ Build succeeds: 43.44 kB
✅ All per-voice dynamics fields present and correct
✅ Map rendering functions compiled
✅ No TypeScript errors

## Known Limitations / Future Work
1. **Note pool expansion** - Not yet implemented (Venus-Earth resonance → pool richness still TODO)
2. **Per-voice volume control** - ChromaticWall needs independent gain multipliers
3. **Map interaction** - Requires page reload/restart; consider live cosmos update instead
4. **Projection alternatives** - Currently Mercator; could add Equirectangular or other for better visualization
5. **Multiple location bookmarks** - Could add favorites or preset locations

## Files Modified
- `public-library/machines/forever-song/src/app.ts`
- `public-library/machines/forever-song/src/index.html`
- `public-library/machines/forever-song/dist/index.html` (rebuilt)

## Test Checklist
- [x] Build succeeds without errors
- [x] Per-voice dynamics calculated from correct astronomical signals
- [x] Map renders with current location
- [x] Map click updates URL parameters
- [x] Reset button requests geolocation
- [ ] Cross-browser geolocation permissions work correctly
- [ ] Map projection visually accurate across lat/lon ranges
- [ ] Per-voice dynamics display matches current cursor position and tone

