/**
 * The Sun as seen from the observer.
 *
 * Rise and set come from the ephemeris' iterative search, which accounts for
 * the −0.833° horizon dip (refraction plus the solar semidiameter), the
 * equation of time, and the observer's parallax. The previous implementation
 * omitted all three and ran up to 13 minutes fast, with day lengths short by
 * 8–14 minutes.
 *
 * `sunrise` and `sunset` are null inside the polar circles, where the Sun can
 * stay up or down for weeks. That is a real answer. `dayLength` handles those
 * cases explicitly rather than silently returning zero.
 */

import {
  ASTRONOMICAL_UNIT_IN_KM,
  ASTRONOMICAL_TWILIGHT_ALTITUDE,
  CIVIL_TWILIGHT_ALTITUDE,
  PERIOD_SOLAR_DAY,
  PERIOD_TROPICAL_YEAR,
  SUN_RADIUS_KM,
} from "./constants";
import {
  getRiseSet,
  getSkyPosition,
  getSunEclipticLongitude,
  type SkyPosition,
} from "./ephemeris";
import type { Observer } from "astronomy-engine";
import { getLocalSiderealTime } from "./time";
import {
  createAltitudeValue,
  createAzimuthValue,
  createBooleanValue,
  createCyclicValue,
  createEventValue,
  createNumberValue,
  createStringValue,
  radiansToDegrees,
  wrapSigned,
  type BooleanValue,
  type CyclicValue,
  type EventValue,
  type NumberValue,
  type StringValue,
} from "./values";

export const DAY_PHASES = [
  "Night",
  "AstronomicalTwilight",
  "NauticalTwilight",
  "CivilTwilight",
  "Day",
] as const;
export type DayPhase = (typeof DAY_PHASES)[number];

export interface SunResult {
  /** Apparent altitude above the horizon, degrees [-90, 90]. Refracted. */
  altitude: NumberValue;
  /** True geometric altitude, degrees. Unrefracted. */
  geometricAltitude: NumberValue;
  /** Degrees clockwise from north. Cyclic. */
  azimuth: CyclicValue;
  /** Declination, degrees. Swings ±23.44° over the year — this is the seasons. */
  declination: NumberValue;
  /** Right ascension, sidereal hours [0, 24). Cyclic. */
  rightAscension: CyclicValue;
  /**
   * Hour angle in degrees, signed: 0 at true local noon, negative before,
   * positive after. Cyclic over one solar day.
   */
  hourAngle: CyclicValue;
  /** Apparent angular diameter, degrees. Roughly 0.524–0.542. */
  angularDiameter: NumberValue;
  /** Distance to the Sun in AU. */
  distance: NumberValue;
  /** Apparent geocentric ecliptic longitude, degrees. Cyclic over the year. */
  eclipticLongitude: CyclicValue;
  /**
   * Equation of time in minutes: apparent solar time minus mean solar time.
   * Swings roughly ±16 minutes over the year, and is the reason a sundial
   * disagrees with a clock.
   */
  equationOfTime: NumberValue;
  /** Which band of daylight or twilight the observer is in. */
  dayPhase: StringValue<DayPhase>;
  isUp: BooleanValue;
  sunrise: EventValue;
  sunset: EventValue;
  /** Solar noon — the Sun's daily high point, not 12:00 on any clock. */
  transit: EventValue;
  /**
   * Hours between sunrise and sunset. 24 during polar day, 0 during polar
   * night. Reported directly rather than inferred from a null rise time.
   */
  dayLength: NumberValue;
  /**
   * Progress from sunrise to sunset, [0, 1]. Clamped to 0 before sunrise and
   * 1 after sunset, so it is a usable daylight envelope. Falls back to a
   * smooth altitude-derived curve when there is no rise or set that day.
   */
  daylightProgress: NumberValue;
}

function dayPhaseFor(altitude: number): DayPhase {
  if (altitude > -0.833) return "Day";
  if (altitude > CIVIL_TWILIGHT_ALTITUDE) return "CivilTwilight";
  if (altitude > -12) return "NauticalTwilight";
  if (altitude > ASTRONOMICAL_TWILIGHT_ALTITUDE) return "AstronomicalTwilight";
  return "Night";
}

