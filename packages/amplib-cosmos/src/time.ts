/**
 * Time conversions.
 *
 * Everything here is a pure function of a UTC millisecond timestamp. Nothing
 * reads the host's timezone, locale, or clock. That is deliberate: the whole
 * point of this library is that two disconnected devices at the same place and
 * moment derive the same state, and the previous implementation broke that by
 * calling `new Date(y, 0, 0)` and `Date#getHours()`, both of which resolve
 * against `process.env.TZ`.
 *
 * UT1 vs UTC: sidereal time is formally a function of UT1, which differs from
 * UTC by at most 0.9 s (leap seconds keep it bounded). 0.9 s of rotation is
 * 0.0037° of sky, well under the arcminute-scale accuracy of everything else
 * here, so we treat UTC as UT1 throughout.
 */

import {
  J2000_EPOCH,
  MILLISECONDS_PER_DAY,
  EARTH_ROTATION_PERIOD,
} from "./constants";
import { wrap } from "./values";

export type DateInput = Date | number;

/** Accept either a Date or a millisecond timestamp; always return the latter. */
export function toTimestamp(input: DateInput): number {
  return input instanceof Date ? input.getTime() : input;
}

/** Julian Day Number, including the fractional day. */
export function getJulianDay(timestamp: number): number {
  return (timestamp - J2000_EPOCH) / MILLISECONDS_PER_DAY + 2451545.0;
}

/** Days elapsed since J2000.0, fractional. Negative before 2000-01-01T12:00Z. */
export function getDaysSinceJ2000(timestamp: number): number {
  return (timestamp - J2000_EPOCH) / MILLISECONDS_PER_DAY;
}

/** Julian centuries since J2000.0. */
export function getJulianCenturies(timestamp: number): number {
  return getDaysSinceJ2000(timestamp) / 36525;
}

/**
 * Day of year, 1–366, in UTC.
 *
 * The previous version built its year boundary with the local-time `Date`
 * constructor and subtracted it from a UTC value, so the result shifted with
 * the host timezone and returned 0 for January 1st.
 */
export function getDayOfYear(timestamp: number): number {
  const date = new Date(timestamp);
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((timestamp - startOfYear) / MILLISECONDS_PER_DAY) + 1;
}

/** Fraction of the way through the UTC year, [0, 1). Leap-year aware. */
export function getYearFraction(timestamp: number): number {
  const year = new Date(timestamp).getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return (timestamp - start) / (end - start);
}

/** Fraction of the way through the UTC day, [0, 1). */
export function getDayFraction(timestamp: number): number {
  return wrap(timestamp, MILLISECONDS_PER_DAY) / MILLISECONDS_PER_DAY;
}

/** UTC midnight at the start of the day containing `timestamp`. */
export function getUTCDayStart(timestamp: number): number {
  return Math.floor(timestamp / MILLISECONDS_PER_DAY) * MILLISECONDS_PER_DAY;
}

/**
 * Greenwich Mean Sidereal Time, in hours [0, 24).
 *
 * IAU 1982 series (Aoki et al.), expressed in seconds of time. At J2000.0
 * this evaluates to 67310.54841 s = 18h 41m 50.548s, which is the defining
 * value — `test/run.ts` asserts exactly that.
 *
 * The previous implementation applied 0h-UT coefficients to `T` taken at the
 * actual instant and *then* added the elapsed hours on top, counting the day
 * fraction twice. That drifted up to 3.5 minutes of sidereal time (0.9° of
 * sky) depending on time of day.
 */
export function getGreenwichSiderealTime(timestamp: number): number {
  const T = getJulianCenturies(timestamp);
  const seconds =
    67310.54841 +
    (876600 * 3600 + 8640184.812866) * T +
    0.093104 * T * T -
    0.0000062 * T * T * T;
  return wrap(seconds / 3600, 24);
}

/**
 * Local Mean Sidereal Time at a longitude, in hours [0, 24).
 * East longitude is positive.
 */
export function getLocalSiderealTime(
  timestamp: number,
  longitude: number
): number {
  return wrap(getGreenwichSiderealTime(timestamp) + longitude / 15, 24);
}

/**
 * Earth Rotation Angle in degrees [0, 360), per the IAU 2000 definition.
 *
 * This is the actual angle through which the Earth has turned, measured
 * against the celestial intermediate origin. It advances once per *sidereal*
 * day. The previous `rotationAngle` returned the UTC day fraction times 360,
 * which is clock time wearing an astronomer's hat — it advanced once per solar
 * day and told you nothing that `localTime` did not.
 */
export function getEarthRotationAngle(timestamp: number): number {
  const days = getDaysSinceJ2000(timestamp);
  // ERA = 2π(0.7790572732640 + 1.00273781191135448 · days). Split the
  // multiplier into 1 + 0.00273781191135448 and drop the whole-day part of
  // the unit term, so the large product never eats the low-order bits of the
  // day fraction.
  const fraction = days - Math.floor(days);
  const turns = 0.779057273264 + fraction + 0.00273781191135448 * days;
  return wrap(turns, 1) * 360;
}

/**
 * Local mean solar time in hours [0, 24) — where the Sun actually is,
 * as opposed to what a civil clock says.
 *
 * This is a plain number of hours, not a `Date`. The previous version returned
 * `new Date(timestamp + longitude/15 * 3600e3)`, which looks convenient but
 * lies twice: its ISO form claims to be UTC when it is not, and calling
 * `getHours()` on it applies the host timezone *on top of* the longitude
 * offset that was already baked in.
 */
export function getLocalMeanSolarTime(
  timestamp: number,
  longitude: number
): number {
  return wrap(getDayFraction(timestamp) * 24 + longitude / 15, 24);
}

/** Sidereal days elapsed since J2000.0. */
export function getSiderealDaysSinceJ2000(timestamp: number): number {
  return (getDaysSinceJ2000(timestamp) * 24) / EARTH_ROTATION_PERIOD;
}
