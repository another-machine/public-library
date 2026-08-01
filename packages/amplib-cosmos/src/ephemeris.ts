/**
 * The single seam between this library and the ephemeris.
 *
 * Everything that needs a real position for a real body goes through here, so
 * swapping the backend later means rewriting one file. `astronomy-engine`
 * (MIT, no dependencies) is accurate to roughly an arcminute for the Sun,
 * Moon, and planets over 1700–2200 — which is about four orders of magnitude
 * better than the hand-rolled approximations it replaced, and considerably
 * better than anything that would be sensible to maintain here.
 *
 * Two things this file also owns:
 *
 *   - Caching. `generate()` is expected to run inside an animation frame, but
 *     rise/set times and moon quarters are found by iterative search and cost
 *     milliseconds, not microseconds. Those are memoised per UTC day and
 *     rounded observer position; the continuous quantities are cheap enough to
 *     recompute every call.
 *   - Failure. Rise/set searches legitimately return null inside the polar
 *     circles. That is a real astronomical answer, not an error, and it
 *     propagates as `null` rather than being swallowed.
 */

import * as AstronomyModule from "astronomy-engine";
import { getUTCDayStart } from "./time";

/**
 * `astronomy-engine` ships real ESM at `esm/astronomy.js`, but its package.json
 * declares no `"type": "module"` and there is no `esm/package.json`, so Node
 * reads that file as CJS. Node therefore resolves the package through its CJS
 * entry, and a namespace import arrives as a single `default` binding wrapping
 * the actual exports. Bundlers follow the `exports` map's `import` condition
 * and get the bindings directly.
 *
 * Both shapes reach this file — bundlers for docs/* and machines/*, plain Node
 * for the tests and for anyone consuming the published package outside a
 * bundler. `astronomy-engine` stays external in `dist`, so that second case is
 * a real consumer path, not just a test detail. Unwrap once, here, so nothing
 * below has to care.
 *
 * `AstronomyModule` remains the source for *type* positions below: `Body` and
 * `Observer` are types as well as values, and types are erased before any of
 * this runs.
 */
const Astronomy = (AstronomyModule as unknown as {
  default?: typeof AstronomyModule;
}).default ?? AstronomyModule;

export type BodyName =
  | "sun"
  | "moon"
  | "mercury"
  | "venus"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune";

export const PLANET_NAMES = [
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
] as const;

export type PlanetName = (typeof PLANET_NAMES)[number];

const BODIES: Record<BodyName, AstronomyModule.Body> = {
  sun: Astronomy.Body.Sun,
  moon: Astronomy.Body.Moon,
  mercury: Astronomy.Body.Mercury,
  venus: Astronomy.Body.Venus,
  mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter,
  saturn: Astronomy.Body.Saturn,
  uranus: Astronomy.Body.Uranus,
  neptune: Astronomy.Body.Neptune,
};

export interface SkyPosition {
  /** Altitude corrected for atmospheric refraction, degrees. What you see. */
  altitude: number;
  /** True geometric altitude, degrees. What the geometry says. */
  geometricAltitude: number;
  /** Degrees clockwise from north. */
  azimuth: number;
  /** Right ascension in sidereal hours [0, 24). */
  rightAscension: number;
  /** Declination in degrees [-90, 90]. */
  declination: number;
  /** Distance from the observer in AU. */
  distanceAu: number;
}

export interface BodyIllumination {
  /** Apparent visual magnitude. Lower is brighter. */
  magnitude: number;
  /** Sun–body–Earth angle in degrees. */
  phaseAngle: number;
  /** Illuminated fraction of the visible disc, [0, 1]. */
  phaseFraction: number;
  /** Distance from the Sun in AU. */
  heliocentricDistanceAu: number;
  /** Distance from the Earth in AU. */
  geocentricDistanceAu: number;
}

export function makeObserver(
  latitude: number,
  longitude: number,
  elevation = 0
): AstronomyModule.Observer {
  return new Astronomy.Observer(latitude, longitude, elevation);
}

/**
 * Topocentric horizontal coordinates. Corrected for parallax, aberration, and
 * (for `altitude`) refraction.
 */
