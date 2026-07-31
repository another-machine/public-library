/**
 * Signals grouped by how fast they move.
 *
 * A composer mapping the sky onto music has a practical problem: the result
 * tree is organised by body, but the useful question is "what moves at the
 * speed of a bar, and what moves at the speed of a movement?" A signal with a
 * 25-hour period and one with a 165-year period both arrive as numbers in
 * [0, 1], and nothing in their shape says which is which.
 *
 * These bands answer that. Each entry points at a value object already in the
 * result — nothing is copied — and adds the nominal period in seconds.
 *
 *   rotational  hours          rhythm, filter sweeps, stereo movement
 *   lunar       days to weeks  phrase length, register, density
 *   annual      months         key centre, mode, timbre
 *   epochal     years+         long-form structure, tuning drift
 */

import {
  PERIOD_ANOMALISTIC_MONTH,
  PERIOD_LUNAR_DAY,
  PERIOD_SEMIDIURNAL_TIDE,
  PERIOD_SIDEREAL_DAY,
  PERIOD_SOLAR_DAY,
  PERIOD_SYNODIC_MONTH,
  PERIOD_TROPICAL_YEAR,
} from "./constants";
import type { EarthResult } from "./generateEarth";
import type { MoonResult } from "./generateMoon";
import type { ObserverResult } from "./generateObserver";
import type { PlanetsResult } from "./generatePlanets";
import type { SunResult } from "./generateSun";
import type { TideResult } from "./generateTides";
import type { CyclicValue, NumberValue } from "./values";

export const TIMESCALE_BANDS = [
  "rotational",
  "lunar",
  "annual",
  "epochal",
] as const;
export type TimescaleBand = (typeof TIMESCALE_BANDS)[number];

export interface Signal {
  /** Dotted path to the same object in the result tree. */
  path: string;
  /** Length of one cycle in seconds. */
  periodSeconds: number;
  /** The live value object. Same reference as in the tree, not a copy. */
  value: NumberValue | CyclicValue;
  /** True when `value` carries continuous `sin`/`cos` alongside `unitRange`. */
  cyclic: boolean;
}

export interface Timescale {
  band: TimescaleBand;
  /** Representative period for the band, seconds. */
  periodSeconds: number;
  signals: Signal[];
}

export type TimescalesResult = Record<TimescaleBand, Timescale>;

function signal(
  path: string,
  periodSeconds: number,
  value: NumberValue | CyclicValue
): Signal {
  return { path, periodSeconds, value, cyclic: "sin" in value };
}

export function generateTimescales({
  observer,
  earth,
  sun,
  moon,
  planets,
  tides,
}: {
  observer: ObserverResult;
  earth: EarthResult;
  sun: SunResult;
  moon: MoonResult;
  planets: PlanetsResult;
  tides: TideResult;
}): TimescalesResult {
  const rotational: Signal[] = [
    signal("observer.solarTime", PERIOD_SOLAR_DAY, observer.solarTime),
    signal("observer.siderealTime", PERIOD_SIDEREAL_DAY, observer.siderealTime),
    signal(
      "observer.earthRotationAngle",
      PERIOD_SIDEREAL_DAY,
      observer.earthRotationAngle
    ),
    signal("sun.hourAngle", PERIOD_SOLAR_DAY, sun.hourAngle),
    signal("sun.altitude", PERIOD_SOLAR_DAY, sun.altitude),
    signal("sun.azimuth", PERIOD_SOLAR_DAY, sun.azimuth),
    signal("sun.daylightProgress", PERIOD_SOLAR_DAY, sun.daylightProgress),
    signal("moon.hourAngle", PERIOD_LUNAR_DAY, moon.hourAngle),
    signal("moon.altitude", PERIOD_LUNAR_DAY, moon.altitude),
    signal("moon.azimuth", PERIOD_LUNAR_DAY, moon.azimuth),
    signal(
      "tides.semidiurnalPhase",
      PERIOD_SEMIDIURNAL_TIDE,
      tides.semidiurnalPhase
    ),
    signal("tides.potential", PERIOD_SEMIDIURNAL_TIDE, tides.potential),
  ];

  const lunar: Signal[] = [
    signal("moon.phase", PERIOD_SYNODIC_MONTH, moon.phase),
    signal("moon.phaseAngle", PERIOD_SYNODIC_MONTH, moon.phaseAngle),
    signal("moon.illumination", PERIOD_SYNODIC_MONTH, moon.illumination),
    signal("moon.age", PERIOD_SYNODIC_MONTH, moon.age),
    signal("moon.distance", PERIOD_ANOMALISTIC_MONTH, moon.distance),
    signal("moon.distancePhase", PERIOD_ANOMALISTIC_MONTH, moon.distancePhase),
    signal(
      "moon.angularDiameter",
      PERIOD_ANOMALISTIC_MONTH,
      moon.angularDiameter
    ),
    signal("tides.range", PERIOD_SYNODIC_MONTH / 2, tides.range),
    signal("tides.springNeapPhase", PERIOD_SYNODIC_MONTH / 2, tides.springNeapPhase),
  ];

  const annual: Signal[] = [
    signal("earth.seasonalPhase", PERIOD_TROPICAL_YEAR, earth.seasonalPhase),
    signal("earth.orbitalPosition", PERIOD_TROPICAL_YEAR, earth.orbitalPosition),
    signal("earth.distanceFromSun", PERIOD_TROPICAL_YEAR, earth.distanceFromSun),
    signal(
      "earth.orbitalVelocity",
      PERIOD_TROPICAL_YEAR,
      earth.orbitalVelocity
    ),
    signal("sun.declination", PERIOD_TROPICAL_YEAR, sun.declination),
    signal("sun.eclipticLongitude", PERIOD_TROPICAL_YEAR, sun.eclipticLongitude),
    signal("sun.dayLength", PERIOD_TROPICAL_YEAR, sun.dayLength),
    signal("sun.equationOfTime", PERIOD_TROPICAL_YEAR / 2, sun.equationOfTime),
  ];

  const epochal: Signal[] = [];
  for (const planet of Object.values(planets)) {
    const period = planet.orbitalPeriodDays * 86400;
    epochal.push(
      signal(
        `planets.${planet.name}.heliocentricLongitude`,
        period,
        planet.heliocentricLongitude
      )
    );
    // Distance and brightness follow the synodic period rather than the
    // orbital one, but both live at the same "years" scale, so they belong in
    // the same band.
    epochal.push(signal(`planets.${planet.name}.distance`, period, planet.distance));
    epochal.push(
      signal(`planets.${planet.name}.brightness`, period, planet.brightness)
    );
  }

  return {
    rotational: {
      band: "rotational",
      periodSeconds: PERIOD_SOLAR_DAY,
      signals: rotational,
    },
    lunar: {
      band: "lunar",
      periodSeconds: PERIOD_SYNODIC_MONTH,
      signals: lunar,
    },
    annual: {
      band: "annual",
      periodSeconds: PERIOD_TROPICAL_YEAR,
      signals: annual,
    },
    epochal: {
      band: "epochal",
      // Jupiter's orbit, as a representative "slow" period.
      periodSeconds: 4332.589 * 86400,
      signals: epochal,
    },
  };
}
