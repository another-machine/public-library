/**
 * Core coordinate transform pipeline for accurate planet positions.
 *
 * Uses simplified orbital elements from Paul Schlyter:
 *   http://www.stjarnhimlen.se/comp/ppcomp.html
 * Accurate to < 1° for dates 1990–2050 (< 2° for outer planets without perturbations,
 * < 1° with the included Jupiter/Saturn/Uranus perturbation corrections).
 *
 * Pipeline: heliocentric ecliptic → geocentric ecliptic → equatorial → horizontal
 *
 * IMPORTANT: Schlyter's epoch is 2000 Jan 0.0 UT = JD 2451543.5,
 * which is 1.5 days BEFORE the standard J2000.0 epoch (JD 2451545.0).
 */

import { MILLISECONDS_PER_DAY } from "./constants";
import { getSiderealTime } from "./utilities";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Schlyter's epoch: 1999-12-31 00:00 UTC (JD 2451543.5) */
const SCHLYTER_EPOCH_MS = Date.UTC(1999, 11, 31, 0, 0, 0, 0);

export function getDaysSinceSchlyterEpoch(timestamp: number): number {
  return (timestamp - SCHLYTER_EPOCH_MS) / MILLISECONDS_PER_DAY;
}

/** Orbital elements: [epoch_value, secular_rate_per_day]. All angles in degrees, a in AU. */
interface PlanetElements {
  N: [number, number]; // longitude of ascending node (Ω)
  i: [number, number]; // inclination to ecliptic
  w: [number, number]; // argument of perihelion
  a: [number, number]; // semi-major axis (AU)
  e: [number, number]; // eccentricity
  M: [number, number]; // mean anomaly (epoch + rate per day)
}

const ELEMENTS: Record<string, PlanetElements> = {
  mercury: {
    N: [48.3313, 3.24587e-5],
    i: [7.0047, 5.0e-8],
    w: [29.1241, 1.01444e-5],
    a: [0.387098, 0],
    e: [0.205635, 5.59e-10],
    M: [168.6562, 4.0923344368],
  },
  venus: {
    N: [76.6799, 2.4659e-5],
    i: [3.3946, 2.75e-8],
    w: [54.891, 1.38374e-5],
    a: [0.72333, 0],
    e: [0.006773, -1.302e-9],
    M: [48.0052, 1.6021302244],
  },
  earth: {
    N: [0.0, 0],
    i: [0.0, 0],
    w: [282.9404, 4.70935e-5],
    a: [1.0, 0],
    e: [0.016709, -1.151e-9],
    M: [356.047, 0.9856002585],
  },
  mars: {
    N: [49.5574, 2.11081e-5],
    i: [1.8497, -1.78e-8],
    w: [286.5016, 2.92961e-5],
    a: [1.523688, 0],
    e: [0.093405, 2.516e-9],
    M: [18.6021, 0.5240207766],
  },
  jupiter: {
    N: [100.4542, 2.76854e-5],
    i: [1.303, -1.557e-7],
    w: [273.8777, 1.64505e-5],
    a: [5.20256, 0],
    e: [0.048498, 4.469e-9],
    M: [19.895, 0.0830853001],
  },
  saturn: {
    N: [113.6634, 2.3898e-5],
    i: [2.4886, -1.081e-7],
    w: [339.3939, 2.97661e-5],
    a: [9.55475, 0],
    e: [0.055546, -9.499e-9],
    M: [316.967, 0.0334442282],
  },
  uranus: {
    N: [74.0005, 1.3978e-5],
    i: [0.7733, 1.9e-8],
    w: [96.6612, 3.0565e-5],
    a: [19.18171, -1.55e-8],
    e: [0.047318, 7.45e-9],
    M: [142.5905, 0.011725806],
  },
  neptune: {
    N: [131.7806, 3.0173e-5],
    i: [1.77, -2.55e-8],
    w: [272.8461, -6.027e-6],
    a: [30.05826, 3.313e-8],
    e: [0.008606, 2.15e-9],
    M: [260.2471, 0.005995147],
  },
};

/** Normalize angle to [0, 360) degrees. */
function normDeg(x: number): number {
  return ((x % 360) + 360) % 360;
}

function evalElement(elem: [number, number], d: number): number {
  return elem[0] + elem[1] * d;
}

