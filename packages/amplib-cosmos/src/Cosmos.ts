/**
 * Type definitions for consistent value reporting
 */

// Base type for all astronomical values with description
export interface AstronomicalValue<T> {
  value: T;
  description: string;
}

// Specialized types for common value types
export type NumberValue = AstronomicalValue<number>;
export type StringValue = AstronomicalValue<string>;
export type DateValue = AstronomicalValue<Date | null>;
export type BooleanValue = AstronomicalValue<boolean>;
export type Position3DValue = AstronomicalValue<{
  x: number;
  y: number;
  z: number;
}>;

// Type for date input, which can be either a Date object or a timestamp number
export type DateInput = Date | number;

// Type for the Moon phase description strings
export type MoonPhaseDescription =
  | "New Moon"
  | "Waxing Crescent"
  | "First Quarter"
  | "Waxing Gibbous"
  | "Full Moon"
  | "Waning Gibbous"
  | "Last Quarter"
  | "Waning Crescent";

// Type for the Northern/Southern Hemisphere season names
export type Season = "Spring" | "Summer" | "Fall" | "Winter";

/**
 * Constants
 */

// Earth-related constants
const EARTH_RADIUS_KM = 6371.0; // km
const EARTH_AXIAL_TILT = 23.44; // degrees
const EARTH_ORBITAL_PERIOD = 365.256363004; // days
const EARTH_ROTATION_PERIOD = 23.9344696; // hours (sidereal day)
const EARTH_MEAN_SOLAR_DAY = 24.0; // hours

// Sun-related constants
const SUN_RADIUS_KM = 696340; // km
const EARTH_SUN_MEAN_DISTANCE_KM = 149597870.7; // km (1 AU)
const EARTH_ORBITAL_ECCENTRICITY = 0.0167086;

// Moon-related constants
const MOON_RADIUS_KM = 1737.4; // km
const MOON_MEAN_DISTANCE_KM = 384400; // km
const MOON_ORBITAL_PERIOD = 27.321661; // days (sidereal month)
export const MOON_SYNODIC_PERIOD = 29.530589; // days (between new moons)
const MOON_ORBITAL_INCLINATION = 5.145; // degrees

// Time constants
const MILLISECONDS_PER_DAY = 86400000;
export const J2000_EPOCH = new Date("2000-01-01T12:00:00Z").getTime();

// Stellar and galactic constants
const SPEED_OF_LIGHT = 299792.458; // km/s
const PARSEC_IN_KM = 3.0857e13; // km
const LIGHT_YEAR_IN_KM = 9.461e12; // km
const ASTRONOMICAL_UNIT_IN_KM = 149597870.7; // km (1 AU)
const SOLAR_MASS = 1.989e30; // kg
const SOLAR_LUMINOSITY = 3.828e26; // watts
const SOLAR_RADIUS = 695700; // km

// Milky Way constants
const MILKY_WAY_CENTER_DISTANCE = 8.178; // kpc (kiloparsecs)
const MILKY_WAY_ORBITAL_PERIOD = 225e6; // years
const MILKY_WAY_ROTATION_VELOCITY = 220; // km/s

// Universe constants
const HUBBLE_CONSTANT = 67.4; // (km/s)/Mpc
const UNIVERSE_AGE = 13.787e9; // years

/**
 * Helper functions for creating value objects with descriptions
 */
export function createNumberValue(
  value: number,
  description: string
): NumberValue {
  return { value, description };
}

export function createStringValue(
  value: string,
  description: string
): StringValue {
  return { value, description };
}

export function createDateValue(
  value: Date | null,
  description: string
): DateValue {
  return { value, description };
}

export function createBooleanValue(
  value: boolean,
  description: string
): BooleanValue {
  return { value, description };
}

export function createPosition3DValue(
  value: { x: number; y: number; z: number },
  description: string
): Position3DValue {
  return { value, description };
}

/**
 * Format a number value with appropriate units for display
 */
export function formatWithUnits(
  value: number,
  units: string,
  precision: number = 2
): string {
  return `${value.toFixed(precision)} ${units}`;
}

/**
 * Format date for human readability
 */
export function formatDate(date: Date | null): string {
  if (!date) return "Not applicable";
  return date.toLocaleString();
}

interface PlanetInfo {
  name: StringValue;
  isVisible: BooleanValue;
  altitude: NumberValue;
  azimuth: NumberValue;
  magnitude: NumberValue;
  angularDiameter: NumberValue;
  phase: NumberValue | null;
}

/**
 * Main astronomical report interface
 */
export interface AstronomicalReport {
  timestamp: NumberValue;
  date: StringValue;
  observer: {
    latitude: NumberValue;
    longitude: NumberValue;
    localTime: StringValue;
    siderealTime: NumberValue;
  };
  earth: {
    rotationAngle: NumberValue;
    orbitalPosition: NumberValue;
    distanceFromSun: NumberValue;
    season: StringValue;
    orbitalVelocity: NumberValue;
  };
  sun: {
    elevation: NumberValue;
    azimuth: NumberValue;
    angularDiameter: NumberValue;
    sunrise: DateValue;
    sunset: DateValue;
    dayLength: NumberValue;
  };
  moon: {
    phase: NumberValue;
    phaseDescription: StringValue;
    illuminationPercent: NumberValue;
    age: NumberValue; // Days since new moon
    distance: NumberValue;
    angularDiameter: NumberValue;
    altitude: NumberValue;
    azimuth: NumberValue;
    nextFullMoon: DateValue;
    nextNewMoon: DateValue;
    tidalForce: NumberValue;
  };
  planets: {
    [key: string]: PlanetInfo;
  };
  deepSpace: {
    milkyWayVisibility: NumberValue; // 0-1 scale
    galacticPosition: NumberValue;
    relativisticEffects: {
      earthTimeDilation: NumberValue;
      gravitationalTimeDilation: NumberValue;
    };
  };
  observingConditions: {
    skyBrightness: NumberValue;
    moonInterference: NumberValue;
    bestTargets: StringValue;
  };
}

/**
 * Main function to generate a comprehensive astronomical report
 */
export function getAstronomicalReport({
  latitude = 0,
  longitude = 0,
  date = Date.now(),
}: {
  latitude: number;
  longitude: number;
  date: DateInput;
}): AstronomicalReport {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const dateObj = new Date(timestamp);

  // Create the report
  const report: AstronomicalReport = {
    timestamp: createNumberValue(timestamp, "Unix timestamp in milliseconds"),
    date: createStringValue(
      dateObj.toISOString(),
      "ISO 8601 formatted date and time"
    ),
    observer: getObserverInfo(latitude, longitude, timestamp),
    earth: getEarthInfo(timestamp, latitude),
    sun: getSunInfo(latitude, longitude, timestamp),
    moon: getMoonInfo(latitude, longitude, timestamp),
    planets: getPlanetsInfo(latitude, longitude, timestamp),
    deepSpace: getDeepSpaceInfo(timestamp, latitude),
    observingConditions: getObservingConditionsInfo(
      latitude,
      longitude,
      timestamp
    ),
  };

  return report;
}

