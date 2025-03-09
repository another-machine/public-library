import {
  EARTH_MEAN_SOLAR_DAY,
  EARTH_ROTATION_PERIOD,
  J2000_EPOCH,
  MILLISECONDS_PER_DAY,
} from "./constants";

export interface AstronomicalValue<T> {
  value: T;
  description: string;
}

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

export type DateInput = Date | number;

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
 * Calculate the Julian Day for a given date
 */
export function getJulianDay(timestamp: number): number {
  return (timestamp - J2000_EPOCH) / MILLISECONDS_PER_DAY + 2451545.0;
}

/**
 * Calculate day of year (1-366)
 */
export function getDayOfYear(timestamp: number): number {
  const dateObj = new Date(timestamp);
  const startOfYear = new Date(dateObj.getUTCFullYear(), 0, 0);
  const diff = dateObj.getTime() - startOfYear.getTime();
  return Math.floor(diff / MILLISECONDS_PER_DAY);
}

/**
 * Convert solar (mean) time to sidereal time
 * @param timestamp
 * @return Local sidereal time in decimal hours (0-24)
 */
export function getSiderealTime(timestamp: number): number {
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
