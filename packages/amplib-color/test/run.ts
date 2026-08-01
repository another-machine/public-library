/**
 * Contract tests.
 *
 * Run with `npm test` from this package.
 *
 * The round-trip check is worth more than the rest. The forward and inverse
 * tables are built by different methods and only approximately invert each
 * other — nothing but a measurement says whether they still agree.
 */

import { fromPerceptual, toPerceptual, worstRoundTripError } from "../src/index";

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

// ── Round trip ───────────────────────────────────────────────────────────────

const worst = worstRoundTripError(0.25);
check(
  "hue round-trip stays under 1.5°",
  worst < 1.5,
  `worst was ${worst.toFixed(3)}°`
);
check(
  "toPerceptual wraps negative input",
  Math.abs(toPerceptual(-30) - toPerceptual(330)) < 1e-9
);
check(
  "fromPerceptual wraps past 360",
  Math.abs(fromPerceptual(400) - fromPerceptual(40)) < 1e-9
);

// ── Monotonicity ─────────────────────────────────────────────────────────────

// The inverse table is only invertible if the forward one never runs backwards.
// Raw oklch does step backwards around display 231–240°, and the interpolation
// that patches it out is easy to break without noticing — nothing else here
// would fail if it regressed.
let backwardRuns = 0;
for (let hue = 0; hue < 360; hue += 0.25) {
  let delta = toPerceptual(hue + 0.25) - toPerceptual(hue);
  if (delta < -180) delta += 360;
  if (delta > 180) delta -= 360;
  if (delta < -1e-9) backwardRuns++;
}
check(
  "perceptual hue never runs backwards",
  backwardRuns === 0,
  `${backwardRuns} backward steps`
);

// ── Non-uniformity ───────────────────────────────────────────────────────────

function expansionAt(hue: number): number {
  let delta = toPerceptual(hue + 5) - toPerceptual(hue - 5);
  if (delta < -180) delta += 360;
  if (delta > 180) delta -= 360;
  return delta / 10;
}
const deepBlue = expansionAt(235);
const green = expansionAt(120);
const cyan = expansionAt(180);
check("deep blue compresses hard", deepBlue < 0.2, `${deepBlue.toFixed(2)}x`);
check("green compresses hard", green < 0.2, `${green.toFixed(2)}x`);
check("cyan expands", cyan > 1.5, `${cyan.toFixed(2)}x`);
check(
  "the wheel is non-uniform by more than 10x",
  cyan / Math.max(deepBlue, 1e-6) > 10,
  `cyan ${cyan.toFixed(2)}x vs deep blue ${deepBlue.toFixed(2)}x`
);

// ── Report ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  ${failure}`);
  process.exit(1);
}