export function getSkyPosition(
  body: BodyName,
  timestamp: number,
  observer: AstronomyModule.Observer
): SkyPosition {
  const date = new Date(timestamp);
  const equatorial = Astronomy.Equator(BODIES[body], date, observer, true, true);
  const horizontal = Astronomy.Horizon(
    date,
    observer,
    equatorial.ra,
    equatorial.dec,
    "normal"
  );
  // An empty refraction option is astronomy-engine's "no correction" mode;
  // "none" is not a value it recognises and throws.
  const geometric = Astronomy.Horizon(
    date,
    observer,
    equatorial.ra,
    equatorial.dec,
    ""
  );
  return {
    altitude: horizontal.altitude,
    geometricAltitude: geometric.altitude,
    azimuth: horizontal.azimuth,
    rightAscension: equatorial.ra,
    declination: equatorial.dec,
    distanceAu: equatorial.dist,
  };
}

export function getIllumination(
  body: BodyName,
  timestamp: number
): BodyIllumination {
  const info = Astronomy.Illumination(BODIES[body], new Date(timestamp));
  return {
    magnitude: info.mag,
    phaseAngle: info.phase_angle,
    phaseFraction: info.phase_fraction,
    heliocentricDistanceAu: info.helio_dist,
    geocentricDistanceAu: info.geo_dist,
  };
}

/**
 * Moon phase as an elongation angle in degrees [0, 360): 0 is new, 90 is
 * first quarter, 180 is full, 270 is last quarter. This is the true
 * Sun–Moon ecliptic longitude difference, not a count of mean synodic months.
 */
export function getMoonPhaseAngle(timestamp: number): number {
  return Astronomy.MoonPhase(new Date(timestamp));
}

/** Geocentric ecliptic longitude and latitude of the Moon, in degrees. */
export function getMoonEcliptic(timestamp: number): {
  longitude: number;
  latitude: number;
  distanceAu: number;
} {
  const spherical = Astronomy.EclipticGeoMoon(new Date(timestamp));
  return {
    longitude: spherical.lon,
    latitude: spherical.lat,
    distanceAu: spherical.dist,
  };
}

/** Apparent geocentric ecliptic longitude of the Sun, in degrees. */
export function getSunEclipticLongitude(timestamp: number): number {
  return Astronomy.SunPosition(new Date(timestamp)).elon;
}

/**
 * Heliocentric ecliptic position in AU, plus the ecliptic longitude that
 * makes planetary cycles legible. `x` points to the March equinox and `z` is
 * perpendicular to the ecliptic plane, so a top-down solar-system plot is
 * just `(x, y)`.
 */
export function getHeliocentricPosition(
  body: PlanetName,
  timestamp: number
): { x: number; y: number; z: number; longitude: number; latitude: number } {
  const vector = Astronomy.HelioVector(BODIES[body], new Date(timestamp));
  const ecliptic = Astronomy.Ecliptic(vector);
  return {
    x: ecliptic.vec.x,
    y: ecliptic.vec.y,
    z: ecliptic.vec.z,
    longitude: ecliptic.elon,
    latitude: ecliptic.elat,
  };
}

/** Angular separation from the Sun as seen from Earth, in degrees [0, 180]. */
export function getElongation(body: PlanetName, timestamp: number): number {
  return Astronomy.AngleFromSun(BODIES[body], new Date(timestamp));
}

/** Apparent angular diameter of the Moon in degrees, from the ephemeris. */
export function getMoonAngularDiameter(timestamp: number): number {
  return Astronomy.Libration(new Date(timestamp)).diam_deg;
}

export interface RiseSet {
  rise: number | null;
  set: number | null;
  /** Time of upper culmination — the body's daily high point. */
  transit: number | null;
  /** Altitude at transit, degrees. Negative means it never clears the horizon. */
  transitAltitude: number;
}

/**
 * Midnight of the observer's *local solar* day, as a UTC timestamp.
 *
 * Rise and set have to be searched over the day the observer is actually
 * living in, which is not the UTC day. Anchoring the search at UTC midnight
 * puts New York's summer sunset a full 24 hours out, because at 12:00 UTC on
 * the solstice the UTC day already contains the *previous* local evening's
 * sunset. Shifting by longitude puts the window where the observer is.
 */
function getLocalSolarDayStart(timestamp: number, longitude: number): number {
  const offset = (longitude / 15) * 3600000;
  return getUTCDayStart(timestamp + offset) - offset;
}

/**
 * Rise, set, and transit over the observer's local solar day.
 *
 * `null` for rise or set is a real answer, in two situations: inside the polar
 * circles, where a body can stay up or down for weeks, and for the Moon, which
 * runs on a 24h50m day and so genuinely skips a rise or a set roughly once a
 * month. Callers should branch on null rather than substituting zero — the old
 * code coerced it to timestamp 0, which reads as "1 January 1970" downstream.
 */
