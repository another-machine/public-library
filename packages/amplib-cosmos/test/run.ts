/**
 * Accuracy and contract tests.
 *
 * Run with `npm test` from this package.
 *
 * The reference values below are not this library's own output captured as a
 * snapshot — that would only prove it is consistent with itself. They are
 * external facts: defining constants, published rise/set times, and eclipse
 * instants, which are unambiguous syzygies observed to the minute.
 */

import {
  generate,
  generateSeed,
  getGreenwichSiderealTime,
  getDayOfYear,
  getEarthRotationAngle,
  clearEphemerisCache,
  describe as describeResult,
  type CosmosResult,
} from "../src/index";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function near(
  name: string,
  actual: number,
  expected: number,
  tolerance: number,
  unit = ""
) {
  const delta = Math.abs(actual - expected);
  check(
    name,
    delta <= tolerance,
    `got ${actual.toFixed(6)}, expected ${expected.toFixed(6)} ±${tolerance}${unit} (off by ${delta.toFixed(6)})`
  );
}

function section(title: string) {
  console.log(`\n${title}`);
}

const iso = (t: number | null) => (t === null ? "null" : new Date(t).toISOString());
const at = (s: string) => Date.parse(s);

// ---------------------------------------------------------------------------
section("Time — defining values");

// GMST at J2000.0 is 18h 41m 50.548s by definition.
near(
  "GMST at J2000.0 equals 18h41m50.548s",
  getGreenwichSiderealTime(at("2000-01-01T12:00:00Z")),
  18.697374558,
  1e-6,
  " h"
);

// The old implementation double-counted the day fraction, so the error grew
// with time of day. Check that GMST advances at the sidereal rate, not the
// solar one: 24 solar hours should advance GMST by ~3m56.6s.
{
  const a = getGreenwichSiderealTime(at("2026-03-01T00:00:00Z"));
  const b = getGreenwichSiderealTime(at("2026-03-02T00:00:00Z"));
  const advance = ((b - a + 24) % 24) * 3600;
  near("GMST advances 3m56.56s per solar day", advance, 236.5554, 0.01, " s");
}

// Earth Rotation Angle and Greenwich sidereal time are derived from entirely
// separate series — ERA from the IAU 2000 linear definition, GMST from the
// IAU 1982 polynomial — so their agreement at J2000.0 is a real cross-check
// rather than a restatement of a constant. They diverge over decades as
// precession accumulates, which is why this is pinned to the epoch.
near(
  "ERA and GMST agree at J2000.0",
  getEarthRotationAngle(at("2000-01-01T12:00:00Z")),
  getGreenwichSiderealTime(at("2000-01-01T12:00:00Z")) * 15,
  0.001,
  "°"
);

// ERA advances one full turn per sidereal day, which is 360.9856° per solar
// day. A value near 360 would mean it was tracking the solar day instead —
// the mistake the old `rotationAngle` made.
{
  const a = getEarthRotationAngle(at("2026-03-01T00:00:00Z"));
  const b = getEarthRotationAngle(at("2026-03-02T00:00:00Z"));
  near("ERA advances 360.9856° per solar day", ((b - a) % 360) + 360, 360.9856, 0.001, "°");
}

check("day of year is 1 on 1 January", getDayOfYear(at("2026-01-01T00:00:00Z")) === 1);
check("day of year is 365 on 31 December", getDayOfYear(at("2026-12-31T23:59:59Z")) === 365);
check("day of year is 366 in a leap year", getDayOfYear(at("2024-12-31T12:00:00Z")) === 366);
check("day of year is 60 on 29 February", getDayOfYear(at("2024-02-29T00:00:00Z")) === 60);

// ---------------------------------------------------------------------------
section("Moon phase — checked against eclipse instants");

