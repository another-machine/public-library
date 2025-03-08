/**
 * Type definitions for consistent value reporting
 */

// Base type for all astronomical values with description
export interface AstronomicalValue<T> {
  value: T;
  description: string;
}

// Specialized types for common value types
export type NumberValue = AstronomicalValue<number> & {
  unitRange: number; // 0 to 1 scale
  bipolarRange?: number; // -1 to 1 scale when applicable
};
export type StringValue = AstronomicalValue<string>;
export type DateValue = AstronomicalValue<number> & { date: Date | null };
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
const ASTRONOMICAL_UNIT_IN_KM = 149597870.7; // km (1 AU)
const SOLAR_MASS = 1.989e30; // kg

// Milky Way constants
const MILKY_WAY_CENTER_DISTANCE = 8.178; // kpc (kiloparsecs)
const MILKY_WAY_ORBITAL_PERIOD = 225e6; // years
const MILKY_WAY_ROTATION_VELOCITY = 220; // km/s

/**
 * Helper functions for creating value objects with descriptions
 */
export function createNumberValue({
  value,
  description,
  unitRange,
  bipolarRange,
}: {
  value: number;
  description: string;
  unitRange: number;
  bipolarRange?: number;
}): NumberValue {
  return { description, value, unitRange, bipolarRange };
}

export function createStringValue(
  value: string,
  description: string
): StringValue {
  return { description, value };
}

export function createDateValue(
  value: number,
  date: Date | null,
  description: string
): DateValue {
  return { description, value, date };
}

export function createBooleanValue(
  value: boolean,
  description: string
): BooleanValue {
  return { description, value };
}

export function createPosition3DValue(
  value: { x: number; y: number; z: number },
  description: string
): Position3DValue {
  return { description, value };
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
}) {
  const timestamp = date instanceof Date ? date.getTime() : date;

  // Create the report
  return {
    observer: getObserverInfo(latitude, longitude, timestamp),
    earth: getEarthInfo(timestamp, latitude),
    sun: getSunInfo(latitude, longitude, timestamp),
    moon: getMoonInfo(latitude, longitude, timestamp),
    planets: getPlanetsInfo(latitude, longitude, timestamp),
  };
}

/**
 * Calculate local time for a given longitude based on UTC timestamp
 * @param timestamp - UTC timestamp in milliseconds
 * @param longitude - Longitude in degrees
 * @returns Local date object and timezone offset in hours
 */
function getLocalTimeFromLongitude(
  timestamp: number,
  longitude: number
): { localTime: Date; offsetHours: number } {
  // Calculate offset in milliseconds
  const offsetHours = longitude / 15;
  const offsetMillis = offsetHours * 60 * 60 * 1000;

  // Apply offset to timestamp and create new date
  const localTime = new Date(timestamp + offsetMillis);

  return { localTime, offsetHours };
}

/**
 * Get observer-related information
 */
function getObserverInfo(
  latitude: number,
  longitude: number,
  timestamp: number
) {
  const dateObj = getLocalTimeFromLongitude(timestamp, longitude);
  const rotationalVelocity = getEarthRotationalVelocity(latitude);
  const siderealTime = getSiderealTime(timestamp) + longitude / 15;

  return {
    latitude: createNumberValue({
      value: latitude,
      unitRange: (latitude + 90) / 180,
      bipolarRange: latitude / 90,
      description: `Observer's latitude: ${formatWithUnits(
        latitude,
        "degrees"
      )}`,
    }),
    longitude: createNumberValue({
      value: longitude,
      unitRange: (longitude + 180) / 360,
      bipolarRange: longitude / 180,
      description: `Observer's longitude: ${formatWithUnits(
        longitude,
        "degrees"
      )}`,
    }),
    localTime: createDateValue(
      dateObj.localTime.getMilliseconds(),
      dateObj.localTime,
      "Local time at observer's location"
    ),
    rotationalVelocity: createNumberValue({
      value: rotationalVelocity,
      unitRange: rotationalVelocity / 1674, // Normalized to equatorial max of ~1674 km/h
      description: `Rotational velocity at this latitude: ${formatWithUnits(
        rotationalVelocity,
        "km/h"
      )}`,
    }),
    siderealTime: createNumberValue({
      value: siderealTime % 24,
      unitRange: (siderealTime % 24) / 24,
      description: `Local sidereal time: ${formatWithUnits(
        siderealTime % 24,
        "hours"
      )}`,
    }),
  };
}

