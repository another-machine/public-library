/**
 * The planets.
 *
 * This is the part of the old library that was not an approximation so much as
 * a fabrication. It placed every planet at heliocentric angle zero on
 * 2000-01-01 (no mean longitude at epoch), assumed circular orbits, and then
 * synthesised sky positions as `sunAltitude + 30·sin(...)` and
 * `sunAzimuth + 180·sin(...)`. Jupiter reached altitude 119.9°, Venus sat 73°
 * above New York at noon — 26° beyond its maximum possible elongation from the
 * Sun — and `Math.asin(0.723 / distance)` returned NaN for Venus in 21% of
 * samples, whenever it came inside its own orbital radius of us.
 *
 * Everything here now comes from the ephemeris. Positions are topocentric,
 * corrected for light travel time, parallax, aberration, and refraction.
 */

import {
  ASTRONOMICAL_UNIT_IN_KM,
  CIVIL_TWILIGHT_ALTITUDE,
  MAGNITUDE_BRIGHTEST,
  MAGNITUDE_FAINTEST,
  MAGNITUDE_NAKED_EYE_LIMIT,
  PLANET_DECLINATION_LIMIT,
  PLANET_DOMAINS,
  PLANET_ORBITAL_PERIOD_DAYS,
  PLANET_RADIUS_KM,
} from "./constants";
import {
  getElongation,
  getHeliocentricPosition,
  getIllumination,
  getRiseSet,
  getSkyPosition,
  PLANET_NAMES,
  type PlanetName,
} from "./ephemeris";
import type { Observer } from "astronomy-engine";
import {
  createAltitudeValue,
  createAzimuthValue,
  createBooleanValue,
  createCyclicValue,
  createEventValue,
  createNumberValue,
  createVectorValue,
  radiansToDegrees,
  type BooleanValue,
  type CyclicValue,
  type EventValue,
  type NumberValue,
  type VectorValue,
} from "./values";

export { PLANET_NAMES, type PlanetName };

export interface PlanetResult {
  name: PlanetName;
  /** Apparent altitude, degrees. Refracted. */
  altitude: NumberValue;
  geometricAltitude: NumberValue;
  azimuth: CyclicValue;
  declination: NumberValue;
  rightAscension: CyclicValue;
  /** Apparent visual magnitude. Lower is brighter. */
  magnitude: NumberValue;
  /**
   * Magnitude inverted onto [0, 1] so that 1 is brightest. `magnitude`
   * keeps the astronomical convention where smaller means brighter, which is
   * the wrong way round for driving amplitude — this is the version you
   * actually want to patch into a gain.
   */
  brightness: NumberValue;
  /** Apparent angular diameter, arcseconds. */
  angularDiameter: NumberValue;
  /** Illuminated fraction of the disc, [0, 1]. Meaningful for all planets. */
  phase: NumberValue;
  /** Angular separation from the Sun as seen from Earth, degrees [0, 180]. */
  elongation: NumberValue;
  /** Distance from Earth, AU. */
  distance: NumberValue;
  /** Distance from the Sun, AU. */
  heliocentricDistance: NumberValue;
  /**
   * Heliocentric ecliptic longitude, degrees. Cyclic over the planet's
   * orbital period — this is the signal that carries multi-year structure,
   * and the one to use for angular relationships between planets.
   */
  heliocentricLongitude: CyclicValue;
  /**
   * Heliocentric ecliptic position in AU. `x` points at the March equinox,
   * `z` is perpendicular to the ecliptic, so `(x, y)` is a top-down plot.
   */
  heliocentricPosition: VectorValue;
  isAboveHorizon: BooleanValue;
  /**
   * Above the horizon, brighter than the naked-eye limit, and the sky dark
   * enough to see it. The old `isVisible` checked only the first two, so all
   * seven planets reported visible at local noon.
   */
  isVisible: BooleanValue;
  rise: EventValue;
  set: EventValue;
  transit: EventValue;
  /** Nominal orbital period in days. Constant; useful for the timescale layer. */
  orbitalPeriodDays: number;
}

export type PlanetsResult = Record<PlanetName, PlanetResult>;

