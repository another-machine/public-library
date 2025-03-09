import {
  J2000_EPOCH,
  MILLISECONDS_PER_DAY,
  ASTRONOMICAL_UNIT_IN_KM,
} from "./constants";
import { generateEarthSunDistance } from "./generateEarth";
import { generateSolarElevation, generateSolarAzimuth } from "./generateSun";
import {
  createStringValue,
  createBooleanValue,
  createNumberValue,
  formatWithUnits,
  getDayOfYear,
} from "./utilities";

interface PlanetVisibilityInfo {
  isVisible: boolean;
  altitude: number;
  azimuth: number;
  magnitude: number;
  angularDiameter: number;
  phase: number;
}

export function generatePlanets({
  latitude,
  longitude,
  timestamp,
}: {
  latitude: number;
  longitude: number;
  timestamp: number;
}): {
  [k: string]: PlanetVisibilityInfo;
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
 * Calculate planet visibility (simplified)
 * @param planetName - Name of the planet
 * @param latitude - Observer's latitude in degrees
 * @param longitude - Observer's longitude in degrees
 * @param timestamp
 */
function getPlanetVisibility(
  planetName: string,
  latitude: number,
  longitude: number,
  timestamp: number
): PlanetVisibilityInfo {
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
  const earthSunDist =
    generateEarthSunDistance(timestamp) / ASTRONOMICAL_UNIT_IN_KM;
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
  const sunAlt = generateSolarElevation(latitude, longitude, timestamp);
  const sunAz = generateSolarAzimuth(latitude, longitude, timestamp);

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
