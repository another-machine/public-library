/**
 * Deterministic seed derivation.
 *
 * The sibling package describes itself as an engine "for shared procedural
 * experiences between disconnected devices". That only works if two devices
 * agree on the seed without talking to each other, which means the derivation
 * has to be stable across three kinds of drift:
 *
 *   - Clock drift. Two phones are never on the same millisecond. Quantizing
 *     time to a grid means both land in the same bucket for the whole
 *     interval, and they only disagree in the instant either side of a
 *     boundary.
 *   - Position drift. GPS jitters by tens of meters, so raw coordinates would
 *     reseed constantly. Quantizing to a degree grid fixes a listener to a
 *     cell that they have to genuinely walk out of before the music changes.
 *   - Engine drift. This is the subtle one, and it decides the whole design:
 *     the seed is derived from the *inputs*, not from the computed cosmic
 *     state.
 *
 * On that last point — it is tempting to hash the sky itself, so that the seed
 * "means" something astronomical. Don't. ECMAScript specifies `Math.sin`,
 * `Math.cos`, and `Math.pow` as implementation-approximated: V8,
 * JavaScriptCore, and SpiderMonkey are each free to return results differing
 * in the last bits, and they do. Every value in a cosmos result passes through
 * dozens of those calls. Almost always two engines land in the same quantized
 * bucket and agree — but near a bucket boundary they won't, and the failure is
 * rare, silent, and impossible to reproduce. Latitude, longitude and a
 * timestamp are exact IEEE-754 doubles, and the arithmetic below is limited to
 * operations the spec requires to be correctly rounded, so the result is
 * bit-identical everywhere.
 *
 * The cosmic state still shapes the *music* — it just does not shape the seed.
 */

export interface SeedResolution {
  /**
   * Size of one time bucket, in seconds. The seed is constant within a bucket.
   * Default 3600: a new seed every hour.
   */
  seconds: number;
  /**
   * Size of one position cell, in degrees. Default 0.25, roughly 28 km of
   * latitude — a neighborhood, not a street corner.
   */
  degrees: number;
}

export const DEFAULT_SEED_RESOLUTION: SeedResolution = {
  seconds: 3600,
  degrees: 0.25,
};

export interface SeedResult {
  /** Crockford base32, matching the alphabet `@amplib/procedural-generation` uses. */
  code: string;
  /** The same seed as an unsigned 32-bit integer. */
  integer: number;
  /** Start of the current time bucket, ms. The seed holds until `expiresAt`. */
  bucketStart: number;
  /** End of the current time bucket, ms. */
  expiresAt: number;
  /** Milliseconds until the seed changes. */
  millisecondsRemaining: number;
  /** The quantized inputs the seed was derived from, for debugging. */
  quantized: { latitude: number; longitude: number; timestamp: number };
}

// https://www.crockford.com/base32.html — same alphabet as Timecode, so codes
// from the two packages are visually consistent.
const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * FNV-1a, 32-bit. Chosen because it is defined entirely in terms of integer
 * multiply and xor, which `Math.imul` makes exact and identical on every
 * engine. A hash built on floating-point arithmetic would reintroduce exactly
 * the portability problem this module exists to avoid.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function encodeBase32(value: number, length: number): string {
  let out = "";
  let remaining = value >>> 0;
  for (let i = 0; i < length; i++) {
    out = BASE32[remaining % 32] + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

/**
 * Snap to a grid. `Math.round` on a quotient of exact doubles is itself exact,
 * so every engine produces the same integer.
 */
function quantize(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Derive a seed from a place and a time.
 *
 * Two devices within the same position cell and time bucket produce the same
 * `code` and `integer`, with no coordination. Feed `code` to `RandomEngine`
 * or `Timecode` from `@amplib/procedural-generation`.
 */
export function generateSeed({
  latitude,
  longitude,
  timestamp,
  resolution = DEFAULT_SEED_RESOLUTION,
  length = 8,
  namespace = "cosmos",
}: {
  latitude: number;
  longitude: number;
  timestamp: number;
  resolution?: SeedResolution;
  length?: number;
  namespace?: string;
}): SeedResult {
  const bucketMs = resolution.seconds * 1000;
  const bucketStart = Math.floor(timestamp / bucketMs) * bucketMs;

  const quantizedLatitude = quantize(latitude, resolution.degrees);
  // Longitude wraps, so ±180 must land in the same cell. Normalize into
  // [0, 360) before snapping, or a listener standing on the antimeridian gets
  // two different seeds depending on which side of it their GPS rounds to.
  const normalizedLongitude = ((longitude % 360) + 360) % 360;
  const quantizedLongitude = quantize(normalizedLongitude, resolution.degrees);

  // Fixed-point strings, so the hash input never depends on how an engine
  // chooses to print a float.
  const key = [
    namespace,
    bucketStart.toString(36),
    quantizedLatitude.toFixed(6),
    quantizedLongitude.toFixed(6),
  ].join("|");

  const integer = fnv1a(key);

  return {
    code: encodeBase32(integer, length),
    integer,
    bucketStart,
    expiresAt: bucketStart + bucketMs,
    millisecondsRemaining: bucketStart + bucketMs - timestamp,
    quantized: {
      latitude: quantizedLatitude,
      longitude: quantizedLongitude,
      timestamp: bucketStart,
    },
  };
}
