import {
  AllPlanetPositions,
  SYNODIC_PERIODS_DAYS,
  getDaysSinceSchlyterEpoch,
} from "./generateCoordinates";
import { createNumberValue, formatWithUnits, NumberValue } from "./utilities";
import { MOON_SYNODIC_PERIOD, MILLISECONDS_PER_DAY } from "./constants";

const DEG = Math.PI / 180;

export interface Signals {
  /**
   * Orbital clocks — each cycles 0→1 over the given period, useful as LFOs.
   * All use days-since-Schlyter-epoch modulo the period, so they are
   * deterministic and continuous for any timestamp.
   */
  diurnalClock: NumberValue; // 0-1 over one solar day (24h)
  lunarClock: NumberValue; // 0-1 over one synodic month (29.53d)
  annualClock: NumberValue; // 0-1 over one tropical year (365.25d)
  mercurySynodicClock: NumberValue; // 0-1 over 115.88d
  venusSynodicClock: NumberValue; // 0-1 over 583.92d
  marsSynodicClock: NumberValue; // 0-1 over 779.94d
  jupiterSynodicClock: NumberValue; // 0-1 over 398.88d
  saturnSynodicClock: NumberValue; // 0-1 over 378.09d

  /**
   * Resonance proximity signals — peak near 1.0 when planets approach
   * a harmonic orbital relationship; return to 0 when far from resonance.
   *
   * Jupiter-Saturn 5:2 near-resonance (Great Conjunction cycle ~20yr):
   *   Jupiter completes ~5 orbits while Saturn completes ~2. The beat period
   *   is ~7253 days. Signal = cos²(π * fractional_deviation) normalized.
   *
   * Venus-Earth 8:13 near-resonance (8 Earth years ≈ 13 Venus years):
   *   Beat period ~2919 days. Produces the famous Venus pentagram.
   */
  jupiterSaturnResonance: NumberValue;
  venusEarthResonance: NumberValue;

  /** Normalized count of planets currently above the horizon (0–7 mapped to 0–1). */
  visiblePlanetCount: NumberValue;

  /** Composite: mean elongation of all planets from the Sun (0-1, 1=spread evenly). */
  planetarySpread: NumberValue;
}

/**
 * Resonance proximity: how close the current orbital phase difference is to
 * the target ratio p:q. Returns 0-1, peaking at 1 when planets are at the
 * harmonic moment.
 */
function resonanceProximity(
  phase1_days: number,
  period1: number,
  phase2_days: number,
  period2: number,
  p: number,
  q: number
): number {
  // Angular velocity ratio relative to the p:q resonance
  // Resonance angle: θ = p*λ1 - q*λ2, where λ = 2π*t/T
  const angle = (2 * Math.PI * phase1_days) / period1;
  const angle2 = (2 * Math.PI * phase2_days) / period2;
  const resonanceAngle = p * angle - q * angle2;
  // Proximity peaks when resonanceAngle ≈ 0 (mod 2π)
  return (1 + Math.cos(resonanceAngle)) / 2;
}

export function generateSignals(
  allPositions: AllPlanetPositions,
  timestamp: number
): Signals {
  const d = getDaysSinceSchlyterEpoch(timestamp);
  const dateObj = new Date(timestamp);

  // Diurnal clock: fraction through current UTC day
  const diurnalClock =
    (dateObj.getUTCHours() * 3600 +
      dateObj.getUTCMinutes() * 60 +
      dateObj.getUTCSeconds() +
      dateObj.getUTCMilliseconds() / 1000) /
    86400;

  // Lunar clock: fraction through synodic month
  const lunarClock = ((d / MOON_SYNODIC_PERIOD) % 1 + 1) % 1;

  // Annual clock: fraction through tropical year
  const TROPICAL_YEAR = 365.2422;
  const annualClock = ((d / TROPICAL_YEAR) % 1 + 1) % 1;

  // Synodic clocks for each planet
  function synodicClock(name: string): number {
    return ((d / SYNODIC_PERIODS_DAYS[name]) % 1 + 1) % 1;
  }

  // Resonance signals
  const jupiterSaturnResonance = resonanceProximity(
    d,
    4332.589, // Jupiter sidereal
    d,
    10759.22, // Saturn sidereal
    5,
    2
  );

  const venusEarthResonance = resonanceProximity(
    d,
    224.701, // Venus sidereal
    d,
    365.256, // Earth sidereal
    13,
    8
  );

  // Visible planet count (above horizon)
  const aboveHorizonCount = Object.values(allPositions.planets).filter(
    (p) => p.alt > 0
  ).length;
  const visiblePlanetCount = aboveHorizonCount / 7;

  // Planetary spread: normalized mean elongation (how spread out planets are)
  const elongations = Object.values(allPositions.planets).map(
    (p) => p.elongation
  );
  const meanElongation =
    elongations.reduce((sum, e) => sum + e, 0) / elongations.length;
  const planetarySpread = meanElongation / 180;

  const msc = synodicClock("mercury");
  const vsc = synodicClock("venus");
  const marsc = synodicClock("mars");
  const jsc = synodicClock("jupiter");
  const ssc = synodicClock("saturn");

  return {
    diurnalClock: createNumberValue({
      value: diurnalClock,
      unitRange: diurnalClock,
      description: `Diurnal clock: ${(diurnalClock * 24).toFixed(2)}h into UTC day`,
    }),
    lunarClock: createNumberValue({
      value: lunarClock,
      unitRange: lunarClock,
      description: `Lunar synodic clock: ${(lunarClock * MOON_SYNODIC_PERIOD).toFixed(1)} days into lunar month`,
    }),
    annualClock: createNumberValue({
      value: annualClock,
      unitRange: annualClock,
      description: `Annual clock: ${(annualClock * 365.25).toFixed(0)} days into tropical year`,
    }),
    mercurySynodicClock: createNumberValue({
      value: msc,
      unitRange: msc,
      description: `Mercury synodic clock (115.88d cycle)`,
    }),
    venusSynodicClock: createNumberValue({
      value: vsc,
      unitRange: vsc,
      description: `Venus synodic clock (583.92d cycle)`,
    }),
    marsSynodicClock: createNumberValue({
      value: marsc,
      unitRange: marsc,
      description: `Mars synodic clock (779.94d cycle)`,
    }),
    jupiterSynodicClock: createNumberValue({
      value: jsc,
      unitRange: jsc,
      description: `Jupiter synodic clock (398.88d cycle)`,
    }),
    saturnSynodicClock: createNumberValue({
      value: ssc,
      unitRange: ssc,
      description: `Saturn synodic clock (378.09d cycle)`,
    }),
    jupiterSaturnResonance: createNumberValue({
      value: jupiterSaturnResonance,
      unitRange: jupiterSaturnResonance,
      description: `Jupiter-Saturn 5:2 resonance proximity (peaks at Great Conjunction)`,
    }),
    venusEarthResonance: createNumberValue({
      value: venusEarthResonance,
      unitRange: venusEarthResonance,
      description: `Venus-Earth 8:13 resonance proximity (pentagram cycle ~8yr)`,
    }),
    visiblePlanetCount: createNumberValue({
      value: aboveHorizonCount,
      unitRange: visiblePlanetCount,
      description: `Planets above horizon: ${aboveHorizonCount}/7`,
    }),
    planetarySpread: createNumberValue({
      value: meanElongation,
      unitRange: planetarySpread,
      description: `Mean planet elongation from Sun: ${formatWithUnits(meanElongation, "degrees")}`,
    }),
  };
}