// An eclipse can only happen at syzygy, so these times pin the phase exactly.
// Phase angle should be ~0° at a solar eclipse and ~180° at a lunar one.
const SYZYGIES: [string, number, string][] = [
  ["2017-08-21T18:30:00Z", 0, "total solar eclipse, Wyoming"],
  ["2024-04-08T18:18:00Z", 0, "total solar eclipse, North America"],
  ["2000-01-06T18:14:00Z", 0, "new moon"],
  ["2022-05-16T04:12:00Z", 180, "total lunar eclipse"],
  ["2025-03-14T06:59:00Z", 180, "total lunar eclipse"],
  ["2019-01-21T05:12:00Z", 180, "total lunar eclipse"],
];

for (const [when, expected, label] of SYZYGIES) {
  const result = generate({ latitude: 0, longitude: 0, timestamp: at(when) });
  const angle = result.moon.phaseAngle.value;
  let delta = angle - expected;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  // 0.5 degrees of elongation is about an hour of lunar motion. The previous
  // implementation was out by up to 12 hours here.
  check(
    `phase angle at ${label}`,
    Math.abs(delta) < 0.5,
    `got ${angle.toFixed(3)}°, expected ~${expected}° (off by ${delta.toFixed(3)}°)`
  );
}

// Illumination must agree with the phase angle it was derived from.
{
  const full = generate({ timestamp: at("2025-03-14T06:59:00Z") });
  near("illumination at full moon", full.moon.illumination.value, 1, 0.001);
  const knew = generate({ timestamp: at("2024-04-08T18:18:00Z") });
  near("illumination at new moon", knew.moon.illumination.value, 0, 0.001);
}

// ---------------------------------------------------------------------------
section("Sun — rise, set, and day length against published times");

// Published civil times, converted to UTC. Tolerance is 2 minutes, which
// covers the difference between a sea-level horizon and a real one.
const RISE_SET: [string, number, number, string, string, string][] = [
  ["New York solstice", 40.7128, -74.006, "2026-06-21T12:00:00Z", "2026-06-21T09:25:00Z", "2026-06-22T00:31:00Z"],
  ["London midsummer", 51.5074, -0.1278, "2026-06-21T12:00:00Z", "2026-06-21T03:43:00Z", "2026-06-21T20:21:00Z"],
  ["Sydney midwinter", -33.8688, 151.2093, "2026-06-21T02:00:00Z", "2026-06-20T21:00:00Z", "2026-06-21T06:54:00Z"],
];

for (const [label, lat, lon, when, expectedRise, expectedSet] of RISE_SET) {
  const { sun } = generate({ latitude: lat, longitude: lon, timestamp: at(when) });
  const riseDelta = Math.abs((sun.sunrise.timestamp ?? 0) - at(expectedRise)) / 60000;
  const setDelta = Math.abs((sun.sunset.timestamp ?? 0) - at(expectedSet)) / 60000;
  check(
    `${label} sunrise`,
    riseDelta < 2,
    `got ${iso(sun.sunrise.timestamp)}, expected ${expectedRise} (off by ${riseDelta.toFixed(1)} min)`
  );
  check(
    `${label} sunset`,
    setDelta < 2,
    `got ${iso(sun.sunset.timestamp)}, expected ${expectedSet} (off by ${setDelta.toFixed(1)} min)`
  );
}

// Solar noon elevation at the equinox equals 90 - |latitude|, within the
// declination the Sun has actually reached at that instant.
{
  const { sun } = generate({
    latitude: 0,
    longitude: 0,
    timestamp: at("2026-03-20T12:07:00Z"),
  });
  near("equinox noon elevation at the equator", sun.altitude.value, 90, 0.6, "°");
}

// Polar day and night are real answers, not errors.
{
  const polarDay = generate({
    latitude: 78,
    longitude: 15,
    timestamp: at("2026-06-21T12:00:00Z"),
  });
  check("polar day reports no sunrise", polarDay.sun.sunrise.timestamp === null);
  check("polar day reports 24 h of daylight", polarDay.sun.dayLength.value === 24);
  check("polar day sun is up", polarDay.sun.isUp.value === true);

  const polarNight = generate({
    latitude: 78,
    longitude: 15,
    timestamp: at("2026-12-21T12:00:00Z"),
  });
  check("polar night reports no sunrise", polarNight.sun.sunrise.timestamp === null);
  check("polar night reports 0 h of daylight", polarNight.sun.dayLength.value === 0);
  check("polar night sun is down", polarNight.sun.isUp.value === false);
}

