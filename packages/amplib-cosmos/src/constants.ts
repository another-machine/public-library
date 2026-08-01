/**
 * Physical and orbital constants.
 *
 * Values are IAU / NASA fact-sheet figures. Anything that varies over time
 * (planet positions, lunar distance, solar declination) is *not* here — it
 * comes from the ephemeris at evaluation time.
 */

export const ASTRONOMICAL_UNIT_IN_KM = 149597870.7; // km (1 AU, exact by definition)

export const EARTH_AXIAL_TILT = 23.4392911; // degrees at J2000.0
export const EARTH_MEAN_SOLAR_DAY = 24.0; // hours
export const EARTH_ORBITAL_ECCENTRICITY = 0.0167086;
export const EARTH_ORBITAL_PERIOD = 365.256363004; // days (sidereal year)
export const EARTH_RADIUS_KM = 6371.0084; // km (volumetric mean)
export const EARTH_EQUATORIAL_RADIUS_KM = 6378.137; // km
export const EARTH_ROTATION_PERIOD = 23.9344695944; // hours (sidereal day)
export const EARTH_SUN_MEAN_DISTANCE_KM = 149597870.7; // km (1 AU)

/** Earth–Sun distance extremes, used to normalize `earth.distanceFromSun`. */
export const EARTH_PERIHELION_KM = 147098074; // km
export const EARTH_APHELION_KM = 152097701; // km

export const MOON_RADIUS_KM = 1737.4; // km
export const MOON_SYNODIC_PERIOD = 29.530588861; // days (new moon to new moon)
export const MOON_SIDEREAL_PERIOD = 27.321661; // days
export const MOON_ANOMALISTIC_PERIOD = 27.554549; // days (perigee to perigee)
export const MOON_DRACONIC_PERIOD = 27.212221; // days (node to node)

/** Lunar distance extremes, used to normalize `moon.distance`. */
export const MOON_PERIGEE_KM = 356500; // km
export const MOON_APOGEE_KM = 406700; // km

export const SUN_RADIUS_KM = 695700; // km

export const J2000_EPOCH = Date.UTC(2000, 0, 1, 12, 0, 0);

export const MILLISECONDS_PER_DAY = 86400000;
export const SECONDS_PER_DAY = 86400;

/**
 * Nominal periods, in seconds, for each timescale band. These describe how
 * fast a signal moves, which is what a composer needs in order to decide
 * whether it should drive rhythm, harmony, or long-form structure.
 */
export const PERIOD_SIDEREAL_DAY = EARTH_ROTATION_PERIOD * 3600;
export const PERIOD_SOLAR_DAY = 86400;
export const PERIOD_LUNAR_DAY = 89428; // mean interval between moonrises (~24h50m)
export const PERIOD_SEMIDIURNAL_TIDE = PERIOD_LUNAR_DAY / 2;
export const PERIOD_SYNODIC_MONTH = MOON_SYNODIC_PERIOD * 86400;
export const PERIOD_ANOMALISTIC_MONTH = MOON_ANOMALISTIC_PERIOD * 86400;
export const PERIOD_TROPICAL_YEAR = 365.24219 * 86400;

/**
 * Equatorial radii in km, for apparent-size calculations. The ephemeris gives
 * us distance; size has to come from somewhere.
 */
export const PLANET_RADIUS_KM: Record<string, number> = {
  mercury: 2440.5,
  venus: 6051.8,
  mars: 3396.2,
  jupiter: 71492,
  saturn: 60268,
  uranus: 25559,
  neptune: 24764,
};

/**
 * Sidereal orbital periods in days. Only used to report each planet's nominal
 * cycle length to the timescale layer — positions always come from the
 * ephemeris, never from these.
 */
export const PLANET_ORBITAL_PERIOD_DAYS: Record<string, number> = {
  mercury: 87.969,
  venus: 224.701,
  mars: 686.98,
  jupiter: 4332.589,
  saturn: 10759.22,
  uranus: 30685.4,
  neptune: 60189,
};

