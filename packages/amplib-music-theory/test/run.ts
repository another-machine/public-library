/**
 * Contract tests.
 *
 * Run with `npm test` from this package.
 *
 * Focused on parseChord, which is the newest surface and the one with real
 * edge cases: theoretical spellings that fall outside the Notation union, and
 * the symmetry of the augmented triad.
 */

import { Chord, Note, Scale, parseChord } from "../src/index";

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

// ── Recognized chords ────────────────────────────────────────────────────────

check("CEG is C major", parseChord("CEG").chord?.label === "C");
check("ACE is A minor", parseChord("ACE").chord?.label === "Am");
check("CEGB is C major 7", parseChord("CEGB").chord?.label === "CM7");
check("CEGBb is C dominant 7", parseChord("CEGBb").chord?.label === "C7");
check("ACEG is A minor 7", parseChord("ACEG").chord?.label === "Am7");
check("BDF is B diminished", parseChord("BDF").chord?.label === "B°");
check("CEG# is C augmented", parseChord("CEG#").chord?.label === "C+");

// ── Sets that are not chords ─────────────────────────────────────────────────

check("CG is not a chord", parseChord("CG").chord === undefined);
check("ACBb is not a chord", parseChord("ACBb").chord === undefined);
check("a single note is not a chord", parseChord("C").chord === undefined);

// ── Pitch classes and ordering ───────────────────────────────────────────────

check(
  "ACBb keeps written order",
  parseChord("ACBb").pitchClasses.join() === "9,0,10"
);
check("duplicates collapse", parseChord("CEGC").pitchClasses.join() === "0,4,7");
check(
  "notations come back normalized to sharps",
  parseChord("DbEb").notations.join() === "C#,D#"
);
check("label is the trimmed input", parseChord("  CEG  ").label === "CEG");

// ── Theoretical spellings ────────────────────────────────────────────────────

// Cb, B#, Fb and E# are outside Notation and NotationAlternate, so they take
// the supplementary table rather than Note.notationIndex.
check("Cb is B", parseChord("Cb").pitchClasses[0] === 11);
check("B# is C", parseChord("B#").pitchClasses[0] === 0);
check("Fb is E", parseChord("Fb").pitchClasses[0] === 4);
check("E# is F", parseChord("E#").pitchClasses[0] === 5);

// ── Rejections ───────────────────────────────────────────────────────────────

throws("quality suffixes are rejected", () => parseChord("Cm"));
throws("digits are rejected", () => parseChord("C7"));
throws("H is not a note", () => parseChord("H"));
throws("empty input is rejected", () => parseChord("   "));
throws("whitespace-only is rejected", () => parseChord(""));

// ── Note and Scale still hold ────────────────────────────────────────────────

check("notationIndex finds sharps", Note.notationIndex("F#") === 6);
check("notationIndex finds flats", Note.notationIndex("Gb") === 6);
check("notationIndex rejects unknowns", Note.notationIndex("Cb" as never) === -1);
check("A4 is 440", Note.octaveStepFrequencies[4][9] === 440);
check("a scale has seven intervals", new Scale({ root: "C", mode: "major" }).intervals.length === 7);
check("chord types are exhaustive", Chord.types.length === 7);

// ── Report ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  ${failure}`);
  process.exit(1);
}