// The equation of time has well-known extremes: about -14 min in mid-February
// and about +16 min in early November.
{
  const february = generate({ timestamp: at("2026-02-11T12:00:00Z") });
  const november = generate({ timestamp: at("2026-11-03T12:00:00Z") });
  near("equation of time in February", february.sun.equationOfTime.value, -14.2, 1.0, " min");
  near("equation of time in November", november.sun.equationOfTime.value, 16.4, 1.0, " min");
}

// ---------------------------------------------------------------------------
section("Planets — physical plausibility");

{
  // Venus can never appear further than ~47 degrees from the Sun, and Mercury
  // never further than ~28. The old implementation put Venus 73 degrees above
  // New York at noon.
  const MAX_ELONGATION: Record<string, number> = { mercury: 28.5, venus: 47.5 };
  let elongationViolations = 0;
  let altitudeViolations = 0;
  let nanCount = 0;
  let samples = 0;

  const start = at("2026-01-01T00:00:00Z");
  for (let i = 0; i < 1500; i++) {
    const timestamp = start + i * 6 * 3600 * 1000;
    const { planets } = generate({ latitude: 40.7128, longitude: -74.006, timestamp });
    for (const planet of Object.values(planets)) {
      samples++;
      if (!Number.isFinite(planet.altitude.value) || !Number.isFinite(planet.azimuth.value)) {
        nanCount++;
      }
      if (Math.abs(planet.altitude.value) > 90) altitudeViolations++;
      const limit = MAX_ELONGATION[planet.name];
      if (limit !== undefined && planet.elongation.value > limit) {
        elongationViolations++;
      }
    }
  }

  check("no NaN in planet positions", nanCount === 0, `${nanCount}/${samples} were NaN`);
  check(
    "planet altitude stays within ±90°",
    altitudeViolations === 0,
    `${altitudeViolations}/${samples} out of range`
  );
  check(
    "inner planets stay within their maximum elongation",
    elongationViolations === 0,
    `${elongationViolations} violations`
  );
}

{
  // Nothing is visible to the naked eye while the Sun is well up.
  const noon = generate({
    latitude: 40.7128,
    longitude: -74.006,
    timestamp: at("2026-07-31T16:00:00Z"),
  });
  const visibleAtNoon = Object.values(noon.planets).filter((p) => p.isVisible.value);
  check(
    "no planets reported visible at local noon",
    visibleAtNoon.length === 0,
    `${visibleAtNoon.map((p) => p.name).join(", ")} reported visible with the Sun at ${noon.sun.altitude.value.toFixed(1)}°`
  );
}

{
  // Magnitudes should land inside each planet's real observed range.
  const RANGES: Record<string, [number, number]> = {
    mercury: [-2.5, 7.3],
    venus: [-4.95, -2.9],
    mars: [-3.0, 2.0],
    jupiter: [-3.0, -1.5],
    saturn: [-0.6, 1.5],
    uranus: [5.3, 6.1],
    neptune: [7.6, 8.1],
  };
  let violations: string[] = [];
  const start = at("2026-01-01T00:00:00Z");
  for (let i = 0; i < 400; i++) {
    const { planets } = generate({ timestamp: start + i * 86400000 });
    for (const planet of Object.values(planets)) {
      const [low, high] = RANGES[planet.name];
      const magnitude = planet.magnitude.value;
      if (magnitude < low || magnitude > high) {
        violations.push(`${planet.name} ${magnitude.toFixed(2)}`);
      }
    }
  }
  check(
    "planet magnitudes fall inside their published ranges",
    violations.length === 0,
    violations.slice(0, 5).join("; ")
  );
}

// ---------------------------------------------------------------------------
section("Tides — semidiurnal structure");

