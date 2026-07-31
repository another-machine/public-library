/**
 * test-parity.mjs — STGC format invariants.
 *
 * This file used to be a DIFFERENTIAL test: for ~100 configurations it asserted
 * that this package and the lab's plain-JS `steg-core.js` produced byte-identical
 * output and could decode each other, across the codec, the audio pipeline, WAV
 * I/O, and the job schema. It peaked at 1551 assertions and it did its job — it
 * caught the `encodeContainer` argument-order difference, the `keyMap`/`keymap`
 * spelling that was silently degrading to "adjacent", and the fact that
 * `computeRecon` and `reconstructCover` really were equivalent.
 *
 * That half is gone because its subject is gone: the lab consumes this package
 * now, `steg-core.js` was deleted, and there is no second implementation left to
 * differ from. The lab's own 233 assertions run against this package, and a real
 * 12-image job re-encoded byte-identically across the switch.
 *
 * What remains is the part that never needed a second implementation: invariants
 * that would silently corrupt every image already in the wild if they changed.
 *
 * Run: node scripts/test-parity.mjs
 */

const { Stegassette: S } = await import("../dist/node.js");

let pass = 0;
const failures = [];
const check = (name, cond, extra = "") => {
  if (cond) pass++;
  else {
    failures.push(`${name}${extra ? " — " + extra : ""}`);
    console.error(`FAIL  ${name} ${extra}`);
  }
};
const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// ── the name arrays are stored as INDICES ──────────────────────────────────
//
// The STGC header stores combine / keymap / traversal as a POSITION in these
// arrays, not as a string. Appending is safe. Reordering, renaming, or removing
// an entry silently re-points every image ever encoded at a different effect —
// no error, no version bump, just wrong output forever. Pinned as literals
// rather than compared against themselves, so the test has an opinion.
check("COMBINE_NAMES order unchanged", sameList(S.COMBINE_NAMES, [
  "xor", "additive", "subtractive", "midpoint", "difference", "bitshift",
  "noise", "echo", "signed", "veil", "whisper",
]), S.COMBINE_NAMES.join(","));

check("TRAVERSAL_NAMES order unchanged", sameList(S.TRAVERSAL_NAMES, [
  "raster", "boustrophedon", "spiral", "angle", "fisher-yates", "center-out",
  "hilbert", "polar", "bayer",
]), S.TRAVERSAL_NAMES.join(","));

check("KEYMAP_NAMES order unchanged", sameList(S.KEYMAP_NAMES, [
  "adjacent", "poles", "mirror-x", "mirror-y", "offset", "rotate",
]), S.KEYMAP_NAMES.join(","));

check("STGC_VERSION is still 1", S.STGC_VERSION === 1, String(S.STGC_VERSION));
check('STGC_MAGIC is still "STGC"', sameList([...S.STGC_MAGIC], [0x53, 0x54, 0x47, 0x43]));
check("CODEC_VERSION is set and dated", /^\d{4}\.\d{2}\.\d{2}$/.test(S.CODEC_VERSION || ""), S.CODEC_VERSION);

// ── the keymap guard ───────────────────────────────────────────────────────
//
// The lab spelled this option `keyMap`; this package reads `keymap`. The old
// spelling alone must THROW rather than quietly encode with "adjacent" — a
// failure invisible until you compare pixels. The job schema emits both
// spellings, so the guard must fire only on a BARE `keyMap`.
{
  const cover = new Uint8Array(64 * 64 * 4).fill(128);
  const img = () => new S.Img(64, 64, new Uint8Array(cover));
  const ents = () => [{ mimetype: "text/plain", name: "t", data: new Uint8Array([1, 2, 3]) }];

  let bare = null;
  try { S.encodeContainer(ents(), img(), { combine: "xor", keyMap: "poles", borderWidth: 1 }, img()); }
  catch (e) { bare = e.message; }
  check("a bare `keyMap` throws", bare !== null && /keymap/i.test(bare), String(bare));

  let both = null;
  try { S.encodeContainer(ents(), img(), { combine: "xor", keymap: "poles", keyMap: "poles", borderWidth: 1 }, img()); }
  catch (e) { both = e.message; }
  check("both spellings together are accepted", both === null, String(both));

  let unknown = null;
  try { S.encodeContainer(ents(), img(), { combine: "xor", keymap: "nope", borderWidth: 1 }, img()); }
  catch (e) { unknown = e.message; }
  check("an unknown keymap throws", unknown !== null && /unknown keymap/i.test(unknown), String(unknown));
}