/**
 * Calculate the rotational velocity at a specific latitude
 * @param latitude - Latitude in degrees
 * @returns Rotational velocity in km/h
 */
function getEarthRotationalVelocity(latitude) {
  // Earth's equatorial circumference in km
  const earthCircumference = 2 * Math.PI * EARTH_RADIUS_KM;

  // Time for one rotation in hours
  const rotationTime = EARTH_ROTATION_PERIOD;

  // Velocity at equator in km/h
  const equatorialVelocity = earthCircumference / rotationTime;

  // Velocity at given latitude (decreases with the cosine of latitude)
  const latitudeRad = (latitude * Math.PI) / 180;
  const velocityAtLatitude = equatorialVelocity * Math.cos(latitudeRad);

  return velocityAtLatitude;
}

/**
 * Get Earth-related information
 */
function getEarthInfo(timestamp: number, latitude: number) {
  const rotationAngle = getEarthRotationAngle(timestamp);
  const orbitalPosition = getEarthOrbitalPosition(timestamp);
  const distanceFromSun = getEarthSunDistance(timestamp);
  const orbitalVelocity = getEarthOrbitalVelocity(timestamp);

  return {
    rotationAngle: createNumberValue({
      value: rotationAngle,
      unitRange: rotationAngle / 360,
      description: "Earth's rotation angle in degrees (0-360)",
    }),
    orbitalPosition: createNumberValue({
      value: orbitalPosition,
      unitRange: orbitalPosition / 360,
      description:
        "Earth's position in its orbit as angle from perihelion in degrees",
    }),
    distanceFromSun: createNumberValue({
      value: distanceFromSun,
      unitRange: (distanceFromSun - 147000000) / (152000000 - 147000000),
      description: `Distance from Earth to Sun: ${formatWithUnits(
        distanceFromSun / 1000000,
        "million km"
      )}`,
    }),
    season: createStringValue(
      latitude >= 0
        ? getNorthernHemisphereSeason(timestamp)
        : getSouthernHemisphereSeason(timestamp),
      `Current season in the ${
        latitude >= 0 ? "Northern" : "Southern"
      } Hemisphere`
    ),
    orbitalVelocity: createNumberValue({
      value: orbitalVelocity,
      unitRange: (orbitalVelocity - 29.29) / (30.29 - 29.29), // Normalize between min/max velocities
      description: `Earth's orbital velocity: ${formatWithUnits(
        orbitalVelocity,
        "km/s"
      )}`,
    }),
  };
}

/**
 * Get Sun-related information
 */
function getSunInfo(latitude: number, longitude: number, timestamp: number) {
  const elevation = getSolarElevation(latitude, longitude, timestamp);
  const azimuth = getSolarAzimuth(latitude, longitude, timestamp);
  const angularDiameter = getSolarAngularDiameter(timestamp);
  const sunrise = getSunrise(latitude, longitude, timestamp);
  const sunset = getSunset(latitude, longitude, timestamp);
  const dayLength = getDayLength(latitude, longitude, timestamp) || 0;

  return {
    elevation: createNumberValue({
      value: elevation,
      unitRange: Math.max(0, (elevation + 90) / 180), // 0-1 scale
      bipolarRange: elevation / 90, // -1 to 1 scale (-90° to +90°)
      description: `Solar elevation angle: ${formatWithUnits(
        elevation,
        "degrees"
      )}`,
    }),
    azimuth: createNumberValue({
      value: azimuth,
      unitRange: azimuth / 360, // Normalize 0-360 range to 0-1
      description: `Solar azimuth angle: ${formatWithUnits(
        azimuth,
        "degrees"
      )}`,
    }),
    angularDiameter: createNumberValue({
      value: angularDiameter,
      unitRange: (angularDiameter - 0.524) / (0.542 - 0.524), // Normalize using min/max values
      description: `Solar angular diameter: ${formatWithUnits(
        angularDiameter,
        "degrees"
      )}`,
    }),
    sunrise: createDateValue(
      sunrise ? sunrise.getTime() : 0,
      sunrise,
      `Sunrise time: ${formatDate(sunrise)}`
    ),
    sunset: createDateValue(
      sunset ? sunset.getTime() : 0,
      sunset,
      `Sunset time: ${formatDate(sunset)}`
    ),
    dayLength: createNumberValue({
      value: dayLength,
      unitRange: dayLength / 24, // Normalize as fraction of a day
      description: `Day length: ${formatWithUnits(dayLength, "hours")}`,
    }),
  };
}

