import { EARTH_AXIAL_TILT, SUN_RADIUS_KM } from "./constants";
import { generateEarthSunDistance } from "./generateEarth";
import {
  createDateValue,
  createNumberValue,
  formatDate,
  formatWithUnits,
  getDayOfYear,
} from "./utilities";

export function generateSun({
  latitude,
  longitude,
  timestamp,
}: {
  latitude: number;
  longitude: number;
  timestamp: number;
}) {
  const elevation = generateSolarElevation(latitude, longitude, timestamp);
  const azimuth = generateSolarAzimuth(latitude, longitude, timestamp);
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
 * Calculate the solar azimuth angle for a given location and time
 * @param latitude - Latitude in degrees
 * @param longitude - Longitude in degrees
 * @param timestamp
 * @return Solar azimuth angle in degrees (0 = North, 90 = East, 180 = South, 270 = West)
 */
export function generateSolarAzimuth(
  latitude: number,
  longitude: number,
  timestamp: number
): number {
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
 * Calculate the solar elevation angle for a given location and time
 */
export function generateSolarElevation(
  latitude: number,
  longitude: number,
  timestamp: number
): number {
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
 * Calculate the apparent angular diameter of the Sun as seen from Earth
 * @param timestamp
 * @return Angular diameter in degrees
 */
function getSolarAngularDiameter(timestamp: number): number {
  const distance = generateEarthSunDistance(timestamp);

  // Angular diameter = 2 * arctan(radius / distance)
  const angularRadians = 2 * Math.atan(SUN_RADIUS_KM / distance);

  // Convert to degrees
  return (angularRadians * 180) / Math.PI;
}

/**
 * Calculate the solar declination (sun's angle relative to Earth's equator)
 */
function getSolarDeclination(timestamp: number): number {
  const dayOfYear = getDayOfYear(timestamp);

  // Approximate formula for solar declination
  return -EARTH_AXIAL_TILT * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
}

/**
 * Calculate sunrise time for a given location and date
 * @param latitude - Latitude in degrees
 * @param longitude - Longitude in degrees
 * @param timestamp
 * @return Sunrise time as Date object, or null if no sunrise (polar day/night)
 */
function getSunrise(
  latitude: number,
  longitude: number,
  timestamp: number
): Date | null {
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
 * @param timestamp
 * @return Sunset time as Date object, or null if no sunset (polar day/night)
 */
function getSunset(
  latitude: number,
  longitude: number,
  timestamp: number
): Date | null {
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
 * @param timestamp
 * @return Day length in hours, or null if polar day/night
 */
function getDayLength(
  latitude: number,
  longitude: number,
  timestamp: number
): number | null {
  const sunrise = getSunrise(latitude, longitude, timestamp);
  const sunset = getSunset(latitude, longitude, timestamp);

  if (!sunrise && !sunset) {
    // Check if we're in polar day or polar night
    const solarElevationAtNoon = generateSolarElevation(
      latitude,
      longitude,
      timestamp
    );
    return solarElevationAtNoon > 0 ? 24 : 0; // 24 hours if polar day, 0 if polar night
  } else if (!sunrise || !sunset) {
    return null; // Should not happen, but included for completeness
  }

  return (sunset.getTime() - sunrise.getTime()) / (1000 * 60 * 60); // Convert milliseconds to hours
}