/**
 * Solve Kepler's equation: M = E - e*sin(E)
 * Returns eccentric anomaly E in radians. Uses Newton-Raphson iteration.
 */
function solveKepler(M_deg: number, e: number): number {
  const M = normDeg(M_deg) * DEG;
  // Initial estimate
  let E = M + e * Math.sin(M) * (1.0 + e * Math.cos(M));
  for (let i = 0; i < 50; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1.0 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

interface HeliocentricPos {
  x: number; // AU, heliocentric ecliptic rectangular
  y: number;
  z: number;
  r: number; // AU, distance from sun
  v: number; // true anomaly (degrees, 0 = perihelion)
  meanAnomaly: number; // degrees (for perturbation calculations)
}

function computeHeliocentricPos(
  elements: PlanetElements,
  d: number
): HeliocentricPos {
  const N = normDeg(evalElement(elements.N, d)) * DEG;
  const i = evalElement(elements.i, d) * DEG;
  const w = normDeg(evalElement(elements.w, d)) * DEG;
  const a = evalElement(elements.a, d);
  const e = evalElement(elements.e, d);
  const M_deg = evalElement(elements.M, d);

  const E = solveKepler(M_deg, e);

  // True anomaly via rectangular coords in orbital plane
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1.0 - e * e) * Math.sin(E);
  const v = normDeg(Math.atan2(yv, xv) * RAD);
  const r = Math.sqrt(xv * xv + yv * yv);

  // Rotate to ecliptic plane using N, i, w (all in radians; v converted below)
  const sum = v * DEG + w; // true anomaly + argument of perihelion, in radians

  const x =
    r *
    (Math.cos(N) * Math.cos(sum) - Math.sin(N) * Math.sin(sum) * Math.cos(i));
  const y =
    r *
    (Math.sin(N) * Math.cos(sum) + Math.cos(N) * Math.sin(sum) * Math.cos(i));
  const z = r * Math.sin(sum) * Math.sin(i);

  return { x, y, z, r, v, meanAnomaly: normDeg(M_deg) };
}

/**
 * Perturbation corrections for Jupiter, Saturn, and Uranus.
 * Returns {dLon, dLat} in degrees to add to geocentric ecliptic coordinates.
 * Based on Schlyter's perturbation terms.
 */
function computePerturbations(
  name: string,
  M: Record<string, number>
): { dLon: number; dLat: number } {
  const Mj = M["jupiter"] * DEG;
  const Ms = M["saturn"] * DEG;
  const Mu = M["uranus"] * DEG;

  if (name === "jupiter") {
    const dLon =
      -0.332 * Math.sin(2 * Mj - 5 * Ms - 67.6 * DEG) +
      0.056 * Math.sin(2 * Mj - 2 * Ms + 21 * DEG) +
      0.042 * Math.sin(3 * Mj - 5 * Ms + 21 * DEG) -
      0.036 * Math.sin(Mj - 2 * Ms) +
      0.022 * Math.cos(Mj - Ms) +
      0.023 * Math.sin(2 * Mj - 3 * Ms + 52 * DEG) -
      0.016 * Math.sin(Mj - 5 * Ms - 69 * DEG);
    return { dLon, dLat: 0 };
  }

  if (name === "saturn") {
    const dLon =
      0.812 * Math.sin(2 * Mj - 5 * Ms - 67.6 * DEG) -
      0.229 * Math.cos(2 * Mj - 4 * Ms - 2 * DEG) +
      0.119 * Math.sin(Mj - 2 * Ms - 3 * DEG) +
      0.046 * Math.sin(2 * Mj - 6 * Ms - 69 * DEG) +
      0.014 * Math.sin(Mj - 3 * Ms + 32 * DEG);
    const dLat =
      -0.02 * Math.cos(2 * Mj - 4 * Ms - 2 * DEG) +
      0.018 * Math.sin(2 * Mj - 6 * Ms - 49 * DEG);
    return { dLon, dLat };
  }

  if (name === "uranus") {
    const dLon =
      0.04 * Math.sin(Ms - 2 * Mu + 6 * DEG) +
      0.035 * Math.sin(Ms - 3 * Mu + 33 * DEG) -
      0.015 * Math.sin(Mj - Mu + 20 * DEG);
    return { dLon, dLat: 0 };
  }

  return { dLon: 0, dLat: 0 };
}

/** Obliquity of the ecliptic in degrees (Schlyter's formula). */
export function getObliquity(d: number): number {
  return 23.4393 - 3.563e-7 * d;
}

/**
 * Convert geocentric ecliptic rectangular coordinates to equatorial RA/Dec.
 * Returns RA in degrees [0, 360) and Dec in degrees [-90, 90].
 */
function eclipticToEquatorial(
  x: number,
  y: number,
  z: number,
  obliqDeg: number
): { ra: number; dec: number } {
  const obliq = obliqDeg * DEG;
  const ye = y * Math.cos(obliq) - z * Math.sin(obliq);
  const ze = y * Math.sin(obliq) + z * Math.cos(obliq);
  const ra = normDeg(Math.atan2(ye, x) * RAD);
  const dec = Math.atan2(ze, Math.sqrt(x * x + ye * ye)) * RAD;
  return { ra, dec };
}

/**
 * Convert equatorial RA/Dec to local horizontal altitude/azimuth.
 * @param ra - Right ascension in degrees
 * @param dec - Declination in degrees
 * @param lst - Local sidereal time in degrees
 * @param observerLat - Observer latitude in degrees
 * @returns altitude (-90 to 90), azimuth (0=N, 90=E, 180=S, 270=W)
 */
function equatorialToHorizontal(
  ra: number,
  dec: number,
  lst: number,
  observerLat: number
): { alt: number; az: number } {
  const ha = normDeg(lst - ra) * DEG; // hour angle in radians
  const decRad = dec * DEG;
  const latRad = observerLat * DEG;

  const sinAlt =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * RAD;

  const cosAz =
    (Math.sin(decRad) - Math.sin(latRad) * sinAlt) /
    (Math.cos(latRad) * Math.cos(alt * DEG));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) * RAD;
  if (Math.sin(ha) > 0) az = 360 - az;

  return { alt, az };
}