/**
 * Get Moon-related information
 */
function getMoonInfo(latitude: number, longitude: number, timestamp: number) {
  const phase = getMoonPhase(timestamp);
  const phaseDescription = getMoonPhaseDescription(timestamp);
  const illumination = getMoonIllumination(timestamp);
  const age = phase * MOON_SYNODIC_PERIOD;
  const distance = getMoonDistance(timestamp);
  const angularDiameter = getLunarAngularDiameter(timestamp);
  const altitude = getMoonAltitude(latitude, longitude, timestamp);
  const azimuth = getMoonAzimuth(latitude, longitude, timestamp);
  const nextFullMoon = getNextFullMoon(timestamp);
  const nextNewMoon = getNextNewMoon(timestamp);
  const tidalForce = getLunarTidalForce(latitude, longitude, timestamp);

  return {
    phase: createNumberValue({
      value: phase,
      unitRange: phase, // Already unitRange 0-1
      description: "Moon phase value (0-1, where 0=new moon, 0.5=full moon)",
    }),
    phaseDescription: createStringValue(
      phaseDescription,
      "Descriptive name of the current moon phase"
    ),
    illuminationPercent: createNumberValue({
      value: illumination,
      unitRange: illumination / 100, // Normalize percentage to 0-1
      description: `Percentage of Moon illuminated: ${formatWithUnits(
        illumination,
        "%"
      )}`,
    }),
    age: createNumberValue({
      value: age,
      unitRange: age / MOON_SYNODIC_PERIOD, // Normalize age to fraction of cycle (same as phase)
      description: `Moon age: ${age.toFixed(1)} days since new moon`,
    }),
    distance: createNumberValue({
      value: distance,
      unitRange: (distance - 356400) / (406700 - 356400), // Normalize using min/max values
      description: `Distance from Earth to Moon: ${formatWithUnits(
        distance,
        "km"
      )}`,
    }),
    angularDiameter: createNumberValue({
      value: angularDiameter,
      unitRange: (angularDiameter - 0.29) / (0.34 - 0.29), // Normalize using min/max values
      description: `Moon's apparent diameter in sky: ${formatWithUnits(
        angularDiameter,
        "degrees"
      )}`,
    }),
    altitude: createNumberValue({
      value: altitude,
      unitRange: Math.max(0, (altitude + 90) / 180), // 0-1 scale
      bipolarRange: altitude / 90, // -1 to 1 scale (-90° to +90°)
      description: `Moon's altitude: ${formatWithUnits(altitude, "degrees")}`,
    }),
    azimuth: createNumberValue({
      value: azimuth,
      unitRange: azimuth / 360, // Normalize 0-360 range to 0-1
      description: `Moon's azimuth: ${formatWithUnits(azimuth, "degrees")}`,
    }),
    nextFullMoon: createDateValue(
      nextFullMoon.getTime(),
      nextFullMoon,
      `Next full moon: ${formatDate(nextFullMoon)}`
    ),
    nextNewMoon: createDateValue(
      nextNewMoon.getTime(),
      nextNewMoon,
      `Next new moon: ${formatDate(nextNewMoon)}`
    ),
    tidalForce: createNumberValue({
      value: tidalForce,
      unitRange: tidalForce, // Already unitRange 0-1
      description: "Relative lunar tidal force (0-1 scale)",
    }),
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
  [k: string]: {
    name: StringValue;
    isVisible: BooleanValue;
    altitude: NumberValue;
    azimuth: NumberValue;
    magnitude: NumberValue;
    angularDiameter: NumberValue;
    phase: NumberValue | null;
  };
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

  const details = {};

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
        altitude: createNumberValue({
          value: visibility.altitude,
          unitRange: Math.max(0, (visibility.altitude + 90) / 180), // 0-1 scale
          bipolarRange: visibility.altitude / 90, // -1 to 1 scale (-90° to +90°)
          description: `Altitude above horizon: ${formatWithUnits(
            visibility.altitude,
            "degrees"
          )}`,
        }),
        azimuth: createNumberValue({
          value: visibility.azimuth,
          unitRange: visibility.azimuth / 360, // Normalize 0-360 range to 0-1
          description: `Azimuth: ${formatWithUnits(
            visibility.azimuth,
            "degrees"
          )}`,
        }),
        magnitude: createNumberValue({
          value: visibility.magnitude,
          // Normalize magnitude (typical visible range is -27 to 6, where lower is brighter)
          // Map -27 to 0 and 6 to 1
          unitRange: (visibility.magnitude + 27) / 33,
          description: `Apparent magnitude: ${visibility.magnitude.toFixed(1)}`,
        }),
        angularDiameter: createNumberValue({
          value: visibility.angularDiameter,
          // Normalize using typical range of 0 to 50 arcseconds
          unitRange: visibility.angularDiameter / 50,
          description: `Angular diameter: ${formatWithUnits(
            visibility.angularDiameter,
            "arcseconds"
          )}`,
        }),
        phase:
          planet === "Mercury" || planet === "Venus"
            ? createNumberValue({
                value: visibility.phase,
                unitRange: visibility.phase, // Already unitRange 0-1
                description: `Illuminated fraction: ${(
                  visibility.phase * 100
                ).toFixed(0)}%`,
              })
            : null,
      };
    } catch (error) {
      console.error(`Error calculating visibility for ${planet}:`, error);
    }
  }

  return details;
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
  const meanAnomaly = (getEarthOrbitalPosition(date) * Math.PI) / 180;
  // Add equation of center (approximate)
  const equationOfCenter =
    2 * EARTH_ORBITAL_ECCENTRICITY * Math.sin(meanAnomaly);
  const trueAnomaly = meanAnomaly + equationOfCenter;

  return (
    (EARTH_SUN_MEAN_DISTANCE_KM *
      (1 - EARTH_ORBITAL_ECCENTRICITY * EARTH_ORBITAL_ECCENTRICITY)) /
    (1 + EARTH_ORBITAL_ECCENTRICITY * Math.cos(trueAnomaly))
  );
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

  // Calculate mean phase
  const meanPhase =
    (daysSinceNewMoon % MOON_SYNODIC_PERIOD) / MOON_SYNODIC_PERIOD;

  // Add first-order correction for elliptical orbit
  const phaseAngle = meanPhase * 2 * Math.PI;
  const correction = 0.0167 * Math.sin(phaseAngle); // Eccentricity-based correction

  return (meanPhase + correction / (2 * Math.PI)) % 1.0;
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
 * Calculate tidal force at a given location due to the Moon
 * @param latitude - Latitude in degrees
 * @param longitude - Longitude in degrees
 * @param date - JavaScript Date object or timestamp
 * @return Relative tidal force (unitRange between 0-1)
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

  // Greenwich Mean Sidereal Time at 0h UTC with improved coefficients
  const GMST0h =
    100.46061837 +
    36000.770053608 * T +
    0.000387933 * T ** 2 -
    T ** 3 / 38710000;

  // Adjust for time of day using Earth's precise rotation period
  const hoursUTC =
    dateObj.getUTCHours() +
    dateObj.getUTCMinutes() / 60 +
    dateObj.getUTCSeconds() / 3600;

  // Ratio of sidereal day to solar day is precisely:
  // solar day / sidereal day = 1.00273781191135448
  // This is equivalent to: EARTH_MEAN_SOLAR_DAY / EARTH_ROTATION_PERIOD
  const siderealFactor = EARTH_MEAN_SOLAR_DAY / EARTH_ROTATION_PERIOD;

  // Sidereal time increases at a more precise rate compared to solar time
  const siderealTimeHours = (GMST0h / 15 + hoursUTC * siderealFactor) % 24;

  // Add nutation correction (simplified)
  const omega = 125.04 - 1934.136 * T;
  const L0 = 280.47 + 36000.77 * T;
  const nutationCorrection = -0.00017 * Math.sin((omega * Math.PI) / 180);

  return (siderealTimeHours + nutationCorrection) % 24;
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