// ── self-keying default ────────────────────────────────────────────────────
//
// encodeContainer's keyImg defaults to srcImg. The lab's four-argument
// (entries, src, key, opts) calls were rewritten to three-argument
// (entries, src, opts) on exactly that assumption, so it is load-bearing.
{
  const W = 96, H = 96;
  const cover = new Uint8Array(W * H * 4);
  let s = 5;
  for (let i = 0; i < W * H; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    cover[i * 4] = s & 0xff; cover[i * 4 + 1] = (s >>> 8) & 0xff;
    cover[i * 4 + 2] = (s >>> 16) & 0xff; cover[i * 4 + 3] = 255;
  }
  const payload = new Uint8Array(600);
  for (let i = 0; i < 600; i++) payload[i] = (i * 7) & 0xff;
  const ents = () => [{ mimetype: "audio/L16; rate=22050; channels=1", name: "a", data: new Uint8Array(payload) }];
  const opts = { combine: "xor", traversal: "raster", keymap: "adjacent", borderWidth: 1 };
  const fresh = () => new S.Img(W, H, new Uint8Array(cover));

  const implicit = S.encodeContainer(ents(), fresh(), opts);
  const explicit = S.encodeContainer(ents(), fresh(), opts, fresh());
  check("omitting keyImg is identical to passing srcImg",
    implicit.width === explicit.width && sameList([...implicit.data], [...explicit.data]));

  const { entries: back } = S.decodeContainer(new S.Img(implicit.width, implicit.height, new Uint8Array(implicit.data)));
  check("self-keyed round trip is exact", sameList([...back[0].data], [...payload]));
}

// ── jobs-file shapes ───────────────────────────────────────────────────────
//
// A jobs file may be an array, a single job, or { defaults, jobs }. The first
// two shapes predate the third and are what every existing file on disk and
// every paste into the editor still looks like, so resolveJobs must leave
// them exactly as they were — and a job must always win over a default, or a
// project's shared look would silently overwrite the one job that differs.
{
  const J = await import("../dist/jobSchema.js");

  const arr = [{ out: "a" }, { out: "b" }];
  check("an array passes through", sameList(J.resolveJobs(arr).map((j) => j.out), ["a", "b"]));

  const one = { out: "solo", combine: "veil" };
  const [solo] = J.resolveJobs(one);
  check("a single job is wrapped", solo.out === "solo" && solo.combine === "veil");

  const file = {
    defaults: { combine: "midpoint", traversal: "raster", border: 0.05 },
    jobs: [{ out: "a" }, { out: "b", combine: "xor" }],
  };
  const [a, b] = J.resolveJobs(file);
  check("defaults reach a job that omits them",
    a.combine === "midpoint" && a.traversal === "raster" && a.border === 0.05);
  check("a job overrides a default", b.combine === "xor");
  check("overriding one key keeps the rest", b.traversal === "raster" && b.border === 0.05);
  check("defaults do not leak `jobs`/`defaults` keys", a.jobs === undefined && a.defaults === undefined);

  const src = { defaults: { combine: "veil" }, jobs: [{ out: "a" }] };
  J.resolveJobs(src)[0].combine = "mutated";
  check("resolveJobs does not mutate the file", src.defaults.combine === "veil");

  // Whole specs replace rather than merge — half-overriding an entries list
  // or a split block would be a guessing game.
  const [rep] = J.resolveJobs({
    defaults: { entries: [{ text: "shared" }] },
    jobs: [{ entries: [{ text: "mine" }] }],
  });
  check("a job's entries replace the default's", rep.entries.length === 1 && rep.entries[0].text === "mine");

  // expandJobs is the front door for whole files, so it must understand the
  // shape too — a non-split job comes out of expandJob unchanged.
  const flat = J.expandJobs({ defaults: { keymap: "poles" }, jobs: [{ out: "a" }, { out: "b" }] });
  check("expandJobs resolves defaults", flat.length === 2 && flat.every((j) => j.keymap === "poles"));
}

console.log("");
if (failures.length) {
  console.error(`${pass} passed, ${failures.length} FAILED`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${pass} passed, 0 failed — format invariants hold.`);