/**
 * Get observer-related information
 */
function getObserverInfo(
  latitude: number,
  longitude: number,
  timestamp: number
): {
  latitude: NumberValue;
  longitude: NumberValue;
  localTime: StringValue;
  siderealTime: NumberValue;
} {
  const dateObj = new Date(timestamp);

  return {
    latitude: createNumberValue(
      latitude,
      `Observer's latitude: ${formatWithUnits(latitude, "degrees")}`
    ),
    longitude: createNumberValue(
      longitude,
      `Observer's longitude: ${formatWithUnits(longitude, "degrees")}`
    ),
    localTime: createStringValue(
      dateObj.toLocaleString(),
      "Local time at observer's location"
    ),
    siderealTime: createNumberValue(
      getSiderealTime(timestamp) + longitude / 15,
      `Local sidereal time: ${formatWithUnits(
        (getSiderealTime(timestamp) + longitude / 15) % 24,
        "hours"
      )}`
    ),
  };
}

/**
 * Get Earth-related information
 */
function getEarthInfo(
  timestamp: number,
  latitude: number
): {
  rotationAngle: NumberValue;
  orbitalPosition: NumberValue;
  distanceFromSun: NumberValue;
  season: StringValue;
  orbitalVelocity: NumberValue;
} {
  return {
    rotationAngle: createNumberValue(
      getEarthRotationAngle(timestamp),
      "Earth's rotation angle in degrees (0-360)"
    ),
    orbitalPosition: createNumberValue(
      getEarthOrbitalPosition(timestamp),
      "Earth's position in its orbit as angle from perihelion in degrees"
    ),
    distanceFromSun: createNumberValue(
      getEarthSunDistance(timestamp),
      `Distance from Earth to Sun: ${formatWithUnits(
        getEarthSunDistance(timestamp) / 1000000,
        "million km"
      )}`
    ),
    season: createStringValue(
      latitude >= 0
        ? getNorthernHemisphereSeason(timestamp)
        : getSouthernHemisphereSeason(timestamp),
      `Current season in the ${
        latitude >= 0 ? "Northern" : "Southern"
      } Hemisphere`
    ),
    orbitalVelocity: createNumberValue(
      getEarthOrbitalVelocity(timestamp),
      `Earth's orbital velocity: ${formatWithUnits(
        getEarthOrbitalVelocity(timestamp),
        "km/s"
      )}`
    ),
  };
}

/**
 * Get Sun-related information
 */
function getSunInfo(
  latitude: number,
  longitude: number,
  timestamp: number
): {
  elevation: NumberValue;
  azimuth: NumberValue;
  angularDiameter: NumberValue;
  sunrise: DateValue;
  sunset: DateValue;
  dayLength: NumberValue;
} {
  return {
    elevation: createNumberValue(
      getSolarElevation(latitude, longitude, timestamp),
      `Solar elevation angle: ${formatWithUnits(
        getSolarElevation(latitude, longitude, timestamp),
        "degrees"
      )}`
    ),
    azimuth: createNumberValue(
      getSolarAzimuth(latitude, longitude, timestamp),
      `Solar azimuth angle: ${formatWithUnits(
        getSolarAzimuth(latitude, longitude, timestamp),
        "degrees"
      )}`
    ),
    angularDiameter: createNumberValue(
      getSolarAngularDiameter(timestamp),
      `Solar angular diameter: ${formatWithUnits(
        getSolarAngularDiameter(timestamp),
        "degrees"
      )}`
    ),
    sunrise: createDateValue(
      getSunrise(latitude, longitude, timestamp),
      `Sunrise time: ${formatDate(getSunrise(latitude, longitude, timestamp))}`
    ),
    sunset: createDateValue(
      getSunset(latitude, longitude, timestamp),
      `Sunset time: ${formatDate(getSunset(latitude, longitude, timestamp))}`
    ),
    dayLength: createNumberValue(
      getDayLength(latitude, longitude, timestamp) || 0,
      `Day length: ${formatWithUnits(
        getDayLength(latitude, longitude, timestamp) || 0,
        "hours"
      )}`
    ),
  };
}

/**
 * Get Moon-related information
 */
function getMoonInfo(
  latitude: number,
  longitude: number,
  timestamp: number
): {
  phase: NumberValue;
  phaseDescription: StringValue;
  illuminationPercent: NumberValue;
  age: NumberValue;
  distance: NumberValue;
  angularDiameter: NumberValue;
  altitude: NumberValue;
  azimuth: NumberValue;
  nextFullMoon: DateValue;
  nextNewMoon: DateValue;
  tidalForce: NumberValue;
} {
  return {
    phase: createNumberValue(
      getMoonPhase(timestamp),
      "Moon phase value (0-1, where 0=new moon, 0.5=full moon)"
    ),
    phaseDescription: createStringValue(
      getMoonPhaseDescription(timestamp),
      "Descriptive name of the current moon phase"
    ),
    illuminationPercent: createNumberValue(
      getMoonIllumination(timestamp),
      `Percentage of Moon illuminated: ${formatWithUnits(
        getMoonIllumination(timestamp),
        "%"
      )}`
    ),
    age: createNumberValue(
      getMoonPhase(timestamp) * MOON_SYNODIC_PERIOD,
      `Moon age: ${(getMoonPhase(timestamp) * MOON_SYNODIC_PERIOD).toFixed(
        1
      )} days since new moon`
    ),
    distance: createNumberValue(
      getMoonDistance(timestamp),
      `Distance from Earth to Moon: ${formatWithUnits(
        getMoonDistance(timestamp),
        "km"
      )}`
    ),
    angularDiameter: createNumberValue(
      getLunarAngularDiameter(timestamp),
      `Moon's apparent diameter in sky: ${formatWithUnits(
        getLunarAngularDiameter(timestamp),
        "degrees"
      )}`
    ),
    altitude: createNumberValue(
      getMoonAltitude(latitude, longitude, timestamp),
      `Moon's altitude: ${formatWithUnits(
        getMoonAltitude(latitude, longitude, timestamp),
        "degrees"
      )}`
    ),
    azimuth: createNumberValue(
      getMoonAzimuth(latitude, longitude, timestamp),
      `Moon's azimuth: ${formatWithUnits(
        getMoonAzimuth(latitude, longitude, timestamp),
        "degrees"
      )}`
    ),
    nextFullMoon: createDateValue(
      getNextFullMoon(timestamp),
      `Next full moon: ${formatDate(getNextFullMoon(timestamp))}`
    ),
    nextNewMoon: createDateValue(
      getNextNewMoon(timestamp),
      `Next new moon: ${formatDate(getNextNewMoon(timestamp))}`
    ),
    tidalForce: createNumberValue(
      getLunarTidalForce(latitude, longitude, timestamp),
      "Relative lunar tidal force (0-1 scale)"
    ),
  };
}