/**
 * Enhanced calculation of galactic position with more context
 * @param date - Current date
 * @returns Object with enhanced galactic position information
 */
function getGalacticPosition(date) {
  const timestamp = date instanceof Date ? date.getTime() : date;

  // Basic galactic year progress (0-1)
  const millisecondsPerGalacticYear =
    MILKY_WAY_ORBITAL_PERIOD * 365.25 * 24 * 60 * 60 * 1000;

  // Total time elapsed since J2000.0
  const timeElapsed = timestamp - J2000_EPOCH;

  // Current progress through galactic year (0-1)
  const progress =
    (timeElapsed % millisecondsPerGalacticYear) / millisecondsPerGalacticYear;

  // Calculate how many full galactic years have passed since J2000
  const completedYears = Math.floor(timeElapsed / millisecondsPerGalacticYear);

  // Calculate how many years into the current galactic year we are
  const yearsIntoCurrentCycle = progress * MILKY_WAY_ORBITAL_PERIOD;

  // Calculate our approximate position in the galaxy relative to galactic center
  // This is a very rough approximation assuming a circular orbit
  const orbitalAngle = progress * 2 * Math.PI; // in radians

  // Position relative to galactic center (very approximate)
  const x = MILKY_WAY_CENTER_DISTANCE * Math.cos(orbitalAngle);
  const y = MILKY_WAY_CENTER_DISTANCE * Math.sin(orbitalAngle);

  // Galactic "seasons" based on quadrants of the orbit
  let galacticSeason = "";
  if (progress < 0.25) {
    galacticSeason = "First Galactic Quadrant";
  } else if (progress < 0.5) {
    galacticSeason = "Second Galactic Quadrant";
  } else if (progress < 0.75) {
    galacticSeason = "Third Galactic Quadrant";
  } else {
    galacticSeason = "Fourth Galactic Quadrant";
  }

  // Current velocity relative to the galactic rest frame
  // This combines Earth's orbital velocity, solar system's movement, etc.
  // Very approximate calculation
  const totalVelocity =
    MILKY_WAY_ROTATION_VELOCITY + Math.sin(orbitalAngle) * 10; // km/s

  return {
    progress,
    completedYears,
    yearsIntoCurrentCycle,
    position: { x, y },
    galacticSeason,
    totalVelocity,
  };
}

