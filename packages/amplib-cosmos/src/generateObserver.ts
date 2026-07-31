/**
 * Where and when the observer is.
 *
 * Every value here is a pure function of latitude, longitude, and a UTC
 * timestamp. Nothing consults the host clock or timezone.
 */

import { EARTH_RADIUS_KM, EARTH_ROTATION_PERIOD, PERIOD_SIDEREAL_DAY, PERIOD_SOLAR_DAY } from "./constants";
import {
  getEarthRotationAngle,
  getLocalMeanSolarTime,
  getLocalSiderealTime,
  getGreenwichSiderealTime,
  getJulianDay,
} from "./time";
import {
  createCyclicValue,
  createNumberValue,
  degreesToRadians,
  type CyclicValue,
  type NumberValue,
} from "./values";

export interface ObserverResult {
  latitude: NumberValue;
  longitude: NumberValue;
  elevation: NumberValue;
  /** Local mean solar time, hours [0, 24). Cyclic. */
  solarTime: CyclicValue;
  /** Local mean sidereal time, hours [0, 24). Cyclic. */
  siderealTime: CyclicValue;
  /** Greenwich mean sidereal time, hours [0, 24). Cyclic. */
  greenwichSiderealTime: CyclicValue;
  /** Earth Rotation Angle, degrees [0, 360). Cyclic. IAU 2000 definition. */
  earthRotationAngle: CyclicValue;
  /** Julian Day at this instant. Monotonic, so not cyclic. */
  julianDay: NumberValue;
  /**
   * Eastward speed carried by the Earth's rotation at this latitude, km/h.
   * Maximal at the equator, zero at the poles.
   */
  rotationalVelocity: NumberValue;
}

/** Equatorial rotation speed, km/h. Used as the normalisation ceiling. */
const EQUATORIAL_VELOCITY =
  (2 * Math.PI * EARTH_RADIUS_KM) / EARTH_ROTATION_PERIOD;

export function generateObserver({
  latitude,
  longitude,
  elevation,
  timestamp,
}: {
  latitude: number;
  longitude: number;
  elevation: number;
  timestamp: number;
}): ObserverResult {
  const rotationalVelocity =
    EQUATORIAL_VELOCITY * Math.cos(degreesToRadians(latitude));

  return {
    latitude: createNumberValue({
      value: latitude,
      unit: "degrees",
      min: -90,
      max: 90,
    }),
    longitude: createNumberValue({
      value: longitude,
      unit: "degrees",
      min: -180,
      max: 180,
    }),
    elevation: createNumberValue({
      value: elevation,
      unit: "km",
      min: -0.5,
      max: 9,
    }),
    solarTime: createCyclicValue({
      value: getLocalMeanSolarTime(timestamp, longitude),
      unit: "hours",
      period: 24,
    }),
    siderealTime: createCyclicValue({
      value: getLocalSiderealTime(timestamp, longitude),
      unit: "hours",
      period: 24,
    }),
    greenwichSiderealTime: createCyclicValue({
      value: getGreenwichSiderealTime(timestamp),
      unit: "hours",
      period: 24,
    }),
    earthRotationAngle: createCyclicValue({
      value: getEarthRotationAngle(timestamp),
      unit: "degrees",
      period: 360,
    }),
    julianDay: createNumberValue({
      value: getJulianDay(timestamp),
      unit: "days",
      // J2000.0 through 2100, which is the span the ephemeris is accurate over.
      min: 2451545,
      max: 2488070,
    }),
    rotationalVelocity: createNumberValue({
      value: rotationalVelocity,
      unit: "km/h",
      min: 0,
      max: EQUATORIAL_VELOCITY,
    }),
  };
}

export const OBSERVER_PERIODS = {
  solarTime: PERIOD_SOLAR_DAY,
  siderealTime: PERIOD_SIDEREAL_DAY,
  greenwichSiderealTime: PERIOD_SIDEREAL_DAY,
  earthRotationAngle: PERIOD_SIDEREAL_DAY,
};