export interface GeocentricPosition {
  lon: number; // geocentric ecliptic longitude (degrees, 0-360)
  lat: number; // geocentric ecliptic latitude (degrees)
  dist: number; // distance from Earth (AU)
  ra: number; // right ascension (degrees, 0-360)
  dec: number; // declination (degrees, -90 to 90)
  alt: number; // altitude above horizon (degrees, -90 to 90)
  az: number; // azimuth (degrees, 0=N, 90=E, 180=S, 270=W)
  heliocentricDist: number; // distance from sun (AU)
  trueAnomaly: number; // degrees (0 = perihelion)
  meanAnomaly: number; // degrees
  elongation: number; // angular separation from Sun (degrees, 0-180)
  // Geocentric rectangular (ecliptic) for downstream use
  gx: number;
  gy: number;
  gz: number;
}

export interface AllPlanetPositions {
  planets: Record<string, GeocentricPosition>;
  // Earth's heliocentric position — used for elongation and Sun direction
  earthX: number;
  earthY: number;
  earthZ: number;
  // Geocentric direction to Sun (unit vector in ecliptic frame)
  sunDirX: number;
  sunDirY: number;
  sunDirZ: number;
}

const PLANET_NAMES = [
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
] as const;

export type PlanetName = (typeof PLANET_NAMES)[number];

/**
 * Compute geocentric positions for all planets in a single pass.
 * Earth's heliocentric position is computed once and reused.
 */