/**
 * Calculate Moon's position using a simplified version of Meeus' algorithm
 * @param date - JavaScript Date object or timestamp
 * @returns Object with equatorial coordinates (right ascension, declination) and distance
 */
function getMoonPosition(date) {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const julianDay = getJulianDay(timestamp);

  // Time in Julian centuries since J2000.0
  const T = (julianDay - 2451545.0) / 36525;

  // Simplified elements of the Moon's orbit
  // Mean longitude of the Moon
  const L = 218.316 + 481267.8811 * T - 0.00146 * T * T;

  // Mean elongation of the Moon
  const D = 297.8502 + 445267.1115 * T - 0.00163 * T * T;

  // Mean anomaly of the Sun
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T * T;

  // Mean anomaly of the Moon
  const Mprime = 134.9634 + 477198.8676 * T + 0.008721 * T * T;

  // Moon's argument of latitude
  const F = 93.2721 + 483202.0175 * T - 0.0034029 * T * T;

  // Convert to radians for calculations
  const Lrad = ((L % 360) * Math.PI) / 180;
  const Drad = ((D % 360) * Math.PI) / 180;
  const Mrad = ((M % 360) * Math.PI) / 180;
  const Mprimerad = ((Mprime % 360) * Math.PI) / 180;
  const Frad = ((F % 360) * Math.PI) / 180;

  // Calculate periodic terms for longitude
  let longitude =
    L +
    6.289 * Math.sin(Mprimerad) +
    1.274 * Math.sin(2 * Drad - Mprimerad) +
    0.658 * Math.sin(2 * Drad) +
    0.214 * Math.sin(2 * Mprimerad) -
    0.186 * Math.sin(Mrad) -
    0.114 * Math.sin(2 * Frad);

  // Calculate periodic terms for latitude
  let latitude =
    5.128 * Math.sin(Frad) +
    0.28 * Math.sin(Mprimerad + Frad) +
    0.28 * Math.sin(Mprimerad - Frad) +
    0.23 * Math.sin(2 * Drad - Frad);

  // Calculate distance in Earth radii
  const distance =
    60.36298 -
    3.39968 * Math.cos(Mprimerad) -
    0.17 * Math.cos(2 * Drad - Mprimerad) -
    0.14 * Math.cos(2 * Drad) -
    0.07 * Math.cos(2 * Mprimerad);

  // Convert distance to kilometers
  const distanceKm = distance * EARTH_RADIUS_KM;

  // Ensure longitude is in range 0-360
  longitude = ((longitude % 360) + 360) % 360;

  // Convert ecliptic coordinates to equatorial coordinates
  const obliquity =
    23.439292 - 0.0130042 * T - 0.00000016 * T * T + 0.000000504 * T * T * T;
  const obliquityRad = (obliquity * Math.PI) / 180;
  const longitudeRad = (longitude * Math.PI) / 180;
  const latitudeRad = (latitude * Math.PI) / 180;

  // Calculate right ascension and declination
  const rightAscension = Math.atan2(
    Math.sin(longitudeRad) * Math.cos(obliquityRad) -
      Math.tan(latitudeRad) * Math.sin(obliquityRad),
    Math.cos(longitudeRad)
  );

  const declination = Math.asin(
    Math.sin(latitudeRad) * Math.cos(obliquityRad) +
      Math.cos(latitudeRad) * Math.sin(obliquityRad) * Math.sin(longitudeRad)
  );

  // Convert to degrees
  const rightAscensionDeg = ((rightAscension * 180) / Math.PI + 360) % 360;
  const declinationDeg = (declination * 180) / Math.PI;

  // Convert right ascension to hours (0-24)
  const rightAscensionHours = rightAscensionDeg / 15;

  return {
    rightAscension: rightAscensionHours,
    declination: declinationDeg,
    distance: distanceKm,
    longitude: longitude,
    latitude: latitude,
  };
}

