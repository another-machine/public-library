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

import { readFile } from "node:fs/promises";

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

// ── the name arrays are stored as NAMES ────────────────────────────────────
//
// Corrected 2026-07-31: this comment previously said the header stores a
// POSITION in these arrays. It does not — buildDescriptor writes the literal
// string, and a packed header contains the ASCII "keymap=poles". Verify with:
//   new TextDecoder().decode(S.packStgcHeader({...}))
//
// So reordering is harmless on disk, and appending is safe. What is NOT safe is
// RENAMING or REMOVING an entry: the name is what every existing image carries,
// and unpackStgcHeaderAlpha falls back to the default ("adjacent", "xor",
// "raster") for a name it does not recognise — so a rename silently decodes
// every affected image with the wrong effect rather than erroring.
//
// These arrays also back the job-schema validation enums, so they must stay in
// step with the lab's copies for the same job file to validate on both sides.
// Pinned as literals rather than compared against themselves, so the test has
// an opinion.
check("COMBINE_NAMES order unchanged", sameList(S.COMBINE_NAMES, [
  "xor", "additive", "subtractive", "midpoint", "difference", "bitshift",
  "noise", "echo", "signed", "veil", "whisper",
]), S.COMBINE_NAMES.join(","));

// "radial" is APPENDED: the aspect-normalized radial traversal. "center-out"
// stays exactly where and what it was — it is the pixel-distance version, and
// every image encoded with it decodes by reproducing that order.
check("TRAVERSAL_NAMES order unchanged", sameList(S.TRAVERSAL_NAMES, [
  "raster", "boustrophedon", "spiral", "angle", "fisher-yates", "center-out",
  "hilbert", "polar", "bayer", "radial",
]), S.TRAVERSAL_NAMES.join(","));

// "none" is an APPENDED keyless keymap — no key pixel at all. The lab's
// steg-core.js does not have it, so a keyless stegassette will not decode there
// until it is ported; every pre-existing name is untouched, so every existing
// stegassette still decodes on both sides.
check("KEYMAP_NAMES order unchanged", sameList(S.KEYMAP_NAMES, [
  "adjacent", "poles", "mirror-x", "mirror-y", "offset", "rotate",
  "none",
]), S.KEYMAP_NAMES.join(","));

check("the six locating keymaps are unchanged and still first",
  sameList(S.KEYMAP_NAMES.slice(0, 6),
    ["adjacent", "poles", "mirror-x", "mirror-y", "offset", "rotate"]));
check("keyless keymaps are exactly none",
  sameList([...S.KEYLESS_KEYMAPS], ["none"]));

// ── keyless invariants ─────────────────────────────────────────────────────
//
// A keyless encode derives its key from position, so everything the decoder
// needs to recompute that key must be IN THE HEADER. Today the field is the
// constant 0 and needs nothing — but a position-varying field would need its
// parameters carried, and the failure mode is silent: the payload comes back
// the right length, just wrong. These pin the round-trip so that stays visible.
{
  const W = 200, H = 200;
  const cover = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    cover[i * 4] = (i * 7) & 0xff; cover[i * 4 + 1] = (i * 13) & 0xff;
    cover[i * 4 + 2] = (i * 29) & 0xff; cover[i * 4 + 3] = 255;
  }
  const source = { width: W, height: H, data: cover };
  const payload = new Uint8Array(3000);
  for (let i = 0; i < 3000; i++) payload[i] = (i * 97) & 0xff;
  const ents = () => [{ mimetype: "application/octet-stream", name: "p.bin", data: new Uint8Array(payload) }];

  for (const keymap of ["none"])
    for (const combine of ["xor", "additive", "subtractive", "bitshift", "signed"]) {
      const enc = S.encodeImageData({ source, entries: ents(), combine, keymap,
        traversal: "raster", border: 1, aspectRatio: 1 });
      const { entries, opts } = S.decodeImageData({ source: enc });
      check(`keyless ${keymap}/${combine} round-trips exactly`,
        opts.keymap === keymap && entries.length === 1 &&
        sameList([...entries[0].data], [...payload]));
    }

  // Half the pixels, which is the entire reason the mode exists.
  const keyed = S.encodeImageData({ source, entries: ents(), combine: "xor",
    keymap: "adjacent", traversal: "raster", border: 1, aspectRatio: 1 });
  const free = S.encodeImageData({ source, entries: ents(), combine: "xor",
    keymap: "none", traversal: "raster", border: 1, aspectRatio: 1 });
  const ratio = (free.width * free.height) / (keyed.width * keyed.height);
  check("keyless is about half the area", ratio > 0.45 && ratio < 0.60,
    `ratio ${ratio.toFixed(3)}`);

  // KEY_MOD combines split the payload across two pixels. Keyless has one.
  for (const combine of ["midpoint", "difference", "veil", "whisper"]) {
    let msg = null;
    try { S.encodeImageData({ source, entries: ents(), combine, keymap: "none", border: 1 }); }
    catch (e) { msg = e.message; }
    check(`keyless refuses the ${combine} combine`, msg !== null && /keyless|key pixel/i.test(msg), String(msg));
  }
}

