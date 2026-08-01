/**
 * Tide-generating forces.
 *
 * The previous `moon.tidalForce` was `((altitude + 90) / 180) * fudge`, which
 * is a relabeled moon altitude: one peak per day, minimum when the Moon is
 * underfoot. Real tides do not work that way. The tide-raising potential is
 * the second-degree term
 *
 *     V₂ = (GM · R²) / d³ · (3cos²θ − 1) / 2
 *
 * where θ is the body's zenith angle. `cos²` means the Moon overhead and the
 * Moon at the nadir both raise a bulge — hence two high tides a day, not one.
 * The old curve had the second bulge exactly backwards, reporting a minimum
 * where the real answer is near-maximal.
 *
 * The Sun contributes too, at about 46% of the Moon's amplitude. Summing the
 * two gives spring and neap tides for free: they reinforce at new and full
 * moon and oppose at the quarters, so `range` traces the synodic month without
 * anything having to model it explicitly. Musically that is the useful part —
 * a semidiurnal pulse whose depth breathes over four weeks.
 *
 * These are *equilibrium* tides: the response of a hypothetical ocean covering
 * a rigid Earth. Real coastal tides are dominated by basin resonance and can
 * lag this by hours. Treat it as an honest astronomical driving force, not as
 * a tide-table prediction.
 */

import { PERIOD_SEMIDIURNAL_TIDE, PERIOD_SYNODIC_MONTH } from "./constants";
import type { SkyPosition } from "./ephemeris";
import {
  createCyclicValue,
  createNumberValue,
  degreesToRadians,
  type CyclicValue,
  type NumberValue,
} from "./values";

/**
 * Gravitational parameters (GM) in km³/s². Ratios are what matter here; the
 * absolute scale cancels out in the normalization below.
 */
const GM_MOON = 4902.8;
const GM_SUN = 132712440018;

const AU_IN_KM = 149597870.7;

/**
 * Reference amplitude: the lunar term at mean distance with the Moon
 * overhead. Dividing by it puts the Moon's own contribution near 1.0 and
 * keeps the numbers legible.
 */
const MOON_MEAN_DISTANCE_KM = 384400;
const REFERENCE = GM_MOON / MOON_MEAN_DISTANCE_KM ** 3;

/**
 * Extremes of the combined lunar + solar potential, measured by sweeping
 * 1900–2100 at six-hour steps across a spread of latitudes (see
 * `test/run.ts`, which re-checks these bounds and fails if a value escapes
 * them). Padded slightly so a rounding edge cannot clip.
 */
const POTENTIAL_MIN = -0.95;
const POTENTIAL_MAX = 1.95;

/** Observed span of `range` over the same sweep. */
const RANGE_MIN = 0.55;
const RANGE_MAX = 2.05;

/**
 * The P₂ Legendre polynomial in cos θ, where θ is zenith angle.
 * +1 directly overhead, +1 directly underfoot, −0.5 at the horizon.
 */
function legendreP2(zenithAngleDegrees: number): number {
  const cosTheta = Math.cos(degreesToRadians(zenithAngleDegrees));
  return (3 * cosTheta * cosTheta - 1) / 2;
}

function tidalTerm(
  gravitationalParameter: number,
  distanceKm: number,
  geometricAltitude: number
): number {
  const zenithAngle = 90 - geometricAltitude;
  return (
    ((gravitationalParameter / distanceKm ** 3) * legendreP2(zenithAngle)) /
    REFERENCE
  );
}

export interface TideResult {
  /**
   * Combined lunar + solar tide-raising potential at the observer, relative to
   * the Moon's mean overhead amplitude. Two maxima per lunar day.
   */
  potential: NumberValue;
  /** The Moon's share alone. */
  lunar: NumberValue;
  /** The Sun's share alone — roughly 46% of the Moon's amplitude. */
  solar: NumberValue;
  /**
   * Peak-to-trough amplitude available right now, which is what "spring tide"
   * and "neap tide" actually name. Rises toward new and full moon.
   */
  range: NumberValue;
  /**
   * Where we sit in the semidiurnal cycle, derived from the Moon's hour angle.
   * 0 and 0.5 are the two daily highs; 0.25 and 0.75 are the lows. Cyclic, so
   * `sin`/`cos` are safe to modulate with.
   */
  semidiurnalPhase: CyclicValue;
  /**
   * Position in the spring–neap cycle. 0 is spring (new moon), 0.5 is spring
   * again (full moon) — the cycle repeats twice per synodic month, which is
   * why this is a half-month phase rather than the moon phase itself.
   */
  springNeapPhase: CyclicValue;
}

export function generateTides({
  moonPosition,
  sunPosition,
  moonDistanceKm,
  sunDistanceAu,
  moonPhaseAngle,
  localSiderealTime,
  moonRightAscension,
}: {
  moonPosition: SkyPosition;
  sunPosition: SkyPosition;
  moonDistanceKm: number;
  sunDistanceAu: number;
  moonPhaseAngle: number;
  localSiderealTime: number;
  moonRightAscension: number;
}): TideResult {
  const lunar = tidalTerm(
    GM_MOON,
    moonDistanceKm,
    moonPosition.geometricAltitude
  );
  const solar = tidalTerm(
    GM_SUN,
    sunDistanceAu * AU_IN_KM,
    sunPosition.geometricAltitude
  );
  const potential = lunar + solar;

  // Spring/neap amplitude. The two terms align when the Sun and Moon share an
  // axis — that is, at syzygy — so the constructive case is governed by
  // cos(2 · phase angle), which peaks at both new and full moon.
  const lunarAmplitude = GM_MOON / moonDistanceKm ** 3 / REFERENCE;
  const solarAmplitude =
    GM_SUN / (sunDistanceAu * AU_IN_KM) ** 3 / REFERENCE;
  const alignment = Math.cos(degreesToRadians(2 * moonPhaseAngle));
  const range = 1.5 * (lunarAmplitude + solarAmplitude * alignment);

  // The Moon's hour angle drives the semidiurnal beat. Doubling it folds the
  // two daily bulges onto one cycle.
  const moonHourAngle = (localSiderealTime - moonRightAscension) * 15;

  return {
    potential: createNumberValue({
      value: potential,
      unit: "ratio",
      min: POTENTIAL_MIN,
      max: POTENTIAL_MAX,
    }),
    lunar: createNumberValue({
      value: lunar,
      unit: "ratio",
      min: -0.6,
      max: 1.25,
    }),
    solar: createNumberValue({
      value: solar,
      unit: "ratio",
      min: -0.3,
      max: 0.6,
    }),
    range: createNumberValue({
      value: range,
      unit: "ratio",
      min: RANGE_MIN,
      max: RANGE_MAX,
    }),
    semidiurnalPhase: createCyclicValue({
      value: moonHourAngle * 2,
      unit: "degrees",
      period: 360,
    }),
    springNeapPhase: createCyclicValue({
      value: moonPhaseAngle * 2,
      unit: "degrees",
      period: 360,
    }),
  };
}

export const TIDE_PERIODS = {
  semidiurnal: PERIOD_SEMIDIURNAL_TIDE,
  springNeap: PERIOD_SYNODIC_MONTH / 2,
};