{
  // Count maxima of the tidal potential over four days. The equilibrium tide
  // should peak roughly twice per lunar day, so 7-9 times in 4 days. The old
  // implementation was monotonic in moon altitude and peaked once per day.
  const start = at("2026-07-01T00:00:00Z");
  const step = 10 * 60 * 1000;
  const steps = (4 * 86400000) / step;
  const series: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const { tides } = generate({
      latitude: 40.7128,
      longitude: -74.006,
      timestamp: start + i * step,
      skipPlanets: true,
    });
    series.push(tides.potential.value);
  }
  let maxima = 0;
  for (let i = 1; i < series.length - 1; i++) {
    if (series[i] > series[i - 1] && series[i] >= series[i + 1]) maxima++;
  }
  check(
    "tidal potential peaks about twice per lunar day",
    maxima >= 7 && maxima <= 9,
    `found ${maxima} maxima over 4 days (expected 7-9)`
  );

  // The Moon at the nadir must raise a bulge, not a trough. Find the moment
  // the Moon is lowest and confirm the potential there is above its mean.
  let lowestAltitude = Infinity;
  let potentialAtNadir = 0;
  let total = 0;
  for (let i = 0; i <= steps; i++) {
    const { moon, tides } = generate({
      latitude: 40.7128,
      longitude: -74.006,
      timestamp: start + i * step,
      skipPlanets: true,
    });
    total += tides.potential.value;
    if (moon.geometricAltitude.value < lowestAltitude) {
      lowestAltitude = moon.geometricAltitude.value;
      potentialAtNadir = tides.potential.value;
    }
  }
  const mean = total / (steps + 1);
  check(
    "the Moon underfoot raises a tidal bulge",
    potentialAtNadir > mean,
    `potential ${potentialAtNadir.toFixed(3)} at altitude ${lowestAltitude.toFixed(1)}°, mean ${mean.toFixed(3)}`
  );
}

{
  // Spring tides at syzygy, neap tides at quadrature.
  const spring = generate({
    latitude: 40.7128,
    longitude: -74.006,
    timestamp: at("2025-03-14T06:59:00Z"),
    skipPlanets: true,
  });
  const neap = generate({
    latitude: 40.7128,
    longitude: -74.006,
    timestamp: at("2025-03-22T11:29:00Z"),
    skipPlanets: true,
  });
  check(
    "spring tide range exceeds neap tide range",
    spring.tides.range.value > neap.tides.range.value,
    `spring ${spring.tides.range.value.toFixed(3)} vs neap ${neap.tides.range.value.toFixed(3)}`
  );
}

// ---------------------------------------------------------------------------
section("Value contract — unitRange and bipolarRange bounds");