check("STGC_VERSION is still 1", S.STGC_VERSION === 1, String(S.STGC_VERSION));
check('STGC_MAGIC is still "STGC"', sameList([...S.STGC_MAGIC], [0x53, 0x54, 0x47, 0x43]));

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

// ── the block layout's trailing partial block ──────────────────────────────
//
// `block` splits the stream into blocks of `blockSize` samples PER CHANNEL. The
// last block is short whenever the sample count is not a multiple of blockSize,
// and it has to be strided by its own short length — striding it by blockSize
// runs past the end of the N*M stream. Typed arrays swallow that: the write is
// dropped, the read comes back undefined, and the tail of every channel above 0
// decodes to NaN. Mono never hit it (M === 1 short-circuits to planar) and
// neither did an exact multiple of blockSize, which is most synthetic input —
// so it survived until real audio, whose length is never a round number.
//
// The pure permutation is asserted here rather than through the codec because
// nothing else in the pipeline is involved: no image, no PCM quantization.
{
  const CASES = [];
  for (const M of [1, 2, 3])
    for (const [bs, N] of [
      [1024, 40000],  // 64 short — the originally reported case
      [1024, 40961],  // 1 short
      [1024, 40960],  // exact multiple: the control that always passed
      [256, 1000],    // 232 short
      [7, 100],       // tiny block, 2 short
      [1, 1000],      // blockSize 1 degenerates to interleaved
      [4096, 1000],   // block larger than the stream: ALL of it is tail
    ])
      CASES.push([M, bs, N]);

  for (const [M, bs, N] of CASES) {
    // Distinct and non-zero, so a dropped slot shows up as a leftover 0 in the
    // laid-out stream — Float32Array initialises to 0 and no input is 0.
    const chans = Array.from({ length: M }, (_, c) =>
      Float32Array.from({ length: N }, (_, i) => c * N + i + 1));
    const mixed = S.layoutChannels({ mixed: chans, layout: "block", blockSize: bs });
    const back = S.unlayoutChannels({ f32: mixed, channels: M, layout: "block", blockSize: bs });

    let unwritten = 0;
    for (let i = 0; i < mixed.length; i++) if (mixed[i] === 0) unwritten++;
    check(`block M=${M} bs=${bs} N=${N} fills every stream slot`,
      mixed.length === N * M && unwritten === 0, `${unwritten} slots unwritten`);

    let nan = 0, wrong = 0;
    for (let c = 0; c < M; c++)
      for (let i = 0; i < N; i++) {
        const v = back[c * N + i];
        if (Number.isNaN(v)) nan++;
        else if (v !== chans[c][i]) wrong++;
      }
    check(`block M=${M} bs=${bs} N=${N} round-trips exactly`,
      back.length === N * M && nan === 0 && wrong === 0,
      `${nan} NaN, ${wrong} wrong`);
  }

  // interleaved is the same code path with blockSize pinned to 1, so it has no
  // tail to get wrong — pinned so a shared-helper change cannot break it either.
  for (const M of [2, 3]) {
    const N = 1001;
    const chans = Array.from({ length: M }, (_, c) =>
      Float32Array.from({ length: N }, (_, i) => c * N + i + 1));
    const mixed = S.layoutChannels({ mixed: chans, layout: "interleaved" });
    const back = S.unlayoutChannels({ f32: mixed, channels: M, layout: "interleaved" });
    let bad = 0;
    for (let c = 0; c < M; c++)
      for (let i = 0; i < N; i++) if (back[c * N + i] !== chans[c][i]) bad++;
    check(`interleaved M=${M} N=${N} round-trips exactly`, bad === 0, `${bad} bad`);
    check(`interleaved M=${M} N=${N} is true frame interleave`,
      mixed[0] === chans[0][0] && mixed[1] === chans[1][0] && mixed[M] === chans[0][1]);
  }

  // And end-to-end, because the tail NaNs reached real stegassettes: encode
  // stereo block-layout audio into an image and read it back. Compared against
  // the SAME audio through `planar` rather than against the input floats, so
  // the assertion is exact at every bit depth instead of quantization-tolerant
  // — the layout is the only thing that differs between the two sides.
  const W = 220, H = 220;
  const cover = new Uint8Array(W * H * 4);
  let s = 11;
  for (let i = 0; i < W * H; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    cover[i * 4] = s & 0xff; cover[i * 4 + 1] = (s >>> 8) & 0xff;
    cover[i * 4 + 2] = (s >>> 16) & 0xff; cover[i * 4 + 3] = 255;
  }
  const source = { width: W, height: H, data: cover };
  const N = 1000, bs = 256; // 1000 % 256 === 232
  const chans = [0, 1].map((c) =>
    Float32Array.from({ length: N }, (_, i) =>
      Math.sin((i / N) * Math.PI * 2 * (c + 3)) * 0.9));

  for (const bits of [8, 16, 24]) {
    const roundTrip = (layout, blockSize) => {
      const entry = S.buildAudioEntry({
        channels: chans.map((c) => new Float32Array(c)),
        sampleRate: 22050, bitsPerSample: bits, layout, blockSize, name: "a",
      });
      const enc = S.encodeImageData({ source, entries: [entry], combine: "xor",
        keymap: "adjacent", traversal: "raster", border: 1, aspectRatio: 1 });
      const { entries } = S.decodeImageData({ source: enc });
      return S.parseAudioEntry(entries[0]);
    };

    const blocked = roundTrip("block", bs);
    const planar = roundTrip("planar");

    let nan = 0, differ = 0;
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < N; i++) {
        const v = blocked.channels[c][i];
        if (Number.isNaN(v)) nan++;
        else if (v !== planar.channels[c][i]) differ++;
      }
    check(`stereo ${bits}-bit block layout decodes identically to planar`,
      blocked.layout === "block" && blocked.blockSize === bs &&
      blocked.channels.length === 2 && blocked.channels[0].length === N &&
      nan === 0 && differ === 0,
      `${nan} NaN, ${differ} differ`);
  }
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

  // The schema's version is what its published pins are named after, so it
  // has to exist and be dated.

  // The hazard is COUPLING — this number being the codec's, which is what let a
  // schema change republish an existing pinned filename with different bytes.
  //
  // This used to assert the two values differ. That is a proxy, and on
  // 2026.07.31 it produced a false positive: both changed the same day, so two
  // independent constants held the same date and a correct state failed. Assert
  // the coupling itself instead, against the source, where it is unambiguous.
  // The authoritative guard is the workflow's "A published pin must never
  // change meaning" step, which diffs each pin against what is already live.
  const schemaSrc = await readFile(
    new URL("../src/jobSchema.js", import.meta.url), "utf8");

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
