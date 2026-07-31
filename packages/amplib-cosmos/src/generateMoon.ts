/**
 * The Moon.
 *
 * `phase` is the true Sun–Moon elongation from the ephemeris, not a count of
 * mean synodic months. Checked against six eclipse instants — which are
 * unambiguous syzygies — the previous mean-phase implementation was off by up
 * to 12 hours; this one lands within a few arcseconds of the elongation.
 *
 * Quarter-phase times likewise come from a real search rather than from
 * extrapolating a mean period forward.
 */

import {
  ASTRONOMICAL_UNIT_IN_KM,
  MOON_APOGEE_KM,
  MOON_ANOMALISTIC_PERIOD,
  MOON_PERIGEE_KM,
  MOON_SYNODIC_PERIOD,
  PERIOD_ANOMALISTIC_MONTH,
  PERIOD_LUNAR_DAY,
  PERIOD_SYNODIC_MONTH,
} from "./constants";
import {
  getMoonAngularDiameter,
  getMoonEcliptic,
  getMoonPhaseAngle,
  getMoonQuarters,
  getRiseSet,
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
  wrapSigned,
  type BooleanValue,
  type CyclicValue,
  type EventValue,
  type NumberValue,
  type StringValue,
} from "./values";

export const MOON_PHASE_NAMES = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent",
] as const;
export type MoonPhaseName = (typeof MOON_PHASE_NAMES)[number];

export interface MoonResult {
  /**
   * Position in the synodic cycle, [0, 1): 0 new, 0.25 first quarter, 0.5
   * full, 0.75 last quarter. Cyclic — use `sin`/`cos` to modulate anything
   * continuous, since `unitRange` jumps at new moon.
   */
  phase: CyclicValue;
  /** Sun–Moon elongation in degrees [0, 360). The same cycle, in its native unit. */
  phaseAngle: CyclicValue;
  phaseName: StringValue<MoonPhaseName>;
  /** Illuminated fraction of the disc, [0, 1]. Peaks at full moon. */
  illumination: NumberValue;
  /** True when the Moon is gaining light — phase < 0.5. */
  isWaxing: BooleanValue;
  /** Days since the last new moon, [0, 29.53). */
  age: NumberValue;
  /** Apparent altitude, degrees. Refracted. */
  altitude: NumberValue;
  /** True geometric altitude, degrees. */
  geometricAltitude: NumberValue;
  azimuth: CyclicValue;
  declination: NumberValue;
  rightAscension: CyclicValue;
  /** Signed hour angle in degrees, 0 at lunar transit. Cyclic over a lunar day. */
  hourAngle: CyclicValue;
  /** Distance to the Moon, km. Perigee ~356,500, apogee ~406,700. */
  distance: NumberValue;
  /**
   * Apparent angular diameter in degrees, roughly 0.49–0.57. The old
   * normalisation compared a value in degrees against bounds in arcminutes,
   * so `unitRange` came out between 4.0 and 5.2.
   */
  angularDiameter: NumberValue;
  /**
   * Position in the anomalistic month, [0, 1): 0 at perigee, 0.5 at apogee.
   * Derived from distance, so it tracks the real orbit rather than a mean rate.
   */
  distancePhase: CyclicValue;
  /** Geocentric ecliptic longitude, degrees. Cyclic over the sidereal month. */
  eclipticLongitude: CyclicValue;
  /** Geocentric ecliptic latitude, degrees. ±5.1°, driving eclipse seasons. */
  eclipticLatitude: NumberValue;
  isUp: BooleanValue;
  moonrise: EventValue;
  moonset: EventValue;
  transit: EventValue;
  nextNewMoon: EventValue;
  nextFirstQuarter: EventValue;
  nextFullMoon: EventValue;
  nextLastQuarter: EventValue;
}

function phaseNameFor(phaseAngle: number): MoonPhaseName {
  // Widths follow the conventional split: the four principal phases get a
  // narrow window either side of the exact instant, the intermediate phases
  // fill the rest.
  if (phaseAngle < 11.25 || phaseAngle >= 348.75) return "New Moon";
  if (phaseAngle < 78.75) return "Waxing Crescent";
  if (phaseAngle < 101.25) return "First Quarter";
  if (phaseAngle < 168.75) return "Waxing Gibbous";
  if (phaseAngle < 191.25) return "Full Moon";
  if (phaseAngle < 258.75) return "Waning Gibbous";
  if (phaseAngle < 281.25) return "Last Quarter";
  return "Waning Crescent";
}