/**
 * Get information about planets
 */
function getPlanetsInfo(
  latitude: number,
  longitude: number,
  timestamp: number
): {
  [key: string]: PlanetInfo;
} {
  const planetNames = [
    "Mercury",
    "Venus",
    "Mars",
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
  ];

  const details: {
    [key: string]: PlanetInfo;
  } = {};

  for (const planet of planetNames) {
    try {
      const visibility = getPlanetVisibility(
        planet,
        latitude,
        longitude,
        timestamp
      );

      details[planet.toLowerCase()] = {
        name: createStringValue(planet, `The name of the planet is ${planet}`),
        isVisible: createBooleanValue(
          visibility.isVisible,
          visibility.isVisible
            ? `${planet} is visible`
            : `${planet} is not visible`
        ),
        altitude: createNumberValue(
          visibility.altitude,
          `Altitude above horizon: ${formatWithUnits(
            visibility.altitude,
            "degrees"
          )}`
        ),
        azimuth: createNumberValue(
          visibility.azimuth,
          `Azimuth: ${formatWithUnits(visibility.azimuth, "degrees")}`
        ),
        magnitude: createNumberValue(
          visibility.magnitude,
          `Apparent magnitude: ${visibility.magnitude.toFixed(1)}`
        ),
        angularDiameter: createNumberValue(
          visibility.angularDiameter,
          `Angular diameter: ${formatWithUnits(
            visibility.angularDiameter,
            "arcseconds"
          )}`
        ),
        phase:
          planet === "Mercury" || planet === "Venus"
            ? createNumberValue(
                visibility.phase,
                `Illuminated fraction: ${(visibility.phase * 100).toFixed(0)}%`
              )
            : null,
      };
    } catch (error) {
      console.error(`Error calculating visibility for ${planet}:`, error);
    }
  }

  return details;
}

/**
 * Get deep space related information
 */
function getDeepSpaceInfo(
  timestamp: number,
  latitude: number
): {
  milkyWayVisibility: NumberValue;
  galacticPosition: NumberValue;
  relativisticEffects: {
    earthTimeDilation: NumberValue;
    gravitationalTimeDilation: NumberValue;
  };
} {
  const dateObj = new Date(timestamp);
  const earthOrbitalVelocity = getEarthOrbitalVelocity(timestamp);

  // Calculate Milky Way visibility based on date and location
  const month = dateObj.getMonth(); // 0-11
  let seasonFactor = 0;

  if (latitude >= 0) {
    // Northern Hemisphere
    if (month >= 4 && month <= 9) {
      // Summer months
      seasonFactor = 1.0;
    } else if (month === 3 || month === 10) {
      // Spring/Fall
      seasonFactor = 0.7;
    } else {
      // Winter
      seasonFactor = 0.3;
    }
  } else {
    // Southern Hemisphere (inverted seasons)
    if (month >= 10 || month <= 3) {
      // Summer months
      seasonFactor = 1.0;
    } else if (month === 4 || month === 9) {
      // Spring/Fall
      seasonFactor = 0.7;
    } else {
      // Winter
      seasonFactor = 0.3;
    }
  }

  const skyBrightness = calculateSkyBrightness(latitude, timestamp);
  const visibilityFactor = (1 - skyBrightness) * seasonFactor;

  let milkyWayDescription = "";
  if (visibilityFactor > 0.7) {
    milkyWayDescription =
      "Excellent Milky Way visibility, with detailed structure visible";
  } else if (visibilityFactor > 0.4) {
    milkyWayDescription = "Milky Way should be visible with good contrast";
  } else if (visibilityFactor > 0.2) {
    milkyWayDescription =
      "Milky Way may be faintly visible under good conditions";
  } else {
    milkyWayDescription =
      "Milky Way unlikely to be visible due to sky conditions or season";
  }

  return {
    milkyWayVisibility: createNumberValue(
      visibilityFactor,
      milkyWayDescription
    ),
    galacticPosition: createNumberValue(
      getGalacticYearProgress(timestamp),
      `Progress through current galactic year: ${(
        getGalacticYearProgress(timestamp) * 100
      ).toFixed(4)}%`
    ),
    relativisticEffects: {
      earthTimeDilation: createNumberValue(
        getRelativisticTimeDilation(earthOrbitalVelocity),
        `Relativistic time dilation due to Earth's orbital velocity: ${formatWithUnits(
          (getRelativisticTimeDilation(earthOrbitalVelocity) - 1) * 1e9,
          "nanoseconds per second"
        )}`
      ),
      gravitationalTimeDilation: createNumberValue(
        getGravitationalTimeDilation(1, 150e6),
        `Gravitational time dilation at Earth's distance from the Sun: ${(
          (1 - getGravitationalTimeDilation(1, 150e6)) *
          1e9
        ).toFixed(2)} nanoseconds per second`
      ),
    },
  };
}

/**
 * Get observing conditions information
 */
function getObservingConditionsInfo(
  latitude: number,
  longitude: number,
  timestamp: number
): {
  skyBrightness: NumberValue;
  moonInterference: NumberValue;
  bestTargets: StringValue;
} {
  const moonPhase = getMoonPhase(timestamp);
  const moonAltitude = getMoonAltitude(latitude, longitude, timestamp);
  const moonUp = moonAltitude > 0;

  // Calculate sky brightness
  const skyBrightness = calculateSkyBrightness(latitude, timestamp);

  // Calculate moon interference
  let interference = 0;
  if (moonUp) {
    // Moon above horizon causes interference based on phase
    interference = moonPhase * 0.8 + 0.2;
  } else {
    // Moon below horizon causes minimal interference
    interference = 0.1;
  }

  let interferenceDescription = "";
  if (interference > 0.7) {
    interferenceDescription =
      "Significant moonlight interference with deep sky observing";
  } else if (interference > 0.4) {
    interferenceDescription = "Moderate moonlight affecting dimmer objects";
  } else {
    interferenceDescription = "Minimal moon interference with observing";
  }

  // Recommend best targets
  const planetInfo = getPlanetsInfo(latitude, longitude, timestamp);
  const visiblePlanets = Object.values(planetInfo).flatMap((planet) =>
    planet.isVisible.value ? planet.name.value : []
  );

  let recommendation = "";

  // Add planet recommendations
  if (visiblePlanets.length > 0) {
    recommendation += `Planets: ${visiblePlanets.join(", ")}. `;
  }

  // Add deep sky recommendations based on sky brightness
  if (skyBrightness < 0.3) {
    recommendation +=
      "Excellent conditions for deep sky observing. Consider galaxies, nebulae, and globular clusters. ";
  } else if (skyBrightness < 0.6) {
    recommendation +=
      "Good conditions for brighter deep sky objects like the Orion Nebula, Andromeda Galaxy, and bright star clusters. ";
  } else {
    recommendation +=
      "Limited deep sky visibility. Focus on bright targets like open clusters, double stars, and planets. ";
  }

  return {
    skyBrightness: createNumberValue(
      skyBrightness,
      skyBrightness < 0.3
        ? "Excellent dark sky conditions"
        : skyBrightness < 0.6
        ? "Moderate sky brightness"
        : "Bright skies limit deep sky observing"
    ),
    moonInterference: createNumberValue(interference, interferenceDescription),
    bestTargets: createStringValue(
      recommendation,
      "Recommended observing targets"
    ),
  };
}