/**
 * Per-planet normalization domains.
 *
 * Normalizing every planet against a single solar-system-wide range is
 * technically in-contract but useless in practice: Venus's orbit is so nearly
 * circular that its heliocentric distance would occupy 0.03% of a 0–31 AU
 * scale and read as a constant. Each planet gets its own domain instead, so
 * every one of these produces a control signal that actually swings.
 *
 *   perihelion / aphelion  — extremes of distance from the Sun, AU
 *   minGeocentric / maxGeocentric — extremes of distance from Earth, AU,
 *     taken as (planet perihelion − Earth aphelion) to (planet aphelion +
 *     Earth aphelion)
 *   minPhase — smallest illuminated fraction visible from Earth. The outer
 *     planets are always nearly fully lit, so their range is genuinely narrow;
 *     stating it honestly is better than stretching it.
 */
export interface PlanetDomain {
  perihelion: number;
  aphelion: number;
  minGeocentric: number;
  maxGeocentric: number;
  minPhase: number;
  /** Brightest and faintest this planet ever gets, apparent magnitude. */
  minMagnitude: number;
  maxMagnitude: number;
}

export const PLANET_DOMAINS: Record<string, PlanetDomain> = {
  mercury: {
    perihelion: 0.307499,
    aphelion: 0.466697,
    minGeocentric: 0.517,
    maxGeocentric: 1.484,
    minPhase: 0,
    minMagnitude: -2.5,
    maxMagnitude: 7.3,
  },
  venus: {
    perihelion: 0.71844,
    aphelion: 0.728213,
    minGeocentric: 0.255,
    maxGeocentric: 1.745,
    minPhase: 0,
    minMagnitude: -4.92,
    maxMagnitude: -2.9,
  },
  mars: {
    perihelion: 1.381497,
    aphelion: 1.6661,
    minGeocentric: 0.365,
    maxGeocentric: 2.683,
    minPhase: 0.83,
    minMagnitude: -2.94,
    maxMagnitude: 1.86,
  },
  jupiter: {
    perihelion: 4.950429,
    aphelion: 5.458104,
    minGeocentric: 3.934,
    maxGeocentric: 6.475,
    minPhase: 0.988,
    minMagnitude: -2.94,
    maxMagnitude: -1.6,
  },
  saturn: {
    perihelion: 9.024358,
    aphelion: 10.086,
    minGeocentric: 8.008,
    maxGeocentric: 11.103,
    minPhase: 0.996,
    minMagnitude: -0.55,
    maxMagnitude: 1.5,
  },
  uranus: {
    perihelion: 18.324,
    aphelion: 20.078,
    minGeocentric: 17.307,
    maxGeocentric: 21.095,
    minPhase: 0.9993,
    minMagnitude: 5.32,
    maxMagnitude: 6.03,
  },
  neptune: {
    perihelion: 29.81,
    aphelion: 30.33,
    minGeocentric: 28.793,
    maxGeocentric: 31.347,
    minPhase: 0.9998,
    minMagnitude: 7.67,
    maxMagnitude: 8.0,
  },
};

/**
 * Declination bound for the planets. They stay near the ecliptic, so ±23.44°
 * of obliquity plus the largest orbital inclination (Mercury's 7°) covers
 * every case with room to spare. Normalizing over ±90° like a star would
 * waste two-thirds of the range.
 */
export const PLANET_DECLINATION_LIMIT = 32;

/**
 * Apparent-magnitude extremes, used to normalize brightness onto a common
 * scale so planets stay comparable to one another.
 */
export const MAGNITUDE_BRIGHTEST = -4.92; // Venus at greatest brilliancy
export const MAGNITUDE_FAINTEST = 8.0; // Neptune near conjunction

/** Naked-eye limit, used by `isVisible`. */
export const MAGNITUDE_NAKED_EYE_LIMIT = 6.5;

/**
 * Solar altitude below which the sky is dark enough to pick out planets.
 * -6° is civil twilight, -18° is astronomical night.
 */
export const CIVIL_TWILIGHT_ALTITUDE = -6;
export const ASTRONOMICAL_TWILIGHT_ALTITUDE = -18;