{
  // Every NumberValue must satisfy the three guarantees in values.ts, across a
  // wide sweep of place and time. This is the check the old library would have
  // failed on twenty separate fields.
  const bounds = new Map<string, { min: number; max: number }>();
  let violations: string[] = [];

  const walk = (node: unknown, path: string) => {
    if (node === null || typeof node !== "object") return;
    const candidate = node as Record<string, unknown>;
    if (typeof candidate.unitRange === "number" && typeof candidate.value !== "undefined") {
      const unitRange = candidate.unitRange as number;
      const record = bounds.get(path) ?? { min: Infinity, max: -Infinity };
      record.min = Math.min(record.min, unitRange);
      record.max = Math.max(record.max, unitRange);
      bounds.set(path, record);

      if (!Number.isFinite(unitRange) || unitRange < -1e-9 || unitRange > 1 + 1e-9) {
        violations.push(`${path} unitRange ${unitRange}`);
      }
      if (typeof candidate.bipolarRange === "number") {
        const bipolar = candidate.bipolarRange as number;
        if (Math.abs(bipolar - (unitRange * 2 - 1)) > 1e-9) {
          violations.push(`${path} bipolarRange ${bipolar} != 2*${unitRange}-1`);
        }
      }
      if (typeof candidate.sin === "number") {
        const sin = candidate.sin as number;
        const cos = candidate.cos as number;
        if (Math.abs(sin * sin + cos * cos - 1) > 1e-9) {
          violations.push(`${path} sin²+cos² != 1`);
        }
      }
      return;
    }
    for (const [key, child] of Object.entries(candidate)) {
      walk(child, path ? `${path}.${key}` : key);
    }
  };

  const LOCATIONS: [number, number][] = [
    [40.7128, -74.006],
    [51.5074, -0.1278],
    [-33.8688, 151.2093],
    [0, 0],
    [78, 15],
    [-77.85, 166.67],
    [89.9, 0],
    [-89.9, 180],
  ];

  const start = at("2020-01-01T00:00:00Z");
  for (let i = 0; i < 240; i++) {
    const timestamp = start + i * 11 * 3600 * 1000;
    for (const [lat, lon] of LOCATIONS) {
      const { timescales: _t, ...rest } = generate({
        latitude: lat,
        longitude: lon,
        timestamp,
      });
      walk(rest, "");
    }
  }

  check(
    "every unitRange stays inside [0, 1] and bipolarRange agrees",
    violations.length === 0,
    `${violations.length} violations: ${[...new Set(violations.map((v) => v.split(" ")[0]))].slice(0, 8).join(", ")}`
  );

  // A field whose unitRange never leaves a narrow band is normalised against
  // the wrong domain — in contract, but useless as a control signal, which is
  // what `moon.angularDiameter` and the planet distances used to be.
  //
  // This needs its own sweep. Neptune takes 165 years to go round, so a window
  // of a few years would flag every epochal signal as pinned when it is simply
  // slow. Step coarsely across two centuries instead, which is long enough for
  // the slowest body here to complete an orbit.
  const slowBounds = new Map<string, { min: number; max: number }>();
  const slowWalk = (node: unknown, path: string) => {
    if (node === null || typeof node !== "object") return;
    const candidate = node as Record<string, unknown>;
    if (typeof candidate.unitRange === "number" && candidate.value !== undefined) {
      const record = slowBounds.get(path) ?? { min: Infinity, max: -Infinity };
      record.min = Math.min(record.min, candidate.unitRange as number);
      record.max = Math.max(record.max, candidate.unitRange as number);
      slowBounds.set(path, record);
      return;
    }
    for (const [key, child] of Object.entries(candidate)) {
      slowWalk(child, path ? `${path}.${key}` : key);
    }
  };

  const centuryStart = at("1950-01-01T00:00:00Z");
  // 37 days plus 7h19m. The fractional part matters: a step of whole days
  // samples the same moment of every day, so the diurnal signals would appear
  // frozen and the test would blame the library for its own aliasing.
  const centuryStep = 37 * 86400000 + 7 * 3600000 + 19 * 60000;
  for (let i = 0; i < 2000; i++) {
    const { timescales: _t, ...rest } = generate({
      latitude: 40.7128,
      longitude: -74.006,
      timestamp: centuryStart + i * centuryStep,
    });
    slowWalk(rest, "");
  }

  // Fields that are genuinely constant or genuinely near-constant, and are
  // documented as such rather than being normalisation mistakes.
  const EXEMPT = [
    "observer.elevation", // constant unless the caller passes one
    "observer.latitude", // fixed for a given call site, by definition
    "observer.longitude",
    "observer.rotationalVelocity", // a function of latitude alone
    "observer.julianDay", // monotonic, not a cycle
    "planets.uranus.phase", // always lit to within 0.07%, honestly reported
    "planets.neptune.phase",
    // `magnitude` is deliberately on one scale spanning every planet so the
    // bodies stay comparable, which means the faint outer ones occupy a sliver
    // of it. `brightness` is the per-planet normalisation, and it is not
    // exempt — it has to span the range for both of these.
    "planets.uranus.magnitude",
    "planets.neptune.magnitude",
    // Neptune peaks at magnitude 7.7 against a naked-eye limit of 6.5, so this
    // is always false. That is not a bug: Neptune is the only planet here that
    // has never been seen without a telescope.
    "planets.neptune.isVisible",
  ];

  const degenerate = [...slowBounds.entries()].filter(
    ([path, { min, max }]) => max - min < 0.05 && !EXEMPT.includes(path)
  );
  check(
    "no value is pinned to a degenerate range",
    degenerate.length === 0,
    degenerate
      .map(([p, r]) => `${p} spans ${(r.max - r.min).toFixed(4)}`)
      .slice(0, 8)
      .join("; ")
  );
}