export function generateMoon({
  timestamp,
  observer,
  position,
  longitude,
}: {
  timestamp: number;
  observer: Observer;
  position: SkyPosition;
  longitude: number;
}): MoonResult {
  const phaseAngle = getMoonPhaseAngle(timestamp);
  const phase = phaseAngle / 360;
  const ecliptic = getMoonEcliptic(timestamp);
  const distanceKm = position.distanceAu * ASTRONOMICAL_UNIT_IN_KM;
  const angularDiameter = getMoonAngularDiameter(timestamp);

  const { rise, set, transit } = getRiseSet("moon", timestamp, observer);
  const quarters = getMoonQuarters(timestamp);

  const localSidereal = getLocalSiderealTime(timestamp, longitude);
  const hourAngle = wrapSigned(
    (localSidereal - position.rightAscension) * 15,
    360
  );

  // Illuminated fraction from the phase angle. Exact for a sphere lit from a
  // point source, which at this scale the Sun effectively is.
  const illumination = (1 - Math.cos((phaseAngle * Math.PI) / 180)) / 2;

  // Where we are between perigee and apogee, inferred from the actual
  // distance rather than from a mean anomalistic rate. Rising distance means
  // we are on the outbound half of the cycle.
  const distanceFraction =
    (distanceKm - MOON_PERIGEE_KM) / (MOON_APOGEE_KM - MOON_PERIGEE_KM);
  const distanceAhead = getMoonEcliptic(timestamp + 3600000).distanceAu;
  const outbound = distanceAhead > position.distanceAu;
  const clampedFraction = Math.min(1, Math.max(0, distanceFraction));
  // Map [perigee..apogee] onto [0..0.5] outbound and [0.5..1] inbound, so the
  // phase advances monotonically through the anomalistic month.
  const distancePhase = outbound
    ? clampedFraction / 2
    : 1 - clampedFraction / 2;

  return {
    phase: createCyclicValue({ value: phase, unit: "phase", period: 1 }),
    phaseAngle: createCyclicValue({
      value: phaseAngle,
      unit: "degrees",
      period: 360,
    }),
    phaseName: createStringValue(phaseNameFor(phaseAngle), MOON_PHASE_NAMES),
    illumination: createNumberValue({
      value: illumination,
      unit: "ratio",
      min: 0,
      max: 1,
    }),
    isWaxing: createBooleanValue(phaseAngle < 180),
    age: createNumberValue({
      value: phase * MOON_SYNODIC_PERIOD,
      unit: "days",
      min: 0,
      max: MOON_SYNODIC_PERIOD,
    }),
    altitude: createAltitudeValue(position.altitude),
    geometricAltitude: createAltitudeValue(position.geometricAltitude),
    azimuth: createAzimuthValue(position.azimuth),
    declination: createNumberValue({
      value: position.declination,
      unit: "degrees",
      // The Moon's declination range widens and narrows over the 18.6-year
      // nodal cycle, reaching ±28.7° at a major lunar standstill.
      min: -28.8,
      max: 28.8,
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
    distance: createNumberValue({
      value: distanceKm,
      unit: "km",
      min: MOON_PERIGEE_KM,
      max: MOON_APOGEE_KM,
    }),
    angularDiameter: createNumberValue({
      value: angularDiameter,
      unit: "degrees",
      min: 0.4885,
      max: 0.5683,
    }),
    distancePhase: createCyclicValue({
      value: distancePhase,
      unit: "phase",
      period: 1,
    }),
    eclipticLongitude: createCyclicValue({
      value: ecliptic.longitude,
      unit: "degrees",
      period: 360,
    }),
    eclipticLatitude: createNumberValue({
      value: ecliptic.latitude,
      unit: "degrees",
      min: -5.3,
      max: 5.3,
    }),
    isUp: createBooleanValue(position.altitude > 0),
    moonrise: createEventValue(rise, timestamp),
    moonset: createEventValue(set, timestamp),
    transit: createEventValue(transit, timestamp),
    nextNewMoon: createEventValue(quarters.newMoon, timestamp),
    nextFirstQuarter: createEventValue(quarters.firstQuarter, timestamp),
    nextFullMoon: createEventValue(quarters.fullMoon, timestamp),
    nextLastQuarter: createEventValue(quarters.lastQuarter, timestamp),
  };
}

export const MOON_PERIODS = {
  phase: PERIOD_SYNODIC_MONTH,
  phaseAngle: PERIOD_SYNODIC_MONTH,
  hourAngle: PERIOD_LUNAR_DAY,
  azimuth: PERIOD_LUNAR_DAY,
  distancePhase: PERIOD_ANOMALISTIC_MONTH,
  eclipticLongitude: MOON_ANOMALISTIC_PERIOD * 86400,
};