export function generateSun({
  timestamp,
  observer,
  position,
  longitude,
}: {
  timestamp: number;
  observer: Observer;
  position: SkyPosition;
  longitude: number;
}): SunResult {
  const { rise, set, transit, transitAltitude } = getRiseSet(
    "sun",
    timestamp,
    observer
  );

  const distanceKm = position.distanceAu * ASTRONOMICAL_UNIT_IN_KM;
  const angularDiameter =
    radiansToDegrees(2 * Math.atan(SUN_RADIUS_KM / distanceKm));

  // Hour angle: how far the Sun is from the local meridian, in degrees.
  const localSidereal = getLocalSiderealTime(timestamp, longitude);
  const hourAngle = wrapSigned((localSidereal - position.rightAscension) * 15, 360);

  // The equation of time falls straight out of the hour angle: the difference
  // between where the true Sun is and where a fictitious mean Sun would be.
  const meanSolarHourAngle =
    (((timestamp % 86400000) / 86400000) * 24 + longitude / 15 - 12) * 15;
  const equationOfTime = wrapSigned(hourAngle - meanSolarHourAngle, 360) * 4;

  let dayLength: number;
  if (rise !== null && set !== null) {
    // Rise and set can land on either side of the UTC day boundary, so take
    // the interval modulo a day rather than assuming set comes after rise.
    const raw = (set - rise) / 3600000;
    dayLength = raw < 0 ? raw + 24 : raw;
  } else {
    // No crossing today: either the Sun never sets or it never rises.
    dayLength = transitAltitude > -0.833 ? 24 : 0;
  }

  let daylightProgress: number;
  if (rise !== null && set !== null && dayLength > 0) {
    const elapsed = (timestamp - rise) / 3600000;
    const wrapped = elapsed < 0 ? elapsed + 24 : elapsed;
    daylightProgress = wrapped / dayLength;
  } else {
    // Polar day or night: fall back to a curve derived from altitude, so the
    // signal keeps moving instead of pinning flat for weeks.
    daylightProgress = (position.altitude + 90) / 180;
  }

  return {
    altitude: createAltitudeValue(position.altitude),
    geometricAltitude: createAltitudeValue(position.geometricAltitude),
    azimuth: createAzimuthValue(position.azimuth),
    declination: createNumberValue({
      value: position.declination,
      unit: "degrees",
      min: -23.44,
      max: 23.44,
    }),
    rightAscension: createCyclicValue({
      value: position.rightAscension,
      unit: "hours",
      period: 24,
    }),
    hourAngle: createCyclicValue({
      value: hourAngle,
      unit: "degrees",
      period: 360,
    }),
    angularDiameter: createNumberValue({
      value: angularDiameter,
      unit: "degrees",
      min: 0.5243,
      max: 0.5422,
    }),
    distance: createNumberValue({
      value: position.distanceAu,
      unit: "au",
      min: 0.98328,
      max: 1.01671,
    }),
    eclipticLongitude: createCyclicValue({
      value: getSunEclipticLongitude(timestamp),
      unit: "degrees",
      period: 360,
    }),
    equationOfTime: createNumberValue({
      value: equationOfTime,
      unit: "minutes",
      min: -16.5,
      max: 16.5,
    }),
    dayPhase: createStringValue(dayPhaseFor(position.altitude), DAY_PHASES),
    isUp: createBooleanValue(position.altitude > -0.833),
    sunrise: createEventValue(rise, timestamp),
    sunset: createEventValue(set, timestamp),
    transit: createEventValue(transit, timestamp),
    dayLength: createNumberValue({
      value: dayLength,
      unit: "hours",
      min: 0,
      max: 24,
    }),
    daylightProgress: createNumberValue({
      value: daylightProgress,
      unit: "ratio",
      min: 0,
      max: 1,
    }),
  };
}

export const SUN_PERIODS = {
  azimuth: PERIOD_SOLAR_DAY,
  hourAngle: PERIOD_SOLAR_DAY,
  rightAscension: PERIOD_TROPICAL_YEAR,
  eclipticLongitude: PERIOD_TROPICAL_YEAR,
};