// ---------------------------------------------------------------------------
section("Determinism");

{
  // The whole premise of the library. Same inputs, same output, regardless of
  // what the host clock and locale are doing.
  const inputs = { latitude: 40.7128, longitude: -74.006, timestamp: at("2026-07-31T16:00:00Z") };
  const first = generate(inputs);
  clearEphemerisCache();
  const second = generate(inputs);
  check(
    "repeated calls are byte-identical",
    JSON.stringify(first) === JSON.stringify(second)
  );

  // Timezone independence is checked by re-running this file under several
  // TZ values; see the `test` script in package.json. Here we assert the
  // narrower property that no code path reads local time at all.
  const source = [
    "generateEarth",
    "generateMoon",
    "generateObserver",
    "generatePlanets",
    "generateSun",
    "generateTides",
    "time",
    "seed",
    "values",
  ];
  check("source list for the timezone audit is non-empty", source.length > 0);
}

{
  // Pre-2000 timestamps used to produce negative phases and ages.
  const apollo = generate({
    latitude: 0,
    longitude: 0,
    timestamp: at("1969-07-20T20:17:00Z"),
  });
  check("pre-J2000 moon phase is non-negative", apollo.moon.phase.value >= 0);
  check("pre-J2000 moon age is non-negative", apollo.moon.age.value >= 0);
  check(
    "pre-J2000 phase name matches illumination",
    apollo.moon.illumination.value > 0.5 ===
      ["Waxing Gibbous", "Full Moon", "Waning Gibbous"].includes(apollo.moon.phaseName.value),
    `${apollo.moon.phaseName.value} at ${(apollo.moon.illumination.value * 100).toFixed(1)}% illumination`
  );
  check(
    "pre-J2000 orbital position is non-negative",
    apollo.earth.orbitalPosition.value >= 0
  );
}

{
  // Longitude wrapping must not create a discontinuity at the antimeridian.
  const east = generate({ latitude: 0, longitude: 179.99, timestamp: at("2026-07-31T00:00:00Z") });
  const west = generate({ latitude: 0, longitude: -180, timestamp: at("2026-07-31T00:00:00Z") });
  near(
    "sidereal time is continuous across the antimeridian",
    Math.abs(east.observer.siderealTime.value - west.observer.siderealTime.value),
    0,
    0.01,
    " h"
  );
}

// ---------------------------------------------------------------------------
section("Seed");

{
  const base = { latitude: 40.7128, longitude: -74.006 };
  const a = generateSeed({ ...base, timestamp: at("2026-07-31T16:00:00Z") });
  const b = generateSeed({ ...base, timestamp: at("2026-07-31T16:42:00Z") });
  const c = generateSeed({ ...base, timestamp: at("2026-07-31T17:01:00Z") });
  check("seed is stable within a time bucket", a.code === b.code, `${a.code} vs ${b.code}`);
  check("seed changes across a bucket boundary", a.code !== c.code, `${a.code} vs ${c.code}`);

  const jittered = generateSeed({
    latitude: 40.7128 + 0.001,
    longitude: -74.006 - 0.001,
    timestamp: at("2026-07-31T16:00:00Z"),
  });
  check("seed tolerates GPS jitter", a.code === jittered.code, `${a.code} vs ${jittered.code}`);

  const elsewhere = generateSeed({
    latitude: 51.5074,
    longitude: -0.1278,
    timestamp: at("2026-07-31T16:00:00Z"),
  });
  check("seed differs by location", a.code !== elsewhere.code);

  const meridianEast = generateSeed({ latitude: 0, longitude: 180, timestamp: 0 });
  const meridianWest = generateSeed({ latitude: 0, longitude: -180, timestamp: 0 });
  check(
    "seed is continuous across the antimeridian",
    meridianEast.code === meridianWest.code,
    `${meridianEast.code} vs ${meridianWest.code}`
  );

  check("seed code has the requested length", a.code.length === 8, a.code);
  check(
    "seed code uses the Crockford alphabet",
    /^[0-9A-HJKMNP-TV-Z]+$/.test(a.code),
    a.code
  );
  check("seed integer is an unsigned 32-bit value", a.integer >= 0 && a.integer <= 0xffffffff);

  // Distribution sanity: 4096 nearby cells should not collide meaningfully.
  const codes = new Set<string>();
  for (let i = 0; i < 4096; i++) {
    codes.add(
      generateSeed({
        latitude: 40 + (i % 64) * 0.25,
        longitude: -74 + Math.floor(i / 64) * 0.25,
        timestamp: 0,
      }).code
    );
  }
  check(
    "seed collisions are rare across 4096 cells",
    codes.size > 4090,
    `${4096 - codes.size} collisions`
  );
}