/**
 * Calculate sky brightness (0-1 scale)
 */
function calculateSkyBrightness(latitude: number, timestamp: number): number {
  const dateObj = new Date(timestamp);
  const moonPhase = getMoonPhase(timestamp);
  const sunAltitude = getSolarElevation(latitude, 0, timestamp);
  const moonAltitude = getMoonAltitude(latitude, 0, timestamp);

  let skyBrightness = 0;

  if (sunAltitude > -12) {
    // Twilight or daytime
    skyBrightness = Math.max(0, Math.min(1, (sunAltitude + 18) / 18));
  } else {
    // Night time - moon is the primary factor
    if (moonAltitude > 0) {
      // Moon is up - calculate brightness based on phase and altitude
      skyBrightness = moonPhase * (moonAltitude / 90) * 0.7;
    } else {
      // Moon is down - darkest skies
      skyBrightness = 0.05; // Light pollution minimum
    }
  }

  return skyBrightness;
}

/**
 * =======================================================
 * CORE ASTRONOMICAL CALCULATION FUNCTIONS
 * =======================================================
 */

/**
 * Calculate the Julian Day for a given date
 */
function getJulianDay(date: DateInput): number {
  const timestamp = date instanceof Date ? date.getTime() : date;
  return (timestamp - J2000_EPOCH) / MILLISECONDS_PER_DAY + 2451545.0;
}

/**
 * Calculate Earth's rotation angle at a given time
 */
function getEarthRotationAngle(date: DateInput): number {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const dateObj = new Date(timestamp);

  // Calculate how many hours have passed in the day (UTC)
  const hours = dateObj.getUTCHours();
  const minutes = dateObj.getUTCMinutes();
  const seconds = dateObj.getUTCSeconds();
  const milliseconds = dateObj.getUTCMilliseconds();

  const dayFraction =
    (hours + minutes / 60 + seconds / 3600 + milliseconds / 3600000) / 24;

  // Calculate rotation angle (360 degrees = full rotation)
  return (dayFraction * 360) % 360;
}

/**
 * Calculate day of year (1-366)
 */
function getDayOfYear(date: DateInput): number {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const dateObj = new Date(timestamp);
  const startOfYear = new Date(dateObj.getUTCFullYear(), 0, 0);
  const diff = dateObj.getTime() - startOfYear.getTime();
  return Math.floor(diff / MILLISECONDS_PER_DAY);
}

/**
 * Calculate Earth's position in its orbit (angle from perihelion)
 */
function getEarthOrbitalPosition(date: DateInput): number {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const julianDay = getJulianDay(timestamp);

  // Days since J2000.0 epoch
  const T = (julianDay - 2451545.0) / 36525;

  // Mean longitude of the Sun, in degrees
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;

  // Mean anomaly of the Sun, in degrees
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;

  return M % 360;
}

/**
 * Calculate Earth-Sun distance at a given time
 */
function getEarthSunDistance(date: DateInput): number {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const orbitalPosition = (getEarthOrbitalPosition(timestamp) * Math.PI) / 180; // Convert to radians

  // Use the orbital equation to calculate distance
  const distance =
    (EARTH_SUN_MEAN_DISTANCE_KM *
      (1 - EARTH_ORBITAL_ECCENTRICITY * EARTH_ORBITAL_ECCENTRICITY)) /
    (1 + EARTH_ORBITAL_ECCENTRICITY * Math.cos(orbitalPosition));

  return distance;
}

/**
 * Calculate the solar declination (sun's angle relative to Earth's equator)
 */
function getSolarDeclination(date: DateInput): number {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const dayOfYear = getDayOfYear(timestamp);

  // Approximate formula for solar declination
  return -EARTH_AXIAL_TILT * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
}

/**
 * Determine the current season in the Northern Hemisphere
 */
function getNorthernHemisphereSeason(date: DateInput): Season {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const dayOfYear = getDayOfYear(timestamp);

  if (dayOfYear >= 80 && dayOfYear < 172) return "Spring";
  if (dayOfYear >= 172 && dayOfYear < 266) return "Summer";
  if (dayOfYear >= 266 && dayOfYear < 355) return "Fall";
  return "Winter";
}

/**
 * Helper function to get the southern hemisphere season (opposite of northern)
 */
function getSouthernHemisphereSeason(date: DateInput): Season {
  const northernSeason = getNorthernHemisphereSeason(date);
  const oppositeSeasons: Record<Season, Season> = {
    Spring: "Fall",
    Summer: "Winter",
    Fall: "Spring",
    Winter: "Summer",
  };
  return oppositeSeasons[northernSeason];
}

/**
 * Calculate the solar elevation angle for a given location and time
 */
function getSolarElevation(
  latitude: number,
  longitude: number,
  date: DateInput
): number {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const dateObj = new Date(timestamp);

  // Calculate solar declination
  const declination = (getSolarDeclination(timestamp) * Math.PI) / 180; // Convert to radians

  // Calculate hour angle
  const utcHours = dateObj.getUTCHours();
  const utcMinutes = dateObj.getUTCMinutes();
  const utcSeconds = dateObj.getUTCSeconds();
  const localTimeDecimal = utcHours + utcMinutes / 60 + utcSeconds / 3600;

  // Adjust for longitude (every 15 degrees = 1 hour)
  const localSolarTime = localTimeDecimal + longitude / 15;

  // Hour angle (15 degrees per hour from solar noon)
  const hourAngle = ((localSolarTime - 12) * 15 * Math.PI) / 180; // Convert to radians

  // Convert latitude to radians
  const latitudeRad = (latitude * Math.PI) / 180;

  // Calculate solar elevation
  const sinElevation =
    Math.sin(latitudeRad) * Math.sin(declination) +
    Math.cos(latitudeRad) * Math.cos(declination) * Math.cos(hourAngle);

  return (Math.asin(sinElevation) * 180) / Math.PI; // Convert back to degrees
}

