import {
  createDateValue,
  createNumberValue,
  formatWithUnits,
  getSiderealTime,
} from "./utilities";

/**
 * Get observer-related information
 */
export function generateObserver({
  latitude,
  longitude,
  timestamp,
}: {
  latitude: number;
  longitude: number;
  timestamp: number;
}) {
  const dateObj = getLocalTimeFromLongitude(timestamp, longitude);
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