function computeRiseSet(
  body: BodyName,
  timestamp: number,
  observer: AstronomyModule.Observer
): RiseSet {
  const dayStart = new Date(
    getLocalSolarDayStart(timestamp, observer.longitude)
  );
  const astroBody = BODIES[body];

  const rise = Astronomy.SearchRiseSet(astroBody, observer, +1, dayStart, 1);
  const set = Astronomy.SearchRiseSet(astroBody, observer, -1, dayStart, 1);

  let transit: number | null = null;
  let transitAltitude = Number.NaN;
  try {
    const event = Astronomy.SearchHourAngle(astroBody, observer, 0, dayStart, +1);
    transit = event.time.date.getTime();
    transitAltitude = event.hor.altitude;
  } catch {
    // SearchHourAngle throws only at the geographic poles, where hour angle
    // is undefined. Everything else in the result stays valid.
  }

  return {
    rise: rise ? rise.date.getTime() : null,
    set: set ? set.date.getTime() : null,
    transit,
    transitAltitude,
  };
}

export interface MoonQuarters {
  newMoon: number;
  firstQuarter: number;
  fullMoon: number;
  lastQuarter: number;
}

/** The next occurrence of each of the four principal lunar phases. */
function computeMoonQuarters(timestamp: number): MoonQuarters {
  const found: Partial<Record<number, number>> = {};
  let quarter = Astronomy.SearchMoonQuarter(new Date(timestamp));
  // Four searches at most one synodic month apart are guaranteed to cover all
  // four quarters exactly once.
  for (let i = 0; i < 4; i++) {
    if (found[quarter.quarter] === undefined) {
      found[quarter.quarter] = quarter.time.date.getTime();
    }
    quarter = Astronomy.NextMoonQuarter(quarter);
  }
  return {
    newMoon: found[0]!,
    firstQuarter: found[1]!,
    fullMoon: found[2]!,
    lastQuarter: found[3]!,
  };
}

export interface Seasons {
  marchEquinox: number;
  juneSolstice: number;
  septemberEquinox: number;
  decemberSolstice: number;
}

function computeSeasons(year: number): Seasons {
  const info = Astronomy.Seasons(year);
  return {
    marchEquinox: info.mar_equinox.date.getTime(),
    juneSolstice: info.jun_solstice.date.getTime(),
    septemberEquinox: info.sep_equinox.date.getTime(),
    decemberSolstice: info.dec_solstice.date.getTime(),
  };
}

/**
 * A bounded memo. Iterative searches cost roughly a millisecond each, which is
 * fine once and ruinous sixty times a second. Keys quantise the observer to
 * 0.01° (about a kilometre — far finer than rise/set times can distinguish)
 * and the time to a UTC day, so a running clock hits the same entry all day.
 */
const CACHE_LIMIT = 256;

function memoise<T>(cache: Map<string, T>, key: string, compute: () => T): T {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = compute();
  if (cache.size >= CACHE_LIMIT) {
    // Map preserves insertion order, so the first key is the oldest.
    cache.delete(cache.keys().next().value as string);
  }
  cache.set(key, value);
  return value;
}

const riseSetCache = new Map<string, RiseSet>();
const moonQuarterCache = new Map<string, MoonQuarters>();
const seasonCache = new Map<string, Seasons>();

export function getRiseSet(
  body: BodyName,
  timestamp: number,
  observer: AstronomyModule.Observer
): RiseSet {
  const day = getLocalSolarDayStart(timestamp, observer.longitude);
  const key = `${body}|${day}|${observer.latitude.toFixed(2)}|${observer.longitude.toFixed(2)}`;
  return memoise(riseSetCache, key, () =>
    computeRiseSet(body, timestamp, observer)
  );
}

export function getMoonQuarters(timestamp: number): MoonQuarters {
  // Quarter searches only need day resolution; within a day the answer is the
  // same set of upcoming events.
  const day = getUTCDayStart(timestamp);
  return memoise(moonQuarterCache, String(day), () =>
    computeMoonQuarters(timestamp)
  );
}

export function getSeasons(timestamp: number): Seasons {
  const year = new Date(timestamp).getUTCFullYear();
  return memoise(seasonCache, String(year), () => computeSeasons(year));
}

/** Exposed for tests and for callers with long-lived processes. */
export function clearEphemerisCache(): void {
  riseSetCache.clear();
  moonQuarterCache.clear();
  seasonCache.clear();
}