/**
 * Calculate Moon's altitude and azimuth for a given location and time
 * @param latitude - Observer's latitude in degrees
 * @param longitude - Observer's longitude in degrees
 * @param date - JavaScript Date object or timestamp
 * @return Object with altitude and azimuth in degrees
 */
function getMoonHorizontalCoordinates(latitude, longitude, date) {
  const timestamp = date instanceof Date ? date.getTime() : date;

  // Get moon's equatorial coordinates
  const moonPos = getMoonPosition(timestamp);

  // Get local sidereal time
  const siderealTime = getSiderealTime(timestamp) + longitude / 15;
  const localSiderealTime = siderealTime % 24;

  // Calculate hour angle (local sidereal time - right ascension)
  const hourAngle =
    ((localSiderealTime - moonPos.rightAscension) * 15 * Math.PI) / 180;

  // Convert to radians
  const latRad = (latitude * Math.PI) / 180;
  const decRad = (moonPos.declination * Math.PI) / 180;

  // Calculate altitude
  const sinAlt =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourAngle);
  const altitude = (Math.asin(sinAlt) * 180) / Math.PI;

  // Calculate azimuth
  const cosAz =
    (Math.sin(decRad) - Math.sin(latRad) * sinAlt) /
    (Math.cos(latRad) * Math.cos(Math.asin(sinAlt)));

  // Handle potential numerical instability
  const cosAzClamped = Math.max(-1, Math.min(1, cosAz));

  const sinAz =
    (-Math.sin(hourAngle) * Math.cos(decRad)) / Math.cos(Math.asin(sinAlt));
  let azimuth = (Math.atan2(sinAz, cosAzClamped) * 180) / Math.PI;

  // Ensure azimuth is in range 0-360
  azimuth = (azimuth + 360) % 360;

  // Apply atmospheric refraction correction for objects near the horizon
  let refractedAltitude = altitude;
  if (altitude < 10) {
    // Simple refraction model
    const R =
      0.0167 / Math.tan(((altitude + 7.31 / (altitude + 4.4)) * Math.PI) / 180);
    refractedAltitude = altitude + R;
  }

  return {
    altitude: refractedAltitude,
    azimuth: azimuth,
    distance: moonPos.distance,
  };
}