/**
 * Calculate the solar azimuth angle for a given location and time
 * @param latitude - Latitude in degrees
 * @param longitude - Longitude in degrees
 * @param date - JavaScript Date object or timestamp
 * @return Solar azimuth angle in degrees (0 = North, 90 = East, 180 = South, 270 = West)
 */
function getSolarAzimuth(
  latitude: number,
  longitude: number,
  date: DateInput
): number {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const dateObj = new Date(timestamp);

  // Calculate solar declination
  const declination = (getSolarDeclination(timestamp) * Math.PI) / 180; // Convert to radians

  // Calculate hour angle
  const utcHours = dateObj.getUTCHours();
  const utcMinutes = dateObj.getUTCMinutes();
  const utcSeconds = dateObj.getUTCSeconds();
  const localTimeDecimal = utcHours + utcMinutes / 60 + utcSeconds / 3600;

  // Adjust for longitude (every 15 degrees = 1 hour)
  const localSolarTime = localTimeDecimal + longitude / 15;

  // Hour angle (15 degrees per hour from solar noon)
  const hourAngle = ((localSolarTime - 12) * 15 * Math.PI) / 180; // Convert to radians

  // Convert latitude to radians
  const latitudeRad = (latitude * Math.PI) / 180;

  // Calculate solar elevation for intermediate calculation
  const sinElevation =
    Math.sin(latitudeRad) * Math.sin(declination) +
    Math.cos(latitudeRad) * Math.cos(declination) * Math.cos(hourAngle);
  const elevation = Math.asin(sinElevation);

  // Calculate solar azimuth
  const cosAzimuth =
    (Math.sin(declination) - Math.sin(latitudeRad) * sinElevation) /
    (Math.cos(latitudeRad) * Math.cos(elevation));

  let azimuth =
    (Math.acos(Math.max(-1, Math.min(1, cosAzimuth))) * 180) / Math.PI; // Convert to degrees

  // Adjust azimuth based on hour angle
  if (hourAngle > 0) {
    azimuth = 360 - azimuth;
  }

  return azimuth;
}

/**
 * Calculate sunrise time for a given location and date
 * @param latitude - Latitude in degrees
 * @param longitude - Longitude in degrees
 * @param date - JavaScript Date object or timestamp
 * @return Sunrise time as Date object, or null if no sunrise (polar day/night)
 */
function getSunrise(
  latitude: number,
  longitude: number,
  date: DateInput
): Date | null {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const dateObj = new Date(timestamp);
  dateObj.setUTCHours(0, 0, 0, 0); // Start at midnight

  const declination = (getSolarDeclination(timestamp) * Math.PI) / 180; // Convert to radians
  const latitudeRad = (latitude * Math.PI) / 180; // Convert to radians

  // Calculate the hour angle at sunrise
  const cosHourAngle = -Math.tan(latitudeRad) * Math.tan(declination);

  // Check for polar day or night
  if (cosHourAngle < -1 || cosHourAngle > 1) {
    return null; // No sunrise or sunset (polar day or night)
  }

  const hourAngle = (Math.acos(cosHourAngle) * 180) / Math.PI; // Convert to degrees

  // Convert hour angle to hours (15 degrees = 1 hour)
  const hoursFromNoon = hourAngle / 15;

  // Adjust for the local time zone offset based on longitude
  const localTimeOffset = longitude / 15;

  // Calculate sunrise time (12 - hoursFromNoon + localTimeOffset)
  const sunriseHours = 12 - hoursFromNoon - localTimeOffset;

  // Create Date object for sunrise time
  const sunriseDate = new Date(dateObj);
  const sunriseHoursInt = Math.floor(sunriseHours);
  const sunriseMinutes = Math.floor((sunriseHours - sunriseHoursInt) * 60);
  const sunriseSeconds = Math.floor(
    ((sunriseHours - sunriseHoursInt) * 60 - sunriseMinutes) * 60
  );

  sunriseDate.setUTCHours(sunriseHoursInt, sunriseMinutes, sunriseSeconds);

  return sunriseDate;
}

/**
 * Calculate sunset time for a given location and date
 * @param latitude - Latitude in degrees
 * @param longitude - Longitude in degrees
 * @param date - JavaScript Date object or timestamp
 * @return Sunset time as Date object, or null if no sunset (polar day/night)
 */
function getSunset(
  latitude: number,
  longitude: number,
  date: DateInput
): Date | null {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const dateObj = new Date(timestamp);
  dateObj.setUTCHours(0, 0, 0, 0); // Start at midnight

  const declination = (getSolarDeclination(timestamp) * Math.PI) / 180; // Convert to radians
  const latitudeRad = (latitude * Math.PI) / 180; // Convert to radians

  // Calculate the hour angle at sunset
  const cosHourAngle = -Math.tan(latitudeRad) * Math.tan(declination);

  // Check for polar day or night
  if (cosHourAngle < -1 || cosHourAngle > 1) {
    return null; // No sunrise or sunset (polar day or night)
  }

  const hourAngle = (Math.acos(cosHourAngle) * 180) / Math.PI; // Convert to degrees

  // Convert hour angle to hours (15 degrees = 1 hour)
  const hoursFromNoon = hourAngle / 15;

  // Adjust for the local time zone offset based on longitude
  const localTimeOffset = longitude / 15;

  // Calculate sunset time (12 + hoursFromNoon + localTimeOffset)
  const sunsetHours = 12 + hoursFromNoon - localTimeOffset;

  // Create Date object for sunset time
  const sunsetDate = new Date(dateObj);
  const sunsetHoursInt = Math.floor(sunsetHours);
  const sunsetMinutes = Math.floor((sunsetHours - sunsetHoursInt) * 60);
  const sunsetSeconds = Math.floor(
    ((sunsetHours - sunsetHoursInt) * 60 - sunsetMinutes) * 60
  );

  sunsetDate.setUTCHours(sunsetHoursInt, sunsetMinutes, sunsetSeconds);

  return sunsetDate;
}

/**
 * Calculate day length in hours for a given location and date
 * @param latitude - Latitude in degrees
 * @param longitude - Longitude in degrees
 * @param date - JavaScript Date object or timestamp
 * @return Day length in hours, or null if polar day/night
 */
function getDayLength(
  latitude: number,
  longitude: number,
  date: DateInput
): number | null {
  const sunrise = getSunrise(latitude, longitude, date);
  const sunset = getSunset(latitude, longitude, date);

  if (!sunrise && !sunset) {
    // Check if we're in polar day or polar night
    const solarElevationAtNoon = getSolarElevation(latitude, longitude, date);
    return solarElevationAtNoon > 0 ? 24 : 0; // 24 hours if polar day, 0 if polar night
  } else if (!sunrise || !sunset) {
    return null; // Should not happen, but included for completeness
  }

  return (sunset.getTime() - sunrise.getTime()) / (1000 * 60 * 60); // Convert milliseconds to hours
}

