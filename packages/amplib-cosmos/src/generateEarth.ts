import {
  EARTH_RADIUS_KM,
  EARTH_ROTATION_PERIOD,
  EARTH_ORBITAL_ECCENTRICITY,
  EARTH_SUN_MEAN_DISTANCE_KM,
  EARTH_ORBITAL_PERIOD,
} from "./constants";
import {
  createNumberValue,
  createStringValue,
  formatWithUnits,
  getDayOfYear,
  getJulianDay,
} from "./utilities";

export type Season = "Spring" | "Summer" | "Fall" | "Winter";

export function generateEarth({
  timestamp,
  latitude,
}: {
  timestamp: number;
  latitude: number;
}) {
  const rotationAngle = getEarthRotationAngle(timestamp);
  const orbitalPosition = getEarthOrbitalPosition(timestamp);
  const distanceFromSun = generateEarthSunDistance(timestamp);
  const orbitalVelocity = getEarthOrbitalVelocity(timestamp);
  const rotationalVelocity = getEarthRotationalVelocity({ latitude });

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
    rotationalVelocity: createNumberValue({
      value: rotationalVelocity,
      unitRange: rotationalVelocity / 1674, // Normalized to equatorial max of ~1674 km/h
      description: `Rotational velocity at this latitude: ${formatWithUnits(
        rotationalVelocity,
        "km/h"
      )}`,
    }),
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
 * Calculate the rotational velocity at a specific latitude
 * @param latitude - Latitude in degrees
 * @returns Rotational velocity in km/h
 */
function getEarthRotationalVelocity({ latitude }: { latitude: number }) {
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
 * Calculate Earth-Sun distance at a given time
 */
export function generateEarthSunDistance(timestamp: number): number {
  const meanAnomaly = (getEarthOrbitalPosition(timestamp) * Math.PI) / 180;
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
 * Calculate Earth's rotation angle at a given time
 */
function getEarthRotationAngle(timestamp: number): number {
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
 * Calculate Earth's position in its orbit (angle from perihelion)
 */
function getEarthOrbitalPosition(timestamp: number): number {
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
 * Calculate Earth's orbital velocity at a given point in its orbit
 * @param timestamp
 * @return Orbital velocity in km/s
 */
function getEarthOrbitalVelocity(timestamp: number): number {
  // Earth's average orbital velocity is approximately 29.78 km/s
  const averageVelocity =
    (2 * Math.PI * EARTH_SUN_MEAN_DISTANCE_KM) /
    (EARTH_ORBITAL_PERIOD * 24 * 60 * 60);

  // Earth's velocity varies due to orbital eccentricity
  // It's faster at perihelion and slower at aphelion
  const orbitalPosition = (getEarthOrbitalPosition(timestamp) * Math.PI) / 180; // Convert to radians

  // Distance affects velocity (closer = faster)
  const distance = generateEarthSunDistance(timestamp);
  const velocityFactor = EARTH_SUN_MEAN_DISTANCE_KM / distance;

  // Apply Kepler's law of equal areas in equal times
  return averageVelocity * velocityFactor;
}

/**
 * Determine the current season in the Northern Hemisphere
 */
function getNorthernHemisphereSeason(timestamp: number): Season {
  const dayOfYear = getDayOfYear(timestamp);

  if (dayOfYear >= 80 && dayOfYear < 172) return "Spring";
  if (dayOfYear >= 172 && dayOfYear < 266) return "Summer";
  if (dayOfYear >= 266 && dayOfYear < 355) return "Fall";
  return "Winter";
}

/**
 * Helper function to get the southern hemisphere season (opposite of northern)
 */
function getSouthernHemisphereSeason(timestamp: number): Season {
  const northernSeason = getNorthernHemisphereSeason(timestamp);
  const oppositeSeasons: Record<Season, Season> = {
    Spring: "Fall",
    Summer: "Winter",
    Fall: "Spring",
    Winter: "Summer",
  };
  return oppositeSeasons[northernSeason];
}
