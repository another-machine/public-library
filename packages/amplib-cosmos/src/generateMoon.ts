import {
  MOON_SYNODIC_PERIOD,
  MILLISECONDS_PER_DAY,
  MOON_RADIUS_KM,
  EARTH_RADIUS_KM,
} from "./constants";
import {
  createDateValue,
  createNumberValue,
  createStringValue,
  formatDate,
  formatWithUnits,
  getJulianDay,
  getSiderealTime,
} from "./utilities";

export type MoonPhaseDescription =
  | "New Moon"
  | "Waxing Crescent"
  | "First Quarter"
  | "Waxing Gibbous"
  | "Full Moon"
  | "Waning Gibbous"
  | "Last Quarter"
  | "Waning Crescent";

export function generateMoon({
  latitude,
  longitude,
  timestamp,
}: {
  latitude: number;
  longitude: number;
  timestamp: number;
}) {
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
 * Calculate the moon phase (0-1, where 0 and 1 = new moon, 0.5 = full moon)
 * @param timestamp
 * @return Moon phase as a value from 0 to 1
 */
function getMoonPhase(timestamp: number): number {
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
 * @param timestamp
 * @return Description of moon phase
 */
function getMoonPhaseDescription(timestamp: number): MoonPhaseDescription {
  const phase = getMoonPhase(timestamp);

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
 * @param timestamp
 * @return Percentage of moon illuminated (0-100)
 */
function getMoonIllumination(timestamp: number): number {
  const phase = getMoonPhase(timestamp);

  // Calculate illumination percentage (0 at new moon, 100 at full moon, 0 at next new moon)
  // The illumination follows a cosine curve
  const illumination = 50 * (1 - Math.cos(2 * Math.PI * phase));

  return illumination;
}

/**
 * Calculate the next full moon date after the given date
 * @param timestamp
 * @return Date of the next full moon
 */
function getNextFullMoon(timestamp: number): Date {
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
 * @param timestamp
 * @return Date of the next new moon
 */
function getNextNewMoon(timestamp: number): Date {
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
 * Calculate the apparent angular diameter of the Moon as seen from Earth
 * @param timestamp
 * @return Angular diameter in degrees
 */
function getLunarAngularDiameter(timestamp: number): number {
  const distance = getMoonDistance(timestamp);

  // Angular diameter = 2 * arctan(radius / distance)
  const angularRadians = 2 * Math.atan(MOON_RADIUS_KM / distance);

  // Convert to degrees
  return (angularRadians * 180) / Math.PI;
}

/**
 * Calculate tidal force at a given location due to the Moon
 * @param latitude - Latitude in degrees
 * @param longitude - Longitude in degrees
 * @param timestamp
 * @return Relative tidal force (unitRange between 0-1)
 */
function getLunarTidalForce(
  latitude: number,
  longitude: number,
  timestamp: number
): number {
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
 * Calculate Moon's position using a simplified version of Meeus' algorithm
 * @param timestamp
 * @returns Object with equatorial coordinates (right ascension, declination) and distance
 */
function getMoonPosition(timestamp: number) {
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
 * @param timestamp
 * @return Object with altitude and azimuth in degrees
 */
function getMoonHorizontalCoordinates(
  latitude: number,
  longitude: number,
  timestamp: number
) {
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
 * @param timestamp
 * @return Moon's altitude in degrees
 */
function getMoonAltitude(
  latitude: number,
  longitude: number,
  timestamp: number
) {
  return getMoonHorizontalCoordinates(latitude, longitude, timestamp).altitude;
}

/**
 * Updated function to get Moon's azimuth
 * @param latitude - Latitude in degrees
 * @param longitude - Longitude in degrees
 * @param timestamp
 * @return Moon's azimuth in degrees
 */
function getMoonAzimuth(
  latitude: number,
  longitude: number,
  timestamp: number
) {
  return getMoonHorizontalCoordinates(latitude, longitude, timestamp).azimuth;
}

/**
 * Updated function to get Moon's distance
 * @param timestamp
 * @return Distance in kilometers
 */
function getMoonDistance(timestamp: number) {
  return getMoonPosition(timestamp).distance;
}

/**
 * Calculate the topocentric (observed from Earth's surface) position of the Moon
 * @param latitude - Observer's latitude in degrees
 * @param longitude - Observer's longitude in degrees
 * @param timestamp
 * @returns Object with topocentric coordinates
 */
function getTopocentricMoonPosition(
  latitude: number,
  longitude: number,
  timestamp: number
) {
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
 * @param timestamp
 * @return Object with dates of the next lunar phases
 */
function getLunarPhaseEvents(timestamp: number) {
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
 * @param timestamp
 * @return Object with libration angles in longitude and latitude
 */
function getLunarLibration(timestamp: number) {
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
