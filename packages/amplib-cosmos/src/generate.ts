/**
 * The entry point.
 *
 * `generate()` is a pure function of latitude, longitude, elevation, and a UTC
 * timestamp. Given the same four numbers it returns the same result on every
 * machine, in every timezone, in any JavaScript runtime. That property is the
 * whole reason this library exists, and `test/run.ts` asserts it directly.
 */

import { makeObserver, getSkyPosition } from "./ephemeris";
import { generateEarth, type EarthResult } from "./generateEarth";
import { generateMoon, type MoonResult } from "./generateMoon";
import { generateObserver, type ObserverResult } from "./generateObserver";
import { generatePlanets, type PlanetsResult } from "./generatePlanets";
import { generateSun, type SunResult } from "./generateSun";
import { generateTides, type TideResult } from "./generateTides";
import {
  generateSeed,
  DEFAULT_SEED_RESOLUTION,
  type SeedResolution,
  type SeedResult,
} from "./seed";
import { generateTimescales, type TimescalesResult } from "./timescales";
import { getLocalSiderealTime, toTimestamp, type DateInput } from "./time";
import { ASTRONOMICAL_UNIT_IN_KM } from "./constants";

export interface CosmosOptions {
  /** Degrees north, [-90, 90]. Default 0. */
  latitude?: number;
  /** Degrees east, [-180, 180]. Default 0. */
  longitude?: number;
  /** Height above sea level in kilometers. Default 0. */
  elevation?: number;
  /** UTC instant, as a Date or millisecond timestamp. Default `Date.now()`. */
  timestamp?: DateInput;
  /** Quantization used when deriving `seed`. See `seed.ts` for why it exists. */
  seedResolution?: SeedResolution;
  /**
   * Skip the planets. They are the expensive part — seven bodies, each with a
   * rise/set search — so a caller that only wants sun and moon can cut most of
   * the work. Default false.
   */
  skipPlanets?: boolean;
}

export interface CosmosResult {
  /** The inputs, echoed back after defaulting and normalization. */
  input: {
    latitude: number;
    longitude: number;
    elevation: number;
    timestamp: number;
  };
  observer: ObserverResult;
  earth: EarthResult;
  sun: SunResult;
  moon: MoonResult;
  planets: PlanetsResult;
  tides: TideResult;
  /** The same value objects, regrouped by how fast they move. */
  timescales: TimescalesResult;
  /** A deterministic seed for `@amplib/procedural-generation`. */
  seed: SeedResult;
}

/** Fold latitude and longitude into their valid domains. */
function normalizeCoordinates(latitude: number, longitude: number) {
  // Latitude clamps. There is no wrapping past a pole that makes sense without
  // also flipping longitude, and a caller passing 95° has a bug worth keeping
  // visible rather than silently reinterpreting.
  const lat = Math.min(90, Math.max(-90, latitude));
  // Longitude genuinely wraps. Map into [-180, 180).
  const lon = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return { latitude: lat, longitude: lon };
}

export function generate(options: CosmosOptions = {}): CosmosResult {
  const {
    elevation = 0,
    seedResolution = DEFAULT_SEED_RESOLUTION,
    skipPlanets = false,
  } = options;

  const { latitude, longitude } = normalizeCoordinates(
    options.latitude ?? 0,
    options.longitude ?? 0
  );
  const timestamp = toTimestamp(options.timestamp ?? Date.now());

  const observerFrame = makeObserver(latitude, longitude, elevation * 1000);

  // Sun and Moon positions are wanted by several generators, so compute each
  // once and pass them down rather than letting every consumer re-query.
  const sunPosition = getSkyPosition("sun", timestamp, observerFrame);
  const moonPosition = getSkyPosition("moon", timestamp, observerFrame);

  const observer = generateObserver({
    latitude,
    longitude,
    elevation,
    timestamp,
  });
  const earth = generateEarth({
    timestamp,
    latitude,
    earthSunDistanceAu: sunPosition.distanceAu,
  });
  const sun = generateSun({
    timestamp,
    observer: observerFrame,
    position: sunPosition,
    longitude,
  });
  const moon = generateMoon({
    timestamp,
    observer: observerFrame,
    position: moonPosition,
    longitude,
  });
  const planets = skipPlanets
    ? ({} as PlanetsResult)
    : generatePlanets({
        timestamp,
        observer: observerFrame,
        sunAltitude: sunPosition.altitude,
      });

  const tides = generateTides({
    moonPosition,
    sunPosition,
    moonDistanceKm: moonPosition.distanceAu * ASTRONOMICAL_UNIT_IN_KM,
    sunDistanceAu: sunPosition.distanceAu,
    moonPhaseAngle: moon.phaseAngle.value,
    localSiderealTime: getLocalSiderealTime(timestamp, longitude),
    moonRightAscension: moonPosition.rightAscension,
  });

  const timescales = generateTimescales({
    observer,
    earth,
    sun,
    moon,
    planets,
    tides,
  });

  const seed = generateSeed({
    latitude,
    longitude,
    timestamp,
    resolution: seedResolution,
  });

  return {
    input: { latitude, longitude, elevation, timestamp },
    observer,
    earth,
    sun,
    moon,
    planets,
    tides,
    timescales,
    seed,
  };
}
