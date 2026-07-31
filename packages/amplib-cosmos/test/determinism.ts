/**
 * Timezone determinism.
 *
 * The premise of `@amplib/procedural-generation` is "shared procedural
 * experiences between disconnected devices". Two phones at the same place and
 * moment must derive the same music without talking to each other, which means
 * `generate()` has to be a pure function of its arguments — not of whatever
 * `process.env.TZ` or the browser's locale happens to be.
 *
 * The previous implementation failed this. `new Date(timestamp).getHours()` in
 * the planet code and `new Date(year, 0, 0)` in the day-of-year helper both
 * resolve against the host timezone, so the same inputs produced Mars at
 * altitude 35.9851 under UTC and 35.5974 under Asia/Tokyo.
 *
 * This script prints a hash of a full sweep. The `npm test` script runs it
 * under several timezones and diffs the results; any difference is a bug.
 */

import { generate, clearEphemerisCache } from "../src/index";

const LOCATIONS: [number, number][] = [
  [40.7128, -74.006],
  [51.5074, -0.1278],
  [-33.8688, 151.2093],
  [35.6762, 139.6503],
  [0, 0],
  [78, 15],
  [-54.8, -68.3],
];

const START = Date.parse("2026-01-01T00:00:00Z");

function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

clearEphemerisCache();

const parts: string[] = [];
for (let i = 0; i < 120; i++) {
  // A step that is not a whole number of days, so every hour of the day and
  // every phase of the year gets sampled.
  const timestamp = START + i * (86400000 * 3 + 5 * 3600000 + 37 * 60000);
  for (const [latitude, longitude] of LOCATIONS) {
    const result = generate({ latitude, longitude, timestamp });
    // Stringify everything except `timescales`, which holds the same object
    // references and would only double the input.
    const { timescales: _timescales, ...rest } = result;
    parts.push(JSON.stringify(rest));
  }
}

console.log(hash(parts.join("")));