/**
 * Calculate the moon phase (0-1, where 0 and 1 = new moon, 0.5 = full moon)
 * @param date - JavaScript Date object or timestamp
 * @return Moon phase as a value from 0 to 1
 */
function getMoonPhase(date: DateInput): number {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const julianDay = getJulianDay(timestamp);

  // Days since first new moon of J2000.0 epoch
  const daysSinceNewMoon = julianDay - 2451550.1;

  // Calculate the moon phase using the synodic period
  const phase = (daysSinceNewMoon % MOON_SYNODIC_PERIOD) / MOON_SYNODIC_PERIOD;

  return phase;
}

/**
 * Get a description of the current moon phase
 * @param date - JavaScript Date object or timestamp
 * @return Description of moon phase
 */
function getMoonPhaseDescription(date: DateInput): MoonPhaseDescription {
  const phase = getMoonPhase(date);

  if (phase < 0.025 || phase > 0.975) return "New Moon";
  if (phase < 0.235) return "Waxing Crescent";
  if (phase < 0.265) return "First Quarter";
  if (phase < 0.475) return "Waxing Gibbous";
  if (phase < 0.525) return "Full Moon";
  if (phase < 0.735) return "Waning Gibbous";
  if (phase < 0.765) return "Last Quarter";
  return "Waning Crescent";
}

/**
 * Calculate the percentage of the moon that is illuminated
 * @param date - JavaScript Date object or timestamp
 * @return Percentage of moon illuminated (0-100)
 */
function getMoonIllumination(date: DateInput): number {
  const phase = getMoonPhase(date);

  // Calculate illumination percentage (0 at new moon, 100 at full moon, 0 at next new moon)
  // The illumination follows a cosine curve
  const illumination = 50 * (1 - Math.cos(2 * Math.PI * phase));

  return illumination;
}

/**
 * Calculate approximate moon distance from Earth
 * @param date - JavaScript Date object or timestamp
 * @return Distance in kilometers
 */
function getMoonDistance(date: DateInput): number {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const julianDay = getJulianDay(timestamp);

  // Days since J2000.0 epoch
  const T = (julianDay - 2451545.0) / 36525;

  // Mean longitude of the Moon
  const L = 218.316 + 13.176396 * (julianDay - 2451545.0);

  // Mean anomaly of the Moon
  const M = 134.963 + 13.064993 * (julianDay - 2451545.0);

  // Mean distance
  const distance =
    MOON_MEAN_DISTANCE_KM * (1 - 0.054 * Math.cos((M * Math.PI) / 180));

  return distance;
}

/**
 * Calculate the next full moon date after the given date
 * @param date - JavaScript Date object or timestamp
 * @return Date of the next full moon
 */
function getNextFullMoon(date: DateInput): Date {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const phase = getMoonPhase(timestamp);

  // Calculate days until next full moon (phase = 0.5)
  let daysUntilFullMoon: number;
  if (phase < 0.5) {
    daysUntilFullMoon = (0.5 - phase) * MOON_SYNODIC_PERIOD;
  } else {
    daysUntilFullMoon = (1.5 - phase) * MOON_SYNODIC_PERIOD;
  }

  // Calculate the date of the next full moon
  const nextFullMoonDate = new Date(
    timestamp + daysUntilFullMoon * MILLISECONDS_PER_DAY
  );

  return nextFullMoonDate;
}

/**
 * Calculate the next new moon date after the given date
 * @param date - JavaScript Date object or timestamp
 * @return Date of the next new moon
 */
function getNextNewMoon(date: DateInput): Date {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const phase = getMoonPhase(timestamp);

  // Calculate days until next new moon (phase = 0 or 1)
  const daysUntilNewMoon = (1 - phase) * MOON_SYNODIC_PERIOD;

  // Calculate the date of the next new moon
  const nextNewMoonDate = new Date(
    timestamp + daysUntilNewMoon * MILLISECONDS_PER_DAY
  );

  return nextNewMoonDate;
}

/**
 * Calculate the apparent angular diameter of the Sun as seen from Earth
 * @param date - JavaScript Date object or timestamp
 * @return Angular diameter in degrees
 */
function getSolarAngularDiameter(date: DateInput): number {
  const distance = getEarthSunDistance(date);

  // Angular diameter = 2 * arctan(radius / distance)
  const angularRadians = 2 * Math.atan(SUN_RADIUS_KM / distance);

  // Convert to degrees
  return (angularRadians * 180) / Math.PI;
}

/**
 * Calculate the apparent angular diameter of the Moon as seen from Earth
 * @param date - JavaScript Date object or timestamp
 * @return Angular diameter in degrees
 */
function getLunarAngularDiameter(date: DateInput): number {
  const distance = getMoonDistance(date);

  // Angular diameter = 2 * arctan(radius / distance)
  const angularRadians = 2 * Math.atan(MOON_RADIUS_KM / distance);

  // Convert to degrees
  return (angularRadians * 180) / Math.PI;
}

/**
 * Calculate Earth's orbital velocity at a given point in its orbit
 * @param date - JavaScript Date object or timestamp
 * @return Orbital velocity in km/s
 */
function getEarthOrbitalVelocity(date: DateInput): number {
  const timestamp = date instanceof Date ? date.getTime() : date;

  // Earth's average orbital velocity is approximately 29.78 km/s
  const averageVelocity =
    (2 * Math.PI * EARTH_SUN_MEAN_DISTANCE_KM) /
    (EARTH_ORBITAL_PERIOD * 24 * 60 * 60);

  // Earth's velocity varies due to orbital eccentricity
  // It's faster at perihelion and slower at aphelion
  const orbitalPosition = (getEarthOrbitalPosition(timestamp) * Math.PI) / 180; // Convert to radians

  // Distance affects velocity (closer = faster)
  const distance = getEarthSunDistance(timestamp);
  const velocityFactor = EARTH_SUN_MEAN_DISTANCE_KM / distance;

  // Apply Kepler's law of equal areas in equal times
  return averageVelocity * velocityFactor;
}

/**
 * Calculate Moon's altitude
 * @param latitude - Latitude in degrees
 * @param longitude - Longitude in degrees
 * @param date - JavaScript Date object or timestamp
 * @return Moon's altitude in degrees
 */