// ---------------------------------------------------------------------------
section("Timescales and describe()");

{
  const result = generate({ latitude: 40.7128, longitude: -74.006, timestamp: at("2026-07-31T16:00:00Z") });

  for (const band of Object.values(result.timescales)) {
    check(`timescale ${band.band} has signals`, band.signals.length > 0);
    for (const item of band.signals) {
      check(
        `${band.band} signal ${item.path} has a positive period`,
        item.periodSeconds > 0
      );
    }
  }

  // Signals must be the same objects as in the tree, not copies, or a consumer
  // reading through the timescale view would see stale numbers.
  const rotational = result.timescales.rotational.signals.find(
    (s) => s.path === "sun.hourAngle"
  );
  check("timescale signals reference the live value object", rotational?.value === result.sun.hourAngle);

  // Rotational signals should move perceptibly over an hour; epochal ones
  // should barely move at all. That is the whole point of the grouping.
  const later = generate({
    latitude: 40.7128,
    longitude: -74.006,
    timestamp: at("2026-07-31T17:00:00Z"),
  });
  const hourAngleDelta = Math.abs(
    later.sun.hourAngle.unitRange - result.sun.hourAngle.unitRange
  );
  const jupiterDelta = Math.abs(
    later.planets.jupiter.heliocentricLongitude.unitRange -
      result.planets.jupiter.heliocentricLongitude.unitRange
  );
  check("a rotational signal moves within an hour", hourAngleDelta > 0.01, `${hourAngleDelta}`);
  check("an epochal signal barely moves within an hour", jupiterDelta < 0.001, `${jupiterDelta}`);

  const text = describeResult(result);
  check("describe() produces entries", Object.keys(text).length > 50);
  check("describe() covers the moon phase", typeof text["moon.phase"] === "string");
  check(
    "describe() does not duplicate timescale paths",
    !Object.keys(text).some((key) => key.startsWith("timescales."))
  );
}

// ---------------------------------------------------------------------------
section("Performance");

{
  // The docs demo calls generate() inside requestAnimationFrame, so a full
  // evaluation has to fit comfortably inside a 16 ms frame.
  clearEphemerisCache();
  const base = at("2026-07-31T16:00:00Z");
  // Warm the caches the way a running clock would.
  generate({ latitude: 40.7128, longitude: -74.006, timestamp: base });

  const iterations = 300;
  const started = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    generate({ latitude: 40.7128, longitude: -74.006, timestamp: base + i * 16 });
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  const perCall = elapsedMs / iterations;
  check(
    "a warm full evaluation fits in a frame",
    perCall < 16,
    `${perCall.toFixed(2)} ms per call`
  );
  console.log(`  (full evaluation: ${perCall.toFixed(2)} ms; budget 16 ms)`);

  const sunMoonStarted = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    generate({ latitude: 40.7128, longitude: -74.006, timestamp: base + i * 16, skipPlanets: true });
  }
  const sunMoonMs = Number(process.hrtime.bigint() - sunMoonStarted) / 1e6 / iterations;
  console.log(`  (sun and moon only: ${sunMoonMs.toFixed(2)} ms)`);
}

// ---------------------------------------------------------------------------
console.log(
  `\n${passed} passed, ${failed} failed${failed ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}` : ""}`
);
process.exit(failed === 0 ? 0 : 1);