/**
 * Updated function to get Moon's altitude
 * @param latitude - Latitude in degrees
 * @param longitude - Longitude in degrees
 * @param date - JavaScript Date object or timestamp
 * @return Moon's altitude in degrees
 */
function getMoonAltitude(latitude, longitude, date) {
  return getMoonHorizontalCoordinates(latitude, longitude, date).altitude;
}

/**
 * Updated function to get Moon's azimuth
 * @param latitude - Latitude in degrees
 * @param longitude - Longitude in degrees
 * @param date - JavaScript Date object or timestamp
 * @return Moon's azimuth in degrees
 */
function getMoonAzimuth(latitude, longitude, date) {
  return getMoonHorizontalCoordinates(latitude, longitude, date).azimuth;
}

/**
 * Updated function to get Moon's distance
 * @param date - JavaScript Date object or timestamp
 * @return Distance in kilometers
 */
function getMoonDistance(date) {
  return getMoonPosition(date).distance;
}

/**
 * Calculate the topocentric (observed from Earth's surface) position of the Moon
 * @param latitude - Observer's latitude in degrees
 * @param longitude - Observer's longitude in degrees
 * @param date - JavaScript Date object or timestamp
 * @returns Object with topocentric coordinates
 */
function getTopocentricMoonPosition(latitude, longitude, date) {
  const timestamp = date instanceof Date ? date.getTime() : date;

  // Get geocentric position (from Earth's center)
  const geocentricPos = getMoonPosition(timestamp);

  // Convert observer's latitude and longitude to radians
  const latRad = (latitude * Math.PI) / 180;
  const lonRad = (longitude * Math.PI) / 180;

  // Calculate the observer's position on Earth's surface
  // in a reference frame with Earth's center as origin
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);

  // Earth's radius at observer's latitude (accounting for Earth's oblateness)
  const observerRadius =
    EARTH_RADIUS_KM * (0.998327 + 0.001673 * sinLat * sinLat);

  // Get local sidereal time
  const siderealTime = getSiderealTime(timestamp) + longitude / 15;
  const localSiderealTimeRad = (siderealTime * 15 * Math.PI) / 180;

  // Convert geocentric equatorial coordinates to rectangular coordinates
  const raRad = (geocentricPos.rightAscension * 15 * Math.PI) / 180;
  const decRad = (geocentricPos.declination * Math.PI) / 180;

  const geocentricX =
    geocentricPos.distance * Math.cos(decRad) * Math.cos(raRad);
  const geocentricY =
    geocentricPos.distance * Math.cos(decRad) * Math.sin(raRad);
  const geocentricZ = geocentricPos.distance * Math.sin(decRad);

  // Calculate the observer's position
  const observerX = observerRadius * cosLat * Math.cos(localSiderealTimeRad);
  const observerY = observerRadius * cosLat * Math.sin(localSiderealTimeRad);
  const observerZ = observerRadius * sinLat;

  // Calculate topocentric coordinates (from observer's position)
  const topocentricX = geocentricX - observerX;
  const topocentricY = geocentricY - observerY;
  const topocentricZ = geocentricZ - observerZ;

  // Convert back to spherical coordinates
  const topocentricDistance = Math.sqrt(
    topocentricX * topocentricX +
      topocentricY * topocentricY +
      topocentricZ * topocentricZ
  );

  const topocentricRA = Math.atan2(topocentricY, topocentricX);
  const topocentricDec = Math.asin(topocentricZ / topocentricDistance);

  // Convert to degrees
  const topocentricRAHours = (topocentricRA * 180) / Math.PI / 15;
  const topocentricDecDeg = (topocentricDec * 180) / Math.PI;

  return {
    rightAscension: (topocentricRAHours + 24) % 24,
    declination: topocentricDecDeg,
    distance: topocentricDistance,
  };
}