function getMoonAltitude(
  latitude: number,
  longitude: number,
  date: DateInput
): number {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const dateObj = new Date(timestamp);

  // This is a simplified approximation
  // Calculate moon's approximate equatorial coordinates
  const moonPhase = getMoonPhase(timestamp);
  const moonOrbitalPos = moonPhase * 2 * Math.PI;

  // Approximate declination and right ascension based on phase
  const moonDec = 23.4 * Math.sin(moonOrbitalPos); // Max declination approximately Earth's axial tilt
  const moonRa = (moonPhase * 24 + 12) % 24; // Full cycle of right ascension through the lunar month

  // Convert to horizontal coordinates
  const siderealTime = getSiderealTime(timestamp) + longitude / 15;
  const localSiderealTime = siderealTime % 24;

  // Calculate hour angle (local sidereal time - right ascension)
  const hourAngle = ((localSiderealTime - moonRa) * 15 * Math.PI) / 180;

  // Convert to radians
  const latRad = (latitude * Math.PI) / 180;
  const decRad = (moonDec * Math.PI) / 180;

  // Calculate altitude
  const sinAlt =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourAngle);

  return (Math.asin(sinAlt) * 180) / Math.PI;
}

/**
 * Calculate Moon's azimuth
 * @param latitude - Latitude in degrees
 * @param longitude - Longitude in degrees
 * @param date - JavaScript Date object or timestamp
 * @return Moon's azimuth in degrees
 */
function getMoonAzimuth(
  latitude: number,
  longitude: number,
  date: DateInput
): number {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const dateObj = new Date(timestamp);

  // This is a simplified approximation
  // Calculate moon's approximate equatorial coordinates
  const moonPhase = getMoonPhase(timestamp);
  const moonOrbitalPos = moonPhase * 2 * Math.PI;

  // Approximate declination and right ascension based on phase
  const moonDec = 23.4 * Math.sin(moonOrbitalPos); // Max declination approximately Earth's axial tilt
  const moonRa = (moonPhase * 24 + 12) % 24; // Full cycle of right ascension through the lunar month

  // Convert to horizontal coordinates
  const siderealTime = getSiderealTime(timestamp) + longitude / 15;
  const localSiderealTime = siderealTime % 24;

  // Calculate hour angle (local sidereal time - right ascension)
  const hourAngle = ((localSiderealTime - moonRa) * 15 * Math.PI) / 180;

  // Convert to radians
  const latRad = (latitude * Math.PI) / 180;
  const decRad = (moonDec * Math.PI) / 180;

  // Calculate altitude (needed for azimuth calculation)
  const sinAlt =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourAngle);
  const altitude = Math.asin(sinAlt);

  // Calculate azimuth
  const cosAz =
    (Math.sin(decRad) - Math.sin(latRad) * sinAlt) /
    (Math.cos(latRad) * Math.cos(altitude));
  const sinAz = (-Math.sin(hourAngle) * Math.cos(decRad)) / Math.cos(altitude);

  let azimuth = (Math.atan2(sinAz, cosAz) * 180) / Math.PI;
  azimuth = (azimuth + 360) % 360;

  return azimuth;
}

/**
 * Calculate tidal force at a given location due to the Moon
 * @param latitude - Latitude in degrees
 * @param longitude - Longitude in degrees
 * @param date - JavaScript Date object or timestamp
 * @return Relative tidal force (normalized between 0-1)
 */
function getLunarTidalForce(
  latitude: number,
  longitude: number,
  date: DateInput
): number {
  const timestamp = date instanceof Date ? date.getTime() : date;

  // Simplified approach using moon altitude as primary factor
  const moonAlt = getMoonAltitude(latitude, longitude, timestamp);
  const moonPhase = getMoonPhase(timestamp);

  // Calculate moon's position relative to observer's longitude
  // Higher altitude = stronger tidal force at that location
  const altFactor = (moonAlt + 90) / 180; // Convert -90 to +90 range to 0-1

  // Distance factor: moon is closer at new and full moon
  // due to Sun and Moon being aligned
  const phaseFactor = Math.cos((moonPhase - 0.5) * 2 * Math.PI);
  const distanceFactor = 0.9 + 0.1 * phaseFactor;

  // Combine altitude and distance factors
  return Math.min(1, Math.max(0, altFactor * distanceFactor * 0.8));
}

/**
 * Convert solar (mean) time to sidereal time
 * @param date - JavaScript Date object or timestamp
 * @return Local sidereal time in decimal hours (0-24)
 */
function getSiderealTime(date: DateInput): number {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const dateObj = new Date(timestamp);

  // Calculate Julian day
  const julianDay = getJulianDay(timestamp);

  // Centuries since J2000.0
  const T = (julianDay - 2451545.0) / 36525;

  // Greenwich Mean Sidereal Time at 0h UTC
  const GMST0h =
    100.46061837 +
    36000.770053608 * T +
    0.000387933 * T ** 2 -
    T ** 3 / 38710000;

  // Adjust for time of day
  const hoursUTC =
    dateObj.getUTCHours() +
    dateObj.getUTCMinutes() / 60 +
    dateObj.getUTCSeconds() / 3600;

  // Sidereal time increases at a rate of about 1.0027379 compared to solar time
  const siderealTimeHours = (GMST0h / 15 + hoursUTC * 1.0027379) % 24;

  return siderealTimeHours;
}

/**
 * Calculate time dilation due to relative velocity
 * @param velocity - Velocity in km/s
 * @returns Time dilation factor
 */
function getRelativisticTimeDilation(velocity: number): number {
  // Time dilation = 1/sqrt(1-(v²/c²))
  const speedRatio = velocity / SPEED_OF_LIGHT;
  return 1 / Math.sqrt(1 - speedRatio * speedRatio);
}

/**
 * Calculate gravitational time dilation near a massive object
 * @param massInSolarMasses - Mass of the object in solar masses
 * @param distanceFromCenterKm - Distance from center in kilometers
 * @returns Time dilation factor
 */
function getGravitationalTimeDilation(
  massInSolarMasses: number,
  distanceFromCenterKm: number
): number {
  // Convert to SI units for the calculation
  const G = 6.6743e-11; // Gravitational constant (m³/kg/s²)
  const c = 299792458; // Speed of light in m/s

  // Convert mass to kg
  const massInKg = massInSolarMasses * SOLAR_MASS;

  // Convert distance to meters
  const distanceInM = distanceFromCenterKm * 1000;

  // Time dilation = sqrt(1 - (2GM/rc²))
  const schwarzschildTerm = (2 * G * massInKg) / (distanceInM * c * c);

  // Prevent values that would result in NaN or imaginary numbers (inside event horizon)
  if (schwarzschildTerm >= 1) {
    return 0; // Inside event horizon
  }

  return Math.sqrt(1 - schwarzschildTerm);
}

/**
 * Simplified planetary visibility information
 */
interface PlanetVisibilityInfo {
  isVisible: boolean;
  altitude: number;
  azimuth: number;
  magnitude: number;
  angularDiameter: number;
  phase: number;
}