export function computeAllPlanetPositions(
  timestamp: number,
  observerLat: number,
  observerLon: number
): AllPlanetPositions {
  const d = getDaysSinceSchlyterEpoch(timestamp);

  // Compute heliocentric positions for all bodies in one pass
  const helio: Record<string, HeliocentricPos> = {};
  const meanAnomalies: Record<string, number> = {};

  for (const name of [...PLANET_NAMES, "earth"] as const) {
    const pos = computeHeliocentricPos(ELEMENTS[name], d);
    helio[name] = pos;
    meanAnomalies[name] = pos.meanAnomaly;
  }

  // IMPORTANT: Schlyter's "earth" elements compute the Sun's geocentric position
  // vector (direction from Earth to Sun), NOT Earth's heliocentric position.
  // Earth's heliocentric position = -sunGeo.
  const sunGeo = helio["earth"];
  const earthR = sunGeo.r;

  // Sun direction from Earth (unit vector pointing Earth → Sun)
  const sunDirX = sunGeo.x / earthR;
  const sunDirY = sunGeo.y / earthR;
  const sunDirZ = sunGeo.z / earthR;

  const obliq = getObliquity(d);

  // Local sidereal time in degrees: GMST (hours) * 15 + longitude
  const lst = normDeg(getSiderealTime(timestamp) * 15 + observerLon);

  const planets: Record<string, GeocentricPosition> = {};

  for (const name of PLANET_NAMES) {
    const planet = helio[name];

    // Geocentric ecliptic rectangular:
    // geocentric = planet_heliocentric - earth_heliocentric
    //            = planet_heliocentric - (-sunGeo)
    //            = planet_heliocentric + sunGeo
    let gx = planet.x + sunGeo.x;
    let gy = planet.y + sunGeo.y;
    let gz = planet.z + sunGeo.z;

    const dist = Math.sqrt(gx * gx + gy * gy + gz * gz);

    // Geocentric ecliptic spherical
    let lon = normDeg(Math.atan2(gy, gx) * RAD);
    let lat = Math.atan2(gz, Math.sqrt(gx * gx + gy * gy)) * RAD;

    // Apply perturbation corrections
    const { dLon, dLat } = computePerturbations(name, meanAnomalies);
    lon = normDeg(lon + dLon);
    lat += dLat;

    // Recompute Cartesian from corrected spherical (preserving dist)
    const cosLat = Math.cos(lat * DEG);
    gx = dist * cosLat * Math.cos(lon * DEG);
    gy = dist * cosLat * Math.sin(lon * DEG);
    gz = dist * Math.sin(lat * DEG);

    // Equatorial coordinates
    const { ra, dec } = eclipticToEquatorial(gx, gy, gz, obliq);

    // Horizontal coordinates
    const { alt, az } = equatorialToHorizontal(ra, dec, lst, observerLat);

    // Elongation: angle between planet and Sun as seen from Earth (3D)
    const pDirX = gx / dist;
    const pDirY = gy / dist;
    const pDirZ = gz / dist;
    const dotProduct =
      pDirX * sunDirX + pDirY * sunDirY + pDirZ * sunDirZ;
    const elongation =
      Math.acos(Math.max(-1, Math.min(1, dotProduct))) * RAD;

    planets[name] = {
      lon,
      lat,
      dist,
      ra,
      dec,
      alt,
      az,
      heliocentricDist: planet.r,
      trueAnomaly: planet.v,
      meanAnomaly: planet.meanAnomaly,
      elongation,
      gx,
      gy,
      gz,
    };
  }

  return {
    planets,
    // Earth's heliocentric position = -sunGeo (opposite of Sun's geocentric direction).
    // Used in generatePlanets.ts to recover heliocentric planet coordinates: helio = geo + earthH.
    earthX: -sunGeo.x,
    earthY: -sunGeo.y,
    earthZ: -sunGeo.z,
    sunDirX,
    sunDirY,
    sunDirZ,
  };
}

/** Sidereal orbital periods in days. */
export const SIDEREAL_PERIODS_DAYS: Record<string, number> = {
  mercury: 87.969,
  venus: 224.701,
  earth: 365.256,
  mars: 686.996,
  jupiter: 4332.589,
  saturn: 10759.22,
  uranus: 30688.5,
  neptune: 60182.0,
};

/**
 * Synodic periods in days (Earth-relative beat period).
 * Used as LFO periods in generative signals.
 */
export const SYNODIC_PERIODS_DAYS: Record<string, number> = {
  mercury: 115.88,
  venus: 583.92,
  mars: 779.94,
  jupiter: 398.88,
  saturn: 378.09,
  uranus: 369.66,
  neptune: 367.49,
};

/**
 * Compute the angular separation between two geocentric positions (degrees).
 * Uses the full 3D vector dot-product approach.
 */
export function angularSeparation(
  pos1: Pick<GeocentricPosition, "gx" | "gy" | "gz" | "dist">,
  pos2: Pick<GeocentricPosition, "gx" | "gy" | "gz" | "dist">
): number {
  const d1x = pos1.gx / pos1.dist;
  const d1y = pos1.gy / pos1.dist;
  const d1z = pos1.gz / pos1.dist;
  const d2x = pos2.gx / pos2.dist;
  const d2y = pos2.gy / pos2.dist;
  const d2z = pos2.gz / pos2.dist;
  const dot = d1x * d2x + d1y * d2y + d1z * d2z;
  return Math.acos(Math.max(-1, Math.min(1, dot))) * RAD;
}
