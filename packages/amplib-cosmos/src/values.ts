/**
 * The value contract.
 *
 * Every numeric leaf in a cosmos result carries its real-world value *and*
 * pre-normalised forms, because the consumer is usually a synthesiser that
 * wants a 0–1 or -1–1 control signal rather than degrees or kilometres.
 *
 * Three guarantees hold for every `NumberValue` this module produces:
 *
 *   1. `unitRange` is always in [0, 1].
 *   2. `bipolarRange` is always in [-1, 1], and always equals `2 * unitRange - 1`.
 *   3. `min` and `max` state the domain the normalisation used, so a consumer
 *      can re-derive or re-scale it instead of trusting a magic number.
 *
 * Nothing here allocates a string. Human-readable text is opt-in and lives in
 * `describe.ts`, because `generate()` gets called inside animation frames.
 */

export type Unit =
  | "degrees"
  | "arcseconds"
  | "hours"
  | "minutes"
  | "days"
  | "seconds"
  | "km"
  | "au"
  | "km/h"
  | "km/s"
  | "percent"
  | "magnitude"
  | "ratio"
  | "phase"
  | "count";

export interface NumberValue {
  /** The value in its real unit. Never clamped. */
  value: number;
  unit: Unit;
  /** Domain used for normalisation. */
  min: number;
  max: number;
  /** `value` mapped onto [0, 1] and clamped. */
  unitRange: number;
  /** `value` mapped onto [-1, 1] and clamped. Always `2 * unitRange - 1`. */
  bipolarRange: number;
}

/**
 * A value that wraps around — an angle, a phase, a time of day.
 *
 * `unitRange` is the position within the cycle, so it jumps from 1 back to 0
 * once per period. Feeding that discontinuity straight into a filter cutoff
 * or an oscillator produces an audible click, so every cyclic value also
 * carries `sin` and `cos`, which are continuous across the wrap. Use those
 * for anything modulating a continuous parameter, and `unitRange` only where
 * a hard reset is what you want (triggering an event, indexing a table).
 */
export interface CyclicValue extends NumberValue {
  /** sin(2π · phase). Continuous across the wrap point. */
  sin: number;
  /** cos(2π · phase). Continuous across the wrap point. */
  cos: number;
  /** Length of one full cycle, in the same unit as `value`. */
  period: number;
}

export interface StringValue<T extends string = string> {
  value: T;
  /** The full set of values this field can take, in cycle order. */
  options: readonly T[];
  /** Index of `value` within `options`. */
  index: number;
  /** `index / options.length`, so a category can drive a control signal too. */
  unitRange: number;
}

export interface BooleanValue {
  value: boolean;
  /** 1 when true, 0 when false. Saves a ternary at every call site. */
  unitRange: number;
}

export interface EventValue {
  /** Milliseconds since the Unix epoch, or null when the event cannot occur. */
  timestamp: number | null;
  /** ISO-8601 in UTC. Never locale-formatted — that would not be portable. */
  iso: string | null;
  /** Signed seconds from the evaluated instant. Negative means it has passed. */
  secondsUntil: number | null;
}

export interface VectorValue {
  x: number;
  y: number;
  z: number;
  /** Euclidean length of the vector, in `unit`. */
  length: number;
  unit: Unit;
}

export function clamp(value: number, low = 0, high = 1): number {
  return value < low ? low : value > high ? high : value;
}

/**
 * Wrap `value` into [0, period). Correct for negative input, which the
 * JavaScript `%` operator is not.
 */
export function wrap(value: number, period: number): number {
  const result = value % period;
  return result < 0 ? result + period : result;
}

/** Wrap into [-period/2, period/2). Useful for signed angular differences. */
export function wrapSigned(value: number, period: number): number {
  return wrap(value + period / 2, period) - period / 2;
}

export const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;
export const radiansToDegrees = (radians: number) => (radians * 180) / Math.PI;

export function createNumberValue({
  value,
  unit,
  min,
  max,
}: {
  value: number;
  unit: Unit;
  min: number;
  max: number;
}): NumberValue {
  // A degenerate domain would divide by zero. Fall back to the midpoint
  // rather than emitting NaN into a signal chain.
  const span = max - min;
  const unitRange = span === 0 ? 0.5 : clamp((value - min) / span);
  return {
    value,
    unit,
    min,
    max,
    unitRange,
    bipolarRange: unitRange * 2 - 1,
  };
}

export function createCyclicValue({
  value,
  unit,
  period,
}: {
  value: number;
  unit: Unit;
  period: number;
}): CyclicValue {
  const wrapped = wrap(value, period);
  const unitRange = wrapped / period;
  const radians = unitRange * Math.PI * 2;
  return {
    value: wrapped,
    unit,
    min: 0,
    max: period,
    period,
    unitRange,
    bipolarRange: unitRange * 2 - 1,
    sin: Math.sin(radians),
    cos: Math.cos(radians),
  };
}

export function createStringValue<T extends string>(
  value: T,
  options: readonly T[]
): StringValue<T> {
  const index = options.indexOf(value);
  return {
    value,
    options,
    index,
    unitRange: options.length ? clamp(index / options.length) : 0,
  };
}

export function createBooleanValue(value: boolean): BooleanValue {
  return { value, unitRange: value ? 1 : 0 };
}

export function createEventValue(
  timestamp: number | null,
  now: number
): EventValue {
  if (timestamp === null || !Number.isFinite(timestamp)) {
    return { timestamp: null, iso: null, secondsUntil: null };
  }
  return {
    timestamp,
    iso: new Date(timestamp).toISOString(),
    secondsUntil: (timestamp - now) / 1000,
  };
}

export function createVectorValue(
  { x, y, z }: { x: number; y: number; z: number },
  unit: Unit
): VectorValue {
  return { x, y, z, length: Math.sqrt(x * x + y * y + z * z), unit };
}

/**
 * Altitude above the horizon, in degrees.
 *
 * Normalised over [-90, 90] rather than clamped at the horizon, so a body
 * below the horizon still reports a meaningful position. The old
 * implementation clamped the lower half to zero, which threw away half the
 * signal and made "just set" indistinguishable from "at the nadir".
 */
export function createAltitudeValue(degrees: number): NumberValue {
  return createNumberValue({
    value: degrees,
    unit: "degrees",
    min: -90,
    max: 90,
  });
}

/** Azimuth in degrees, cyclic: 0 = north, 90 = east, 180 = south, 270 = west. */
export function createAzimuthValue(degrees: number): CyclicValue {
  return createCyclicValue({ value: degrees, unit: "degrees", period: 360 });
}