/**
 * Calculate planet visibility (simplified)
 * @param planetName - Name of the planet
 * @param latitude - Observer's latitude in degrees
 * @param longitude - Observer's longitude in degrees
 * @param date - Observation date
 * @returns Planetary visibility information
 */
function getPlanetVisibility(
  planetName: string,
  latitude: number,
  longitude: number,
  date: DateInput
): PlanetVisibilityInfo {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const dateObj = new Date(timestamp);

  // Define simplified planet data
  const planets: {
    [key: string]: {
      meanDistance: number; // AU
      period: number; // years
      baseMagnitude: number; // at 1 AU
      diameter: number; // km
      isInner: boolean; // Whether it's an inner planet (Mercury, Venus)
    };
  } = {
    Mercury: {
      meanDistance: 0.387,
      period: 0.241,
      baseMagnitude: -0.5,
      diameter: 4879,
      isInner: true,
    },
    Venus: {
      meanDistance: 0.723,
      period: 0.615,
      baseMagnitude: -4.4,
      diameter: 12104,
      isInner: true,
    },
    Mars: {
      meanDistance: 1.524,
      period: 1.881,
      baseMagnitude: -2.0,
      diameter: 6779,
      isInner: false,
    },
    Jupiter: {
      meanDistance: 5.203,
      period: 11.86,
      baseMagnitude: -9.4,
      diameter: 139820,
      isInner: false,
    },
    Saturn: {
      meanDistance: 9.537,
      period: 29.46,
      baseMagnitude: -8.9,
      diameter: 116460,
      isInner: false,
    },
    Uranus: {
      meanDistance: 19.191,
      period: 84.01,
      baseMagnitude: -7.2,
      diameter: 50724,
      isInner: false,
    },
    Neptune: {
      meanDistance: 30.069,
      period: 164.8,
      baseMagnitude: -6.9,
      diameter: 49244,
      isInner: false,
    },
  };

  // Check if the planet exists in our data
  if (!planets[planetName]) {
    throw new Error(`Planet ${planetName} not found`);
  }

  const planet = planets[planetName];

  // Simplified orbital position calculation based on date
  // This is a very basic approximation
  const daysSinceJ2000 = (timestamp - J2000_EPOCH) / MILLISECONDS_PER_DAY;
  const yearsSinceJ2000 = daysSinceJ2000 / 365.25;

  // Calculate mean anomaly (simplified)
  const orbitalProgress = (yearsSinceJ2000 % planet.period) / planet.period;
  const orbitalAngle = orbitalProgress * 2 * Math.PI;

  // Simple approximation of planet's position relative to Earth
  // This is extremely simplified and only gives approximate results
  const sunEarthAngle = (getDayOfYear(timestamp) / 365.25) * 2 * Math.PI;
  let planetEarthAngle = sunEarthAngle + orbitalAngle;

  if (!planet.isInner) {
    // Outer planets: earth is between sun and planet when aligned
    planetEarthAngle = orbitalAngle - sunEarthAngle;
  }

  // Estimate distance to planet (very approximate)
  const earthSunDist = getEarthSunDistance(timestamp) / ASTRONOMICAL_UNIT_IN_KM;
  let distanceToEarth = 0;

  if (planet.isInner) {
    distanceToEarth = Math.sqrt(
      earthSunDist * earthSunDist +
        planet.meanDistance * planet.meanDistance -
        2 * earthSunDist * planet.meanDistance * Math.cos(planetEarthAngle)
    );
  } else {
    distanceToEarth = Math.sqrt(
      earthSunDist * earthSunDist +
        planet.meanDistance * planet.meanDistance -
        2 * earthSunDist * planet.meanDistance * Math.cos(planetEarthAngle)
    );
  }

  // Estimate magnitude
  const magnitude = planet.baseMagnitude + 5 * Math.log10(distanceToEarth);

  // Estimate phase (only relevant for inner planets)
  let phase = 1.0;
  if (planet.isInner) {
    // Phase angle
    const phaseAngle = Math.acos(
      (distanceToEarth * distanceToEarth +
        planet.meanDistance * planet.meanDistance -
        earthSunDist * earthSunDist) /
        (2 * distanceToEarth * planet.meanDistance)
    );
    phase = (1 + Math.cos(phaseAngle)) / 2;
  }

  // Calculate angular diameter
  const angularDiameter =
    (planet.diameter / (distanceToEarth * ASTRONOMICAL_UNIT_IN_KM)) *
    (180 / Math.PI) *
    3600; // Convert to arcseconds

  // Approximate altitude and azimuth based on time of day and planet position
  // This is a very rough approximation

  // Use solar position as reference and shift based on orbital position
  const sunAlt = getSolarElevation(latitude, longitude, timestamp);
  const sunAz = getSolarAzimuth(latitude, longitude, timestamp);

  // Offset from sun (simplified)
  let altitudeOffset = 0;
  let azimuthOffset = 0;

  if (planet.isInner) {
    // Inner planets are never far from the sun
    const elongation =
      (Math.asin(planet.meanDistance / distanceToEarth) * 180) / Math.PI;
    azimuthOffset = elongation * Math.sin(orbitalAngle);
    altitudeOffset = elongation * Math.cos(orbitalAngle);
  } else {
    // Outer planets can be anywhere in the sky
    azimuthOffset = 180 * Math.sin(planetEarthAngle);
    altitudeOffset = 30 * Math.sin(planetEarthAngle + Math.PI / 2);
  }

  let altitude = sunAlt + altitudeOffset;
  let azimuth = (sunAz + azimuthOffset) % 360;

  // Time-of-day adjustment
  const hourOfDay = new Date(timestamp).getHours();
  if (hourOfDay >= 18 || hourOfDay <= 6) {
    // Night time - planets may be visible
    altitude = Math.max(-10, altitude); // Allow slightly below horizon for refraction
  }

  // Determine visibility
  const isVisible = altitude > 0 && magnitude < 6;

  return {
    isVisible,
    altitude,
    azimuth,
    magnitude,
    angularDiameter,
    phase,
  };
}

/**
 * Calculate the current position in the galaxy's rotation cycle
 * @param date - Current date
 * @returns Fraction of the galactic year completed (0-1)
 */
function getGalacticYearProgress(date: DateInput): number {
  const timestamp = date instanceof Date ? date.getTime() : date;

  // This is a rough approximation based on the assumption
  // that we were at "galactic midnight" at J2000.0
  const millisecondsPerGalacticYear =
    MILKY_WAY_ORBITAL_PERIOD * 365.25 * 24 * 60 * 60 * 1000;
  const progress =
    ((timestamp - J2000_EPOCH) % millisecondsPerGalacticYear) /
    millisecondsPerGalacticYear;

  return progress;
}