function generatePlanet(
  name: PlanetName,
  timestamp: number,
  observer: Observer,
  sunAltitude: number
): PlanetResult {
  const position = getSkyPosition(name, timestamp, observer);
  const illumination = getIllumination(name, timestamp);
  const heliocentric = getHeliocentricPosition(name, timestamp);
  const elongation = getElongation(name, timestamp);
  const { rise, set, transit } = getRiseSet(name, timestamp, observer);
  const domain = PLANET_DOMAINS[name];

  const distanceKm = position.distanceAu * ASTRONOMICAL_UNIT_IN_KM;
  const angularDiameter =
    radiansToDegrees(2 * Math.atan(PLANET_RADIUS_KM[name] / distanceKm)) * 3600;

  const isAboveHorizon = position.altitude > 0;
  const isVisible =
    isAboveHorizon &&
    illumination.magnitude < MAGNITUDE_NAKED_EYE_LIMIT &&
    sunAltitude < CIVIL_TWILIGHT_ALTITUDE;

  // Two normalisations of the same number, for two different jobs.
  //
  // `magnitude` uses one scale spanning every planet, so its `unitRange` is
  // comparable across bodies — Venus really is brighter than Neptune, and the
  // numbers say so. `brightness` normalises each planet against its own
  // observed range, so every planet's variation fills [0, 1] and is usable as
  // a control signal. On the shared scale Uranus only ever moves through 5% of
  // the range, which is true but useless to patch into a gain.
  const magnitudeValue = createNumberValue({
    value: illumination.magnitude,
    unit: "magnitude",
    min: MAGNITUDE_BRIGHTEST,
    max: MAGNITUDE_FAINTEST,
  });
  const ownScale = createNumberValue({
    value: illumination.magnitude,
    unit: "magnitude",
    min: domain.minMagnitude,
    max: domain.maxMagnitude,
  });

  // Angular size bounds follow from the distance bounds — nearest gives the
  // largest disc — so there is nothing extra to tabulate.
  const angularDiameterAt = (distanceAu: number) =>
    radiansToDegrees(
      2 * Math.atan(PLANET_RADIUS_KM[name] / (distanceAu * ASTRONOMICAL_UNIT_IN_KM))
    ) * 3600;

  return {
    name,
    altitude: createAltitudeValue(position.altitude),
    geometricAltitude: createAltitudeValue(position.geometricAltitude),
    azimuth: createAzimuthValue(position.azimuth),
    declination: createNumberValue({
      value: position.declination,
      unit: "degrees",
      min: -PLANET_DECLINATION_LIMIT,
      max: PLANET_DECLINATION_LIMIT,
    }),
    rightAscension: createCyclicValue({
      value: position.rightAscension,
      unit: "hours",
      period: 24,
    }),
    magnitude: magnitudeValue,
    brightness: {
      ...ownScale,
      unitRange: 1 - ownScale.unitRange,
      bipolarRange: -ownScale.bipolarRange,
    },
    angularDiameter: createNumberValue({
      value: angularDiameter,
      unit: "arcseconds",
      min: angularDiameterAt(domain.maxGeocentric),
      max: angularDiameterAt(domain.minGeocentric),
    }),
    phase: createNumberValue({
      value: illumination.phaseFraction,
      unit: "ratio",
      min: domain.minPhase,
      max: 1,
    }),
    elongation: createNumberValue({
      value: elongation,
      unit: "degrees",
      min: 0,
      max: 180,
    }),
    distance: createNumberValue({
      value: position.distanceAu,
      unit: "au",
      min: domain.minGeocentric,
      max: domain.maxGeocentric,
    }),
    heliocentricDistance: createNumberValue({
      value: illumination.heliocentricDistanceAu,
      unit: "au",
      min: domain.perihelion,
      max: domain.aphelion,
    }),
    heliocentricLongitude: createCyclicValue({
      value: heliocentric.longitude,
      unit: "degrees",
      period: 360,
    }),
    heliocentricPosition: createVectorValue(heliocentric, "au"),
    isAboveHorizon: createBooleanValue(isAboveHorizon),
    isVisible: createBooleanValue(isVisible),
    rise: createEventValue(rise, timestamp),
    set: createEventValue(set, timestamp),
    transit: createEventValue(transit, timestamp),
    orbitalPeriodDays: PLANET_ORBITAL_PERIOD_DAYS[name],
  };
}

export function generatePlanets({
  timestamp,
  observer,
  sunAltitude,
}: {
  timestamp: number;
  observer: Observer;
  sunAltitude: number;
}): PlanetsResult {
  const result = {} as PlanetsResult;
  for (const name of PLANET_NAMES) {
    // No try/catch here. The old version wrapped each planet and logged to the
    // console on failure, which silently dropped keys from the result object
    // and left consumers reading `undefined.value`. If the ephemeris throws,
    // that is a bug worth surfacing.
    result[name] = generatePlanet(name, timestamp, observer, sunAltitude);
  }
  return result;
}