/**
 * Calculate next lunar events (quarter phases)
 * @param date - JavaScript Date object or timestamp
 * @return Object with dates of the next lunar phases
 */
function getLunarPhaseEvents(date) {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const currentPhase = getMoonPhase(timestamp);

  // Calculate time until upcoming major phases
  const timeToNewMoon =
    ((1 - currentPhase) * MOON_SYNODIC_PERIOD) % MOON_SYNODIC_PERIOD;
  const timeToFirstQuarter =
    ((0.25 - currentPhase + 1) % 1) * MOON_SYNODIC_PERIOD;
  const timeToFullMoon = ((0.5 - currentPhase + 1) % 1) * MOON_SYNODIC_PERIOD;
  const timeToLastQuarter =
    ((0.75 - currentPhase + 1) % 1) * MOON_SYNODIC_PERIOD;

  // Create Date objects for each phase
  const nextNewMoon = new Date(
    timestamp + timeToNewMoon * MILLISECONDS_PER_DAY
  );
  const nextFirstQuarter = new Date(
    timestamp + timeToFirstQuarter * MILLISECONDS_PER_DAY
  );
  const nextFullMoon = new Date(
    timestamp + timeToFullMoon * MILLISECONDS_PER_DAY
  );
  const nextLastQuarter = new Date(
    timestamp + timeToLastQuarter * MILLISECONDS_PER_DAY
  );

  return {
    newMoon: nextNewMoon,
    firstQuarter: nextFirstQuarter,
    fullMoon: nextFullMoon,
    lastQuarter: nextLastQuarter,
  };
}

/**
 * Calculate lunar libration angles (how much of lunar hemispheres are visible from Earth)
 * @param date - JavaScript Date object or timestamp
 * @return Object with libration angles in longitude and latitude
 */
function getLunarLibration(date) {
  const timestamp = date instanceof Date ? date.getTime() : date;
  const julianDay = getJulianDay(timestamp);

  // Time in Julian centuries since J2000.0
  const T = (julianDay - 2451545.0) / 36525;

  // Mean elements of lunar orbit
  const L0 = 218.316 + 481267.8811 * T - 0.00146 * T * T;
  const M = 357.529 + 35999.0503 * T - 0.0001559 * T * T; // Sun's mean anomaly
  const Mprime = 134.963 + 477198.8676 * T + 0.008721 * T * T; // Moon's mean anomaly
  const D = 297.85 + 445267.1115 * T - 0.00163 * T * T; // Mean elongation
  const F = 93.272 + 483202.0175 * T - 0.0034029 * T * T; // Argument of latitude
  const Omega = 125.045 - 1934.1362 * T + 0.002075 * T * T; // Longitude of ascending node

  // Convert to radians
  const Mrad = (M * Math.PI) / 180;
  const Mprimerad = (Mprime * Math.PI) / 180;
  const Drad = (D * Math.PI) / 180;
  const Frad = (F * Math.PI) / 180;
  const Omegarad = (Omega * Math.PI) / 180;

  // Optical libration in longitude (simplified)
  const sinOmega = Math.sin(Omegarad);
  const cosI = Math.cos((5.145 * Math.PI) / 180); // Inclination of lunar orbit
  const librationLongitude = (-Math.asin(sinOmega * cosI) * 180) / Math.PI;

  // Optical libration in latitude (simplified)
  const librationLatitude =
    (Math.asin(sinOmega * Math.sin(Frad)) * 180) / Math.PI;

  // Physical libration (much smaller effect, simplified)
  const physicalLongitude =
    -0.0297 * Math.sin(Mprimerad + Drad) -
    0.0102 * Math.sin(2 * Drad - Mprimerad);
  const physicalLatitude = 0.0275 * Math.sin(Mprimerad);

  // Total libration
  const totalLibrationLongitude = librationLongitude + physicalLongitude;
  const totalLibrationLatitude = librationLatitude + physicalLatitude;

  return {
    longitude: totalLibrationLongitude,
    latitude: totalLibrationLatitude,
  };
}
