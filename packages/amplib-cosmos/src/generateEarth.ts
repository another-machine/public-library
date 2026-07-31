/**
 * Earth's own state: where it is in its orbit, how fast it is moving, and
 * which season the observer is in.
 *
 * Seasons come from the real equinox and solstice instants rather than from
 * fixed day-of-year thresholds, so the boundaries land on the actual moment
 * the Sun crosses, and shift correctly with the leap-year cycle.
 */

import {
  EARTH_APHELION_KM,
  EARTH_ORBITAL_PERIOD,
  EARTH_PERIHELION_KM,
  EARTH_SUN_MEAN_DISTANCE_KM,
  ASTRONOMICAL_UNIT_IN_KM,
  PERIOD_TROPICAL_YEAR,
} from "./constants";
import { getSeasons, getSunEclipticLongitude } from "./ephemeris";
import { getYearFraction } from "./time";
import {
  createCyclicValue,
  createEventValue,
  createNumberValue,
  createStringValue,
  wrap,
  type CyclicValue,
  type EventValue,
  type NumberValue,
  type StringValue,
} from "./values";

export const SEASONS = ["Winter", "Spring", "Summer", "Fall"] as const;
export type Season = (typeof SEASONS)[number];

export interface EarthResult {
  /**
   * Season at the observer's hemisphere, from the true equinox and solstice
   * instants. The old version used fixed day-of-year cutoffs, which drift by
   * up to a day across the leap cycle and were computed from a
   * timezone-dependent day number.
   */
  season: StringValue<Season>;
  /**
   * Continuous position within the seasonal year, 0 at the March equinox.
   * This is the Sun's apparent ecliptic longitude, which is the definition of
   * the tropical year — and cyclic, so it is safe to modulate with.
   */
  seasonalPhase: CyclicValue;
  /**
   * Mean anomaly: angle from perihelion, degrees [0, 360). Cyclic. Tracks the
   * anomalistic year, which is very slightly longer than the tropical year.
   */
  orbitalPosition: CyclicValue;
  /** Distance to the Sun in km, between perihelion and aphelion. */
  distanceFromSun: NumberValue;
  /** Same distance in AU, for when that reads better. */
  distanceFromSunAu: NumberValue;
  /** Orbital speed around the Sun, km/s. Faster near perihelion. */
  orbitalVelocity: NumberValue;
  /** Fraction of the way through the UTC calendar year, [0, 1). */
  yearProgress: CyclicValue;
  marchEquinox: EventValue;
  juneSolstice: EventValue;
  septemberEquinox: EventValue;
  decemberSolstice: EventValue;
}

/**
 * Northern-hemisphere season for a given solar ecliptic longitude.
 * 0° is the March equinox, 90° the June solstice, and so on.
 */
function seasonFromSolarLongitude(longitude: number): Season {
  if (longitude < 90) return "Spring";
  if (longitude < 180) return "Summer";
  if (longitude < 270) return "Fall";
  return "Winter";
}

const OPPOSITE: Record<Season, Season> = {
  Spring: "Fall",
  Summer: "Winter",
  Fall: "Spring",
  Winter: "Summer",
};

export function generateEarth({
  timestamp,
  latitude,
  earthSunDistanceAu,
}: {
  timestamp: number;
  latitude: number;
  earthSunDistanceAu: number;
}): EarthResult {
  const solarLongitude = getSunEclipticLongitude(timestamp);
  const northern = seasonFromSolarLongitude(solarLongitude);
  const season = latitude >= 0 ? northern : OPPOSITE[northern];

  const distanceKm = earthSunDistanceAu * ASTRONOMICAL_UNIT_IN_KM;

  // Vis-viva: v = sqrt(GM (2/r − 1/a)). The old code used v ∝ 1/r, which is
  // only exact at the apsides and overstates the variation in between.
  const meanVelocity =
    (2 * Math.PI * EARTH_SUN_MEAN_DISTANCE_KM) /
    (EARTH_ORBITAL_PERIOD * 86400);
  const semiMajorAu = 1.00000011;
  const orbitalVelocity =
    meanVelocity *
    Math.sqrt(Math.max(0, 2 / earthSunDistanceAu - 1 / semiMajorAu));

  // Mean anomaly of the Earth about the Sun. Perihelion longitude is the
  // Sun's geometric longitude at perihelion plus 180°.
  const T = (timestamp - Date.UTC(2000, 0, 1, 12)) / (86400000 * 36525);
  const meanAnomaly = wrap(357.52911 + 35999.05029 * T - 0.0001537 * T * T, 360);

  const seasons = getSeasons(timestamp);

  return {
    season: createStringValue(season, SEASONS),
    seasonalPhase: createCyclicValue({
      // Flip the reference for the southern hemisphere so that phase 0 is
      // always that observer's spring.
      value: latitude >= 0 ? solarLongitude : solarLongitude + 180,
      unit: "degrees",
      period: 360,
    }),
    orbitalPosition: createCyclicValue({
      value: meanAnomaly,
      unit: "degrees",
      period: 360,
    }),
    distanceFromSun: createNumberValue({
      value: distanceKm,
      unit: "km",
      min: EARTH_PERIHELION_KM,
      max: EARTH_APHELION_KM,
    }),
    distanceFromSunAu: createNumberValue({
      value: earthSunDistanceAu,
      unit: "au",
      min: EARTH_PERIHELION_KM / ASTRONOMICAL_UNIT_IN_KM,
      max: EARTH_APHELION_KM / ASTRONOMICAL_UNIT_IN_KM,
    }),
    orbitalVelocity: createNumberValue({
      value: orbitalVelocity,
      unit: "km/s",
      min: 29.29,
      max: 30.29,
    }),
    yearProgress: createCyclicValue({
      value: getYearFraction(timestamp),
      unit: "ratio",
      period: 1,
    }),
    marchEquinox: createEventValue(seasons.marchEquinox, timestamp),
    juneSolstice: createEventValue(seasons.juneSolstice, timestamp),
    septemberEquinox: createEventValue(seasons.septemberEquinox, timestamp),
    decemberSolstice: createEventValue(seasons.decemberSolstice, timestamp),
  };
}

export const EARTH_PERIODS = {
  seasonalPhase: PERIOD_TROPICAL_YEAR,
  orbitalPosition: PERIOD_TROPICAL_YEAR,
  yearProgress: PERIOD_TROPICAL_YEAR,
};
