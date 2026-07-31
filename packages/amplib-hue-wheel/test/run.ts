/**
 * Contract tests.
 *
 * Run with `npm test` from this package.
 *
 * Two things here are worth more than the rest. The hue round-trip check,
 * because the forward and inverse tables are built by different methods and
 * only approximately invert each other — nothing but a measurement says
 * whether they still agree. And the repetition semantics, because "a value can
 * appear twice, adjacent or apart, and the two cases mean different things" is
 * the whole shape of the API.
 */

import {
  Palette,
  fromPerceptual,
  parseSlotList,
  toPerceptual,
  worstRoundTripError,
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

function throws(name: string, fn: () => unknown) {
  try {
    fn();
    check(name, false, "expected a throw");
  } catch {
    check(name, true);
  }
}

// ── Hue perception ───────────────────────────────────────────────────────────

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

// ── Slot list ────────────────────────────────────────────────────────────────

check(
  "list splits on commas",
  parseSlotList("g1,g2,g3").join() === "g1,g2,g3"
);
check("pipes separate too", parseSlotList("g1|g2").length === 2);
check("entries are trimmed", parseSlotList(" g1 , g2 ")[0] === "g1");
check("empty entries are dropped", parseSlotList("g1,,g2").length === 2);
check("repeats are preserved", parseSlotList("g1,g2,g2").length === 3);

// ── Equal sectors ────────────────────────────────────────────────────────────

const even = Palette.fromString("g1,g2,g3");
check("three entries, three slots", even.slots.length === 3);
check("boundary count wraps", even.slotBoundaryHues.length === 4);

const reached = new Set<number>();
for (let hue = 0; hue < 360; hue += 0.25) {
  reached.add(even.hueToSlot(hue).slot.index);
}
check("every slot is reachable", reached.size === 3);

let centreMismatch = 0;
for (let index = 0; index < 3; index++) {
  if (even.hueToSlot(even.slotToHue(index, 0.5)).slot.index !== index) {
    centreMismatch++;
  }
}
check("slot centres round-trip", centreMismatch === 0);

// Sampled in perceptual space, because that is the space the division is
// defined in — sampling display hue would just re-measure the non-uniformity.
function shareOf(palette: Palette<string>, value: string): number {
  let hits = 0;
  const samples = 3600;
  for (let i = 0; i < samples; i++) {
    const hue = fromPerceptual((i / samples) * 360);
    if (palette.hueToSlot(hue).slot.value === value) hits++;
  }
  return hits / samples;
}
check(
  "three equal entries split the wheel in thirds",
  Math.abs(shareOf(even, "g1") - 1 / 3) < 0.02,
  `got ${(shareOf(even, "g1") * 100).toFixed(1)}%`
);

// ── Repetition is weight ─────────────────────────────────────────────────────

const weighted = Palette.fromString("g1,g1,g2,g3");
check("repeating an entry adds a sector", weighted.slots.length === 4);
check(
  "a doubled entry takes twice the arc",
  Math.abs(shareOf(weighted, "g1") - 0.5) < 0.02,
  `got ${(shareOf(weighted, "g1") * 100).toFixed(1)}%`
);
check(
  "its neighbours keep a quarter each",
  Math.abs(shareOf(weighted, "g2") - 0.25) < 0.02,
  `got ${(shareOf(weighted, "g2") * 100).toFixed(1)}%`
);

// ── Recurrence: the same value in two places ─────────────────────────────────

const recurring = Palette.fromString("g1,g2,g2,g1,g3");
check("five entries, five slots", recurring.slots.length === 5);
check(
  "g1 occupies two separate sectors",
  recurring.slots.filter((s) => s.value === "g1").map((s) => s.index).join() ===
    "0,3"
);
check(
  "g1 and g2 both total two fifths",
  Math.abs(shareOf(recurring, "g1") - 0.4) < 0.02 &&
    Math.abs(shareOf(recurring, "g2") - 0.4) < 0.02
);

// Adjacent repeats are one band; separated repeats are two.
const bands = recurring.bands;
check("bands merge only adjacent repeats", bands.length === 4);
check(
  "the g2 band spans both its sectors",
  bands.find((b) => b.value === "g2")?.indices.join() === "1,2"
);
check(
  "the two g1 bands stay separate",
  bands.filter((b) => b.value === "g1").length === 2
);
check(
  "a band centre lands back in that band",
  bands.every((band) =>
    band.indices.includes(recurring.hueToSlot(band.centreHue).slot.index)
  )
);

// A band straddling 0° is reported once, not split in two.
const wrapping = Palette.fromString("g1,g2,g3,g1");
check(
  "a band across the seam is one band",
  wrapping.bands.filter((b) => b.value === "g1").length === 1
);
check(
  "that band holds both its sectors",
  wrapping.bands.find((b) => b.value === "g1")?.indices.sort().join() === "0,3"
);
check("all-same collapses to one band", Palette.fromString("g,g,g").bands.length === 1);

// ── Blending ─────────────────────────────────────────────────────────────────

check(
  "centre of a sector does not blend",
  even.hueToBlend(even.slotToHue(0, 0.5)).length === 1
);

const edgeBlend = even.hueToBlend(even.slotToHue(1, 0));
check("sector edge blends two slots", edgeBlend.length === 2);
check(
  "blend weights sum to 1",
  Math.abs(edgeBlend.reduce((sum, e) => sum + e.weight, 0) - 1) < 1e-6
);
check(
  "at a boundary the split is even",
  edgeBlend.every((e) => Math.abs(e.weight - 0.5) < 1e-6)
);

// The seam between two identical adjacent sectors is not a transition.
const innerSeam = recurring.hueToBlend(recurring.slotToHue(2, 0));
check(
  "no blending between repeats of the same value",
  innerSeam.length === 1 && innerSeam[0].slot.value === "g2"
);
// But the far edge of that band still blends, into a different value.
const outerSeam = recurring.hueToBlend(recurring.slotToHue(1, 0));
check(
  "the band's outer edge still blends",
  outerSeam.length === 2 && outerSeam.some((e) => e.slot.value === "g1")
);

const noBlend = Palette.fromString("g1,g2,g3", { crossZone: 0 });
check(
  "crossZone 0 never blends",
  noBlend.hueToBlend(noBlend.slotToHue(1, 0)).length === 1
);
const single = Palette.fromString("only");
check("a single slot never blends", single.hueToBlend(123).length === 1);
check("a single slot catches every hue", single.hueToSlot(300).slot.index === 0);

// ── map ──────────────────────────────────────────────────────────────────────

const mapped = recurring.map((value) => ({ label: value.toUpperCase() }));
check("map transforms values", mapped.slots[0].value.label === "G1");
check("map preserves slot count", mapped.slots.length === 5);
check(
  "map preserves geometry",
  Math.abs(mapped.slotToHue(0, 0.5) - recurring.slotToHue(0, 0.5)) < 1e-9
);
// Repeats must stay referentially equal or bands and blending silently break.
check(
  "equal inputs share one mapped value",
  mapped.slots[1].value === mapped.slots[2].value
);
check("mapped bands still merge", mapped.bands.length === 4);
check(
  "mapped repeats still suppress blending",
  mapped.hueToBlend(mapped.slotToHue(2, 0)).length === 1
);
let calls = 0;
recurring.map((value) => {
  calls++;
  return value;
});
check("transform runs once per distinct value", calls === 3, `ran ${calls}x`);

// ── Guards ───────────────────────────────────────────────────────────────────

throws("empty palette is rejected", () => new Palette({ slots: [] }));
throws("setSlots rejects empty", () => even.setSlots([]));
check(
  "hue 360 does not overflow the last sector",
  even.hueToSlot(360).slot.index < even.slots.length
);

// ── Report ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  ${failure}`);
  process.exit(1);
}
