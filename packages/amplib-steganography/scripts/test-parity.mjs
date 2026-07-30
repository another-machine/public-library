/**
 * test-parity.mjs — differential test between the two STGC implementations.
 *
 * There are two independent codebases encoding one format: the lab's plain-JS
 * `steg-core.js` and this package's TypeScript port. Each has its own unit
 * tests proving it is self-consistent. Neither proves they AGREE — and
 * agreement is the only thing that makes Phase 2 of
 * docs/stegassette-consolidation.md safe, because consumers are being switched
 * from one to the other under images that already exist in the wild.
 *
 * So this asserts three things per configuration:
 *   1. byte-identical encode   — both produce the same PNG pixels
 *   2. cross-decode A→B        — the lab's output decodes under this package
 *   3. cross-decode B→A        — this package's output decodes under the lab
 *
 * Run:  node scripts/test-parity.mjs
 *       LABS_STEG=/path/to/steg-core.js node scripts/test-parity.mjs
 *
 * TRANSITIONAL. Once Phase 2 lands and `steg-core.js` becomes a build artifact
 * of this package rather than a separate implementation, delete this file —
 * there will be nothing left to differ.
 */

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

const LABS =
  process.env.LABS_STEG ||
  resolve(here, "../../../../../stegassette/lib/steg-core.js");

if (!existsSync(LABS)) {
  console.error(`Cannot find the lab's steg-core.js at:\n  ${LABS}\n`);
  console.error("Set LABS_STEG to its path, e.g.");
  console.error("  LABS_STEG=~/projects/stegassette/lib/steg-core.js node scripts/test-parity.mjs");
  process.exit(2);
}

const A = require(LABS); // implementation A — the lab
const { Stegassette: B } = await import("../dist/node.js"); // implementation B — this package

let pass = 0;
const failures = [];

function check(name, cond, extra = "") {
  if (cond) {
    pass++;
  } else {
    failures.push(`${name}${extra ? " — " + extra : ""}`);
    console.error(`FAIL  ${name} ${extra}`);
  }
}

// ---- fixtures -------------------------------------------------------------
// Deterministic noisy cover so key pixels vary per channel, and a
// deterministic payload, so any difference is the codec's, not the input's.

function coverBytes(w, h) {
  const data = new Uint8Array(w * h * 4);
  let s = 12345;
  for (let i = 0; i < w * h; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    data[i * 4] = s & 0xff;
    data[i * 4 + 1] = (s >>> 8) & 0xff;
    data[i * 4 + 2] = (s >>> 16) & 0xff;
    data[i * 4 + 3] = 255;
  }
  return data;
}

function payloadBytes(n) {
  const d = new Uint8Array(n);
  let s = 99;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    d[i] = s & 0xff;
  }
  return d;
}

const W = 160;
const H = 120;
const COVER = coverBytes(W, H);
const PAYLOAD = payloadBytes(2000);
const MIME = "audio/L16; rate=22050; channels=1";

const imgA = () => new A.Img(W, H, new Uint8Array(COVER));
const imgB = () => new B.Img(W, H, new Uint8Array(COVER));
const entries = () => [{ mimetype: MIME, name: "a", data: new Uint8Array(PAYLOAD) }];

const sameBytes = (x, y) =>
  x.length === y.length && x.every((v, i) => v === y[i]);

// Two API differences between the implementations, neither a format
// difference, both able to break a migration silently:
//
//   1. argument order
//        lab: encodeContainer(entries, srcImg, keyImg, opts)
//        pkg: encodeContainer(entries, srcImg, opts, keyImg)
//   2. the keymap option's name
//        lab: opts.keyMap    pkg: opts.keymap
//
// Configs below are written with the package's spelling; toLabOpts translates.
// Do not "simplify" this by passing one object to both — that is precisely the
// bug this harness caught, and the package now throws on it.
const toLabOpts = ({ keymap, ...rest }) => ({ ...rest, keyMap: keymap });

const encA = (opts) => {
  const src = imgA();
  return A.encodeContainer(entries(), src, src, toLabOpts(opts));
};
const encB = (opts) => {
  const src = imgB();
  return B.encodeContainer(entries(), src, opts, src);
};

// ---- configuration matrix ------------------------------------------------

const BASE = { combine: "xor", traversal: "raster", keymap: "adjacent", borderWidth: 1 };

// fisher-yates seeds from Math.random() when no seed is given, so pin it —
// otherwise the two implementations cannot possibly agree byte-for-byte.
const withSeed = (o) =>
  (o.traversal === "fisher-yates" || o.traversal === "bayer" || o.traversal === "polar")
    ? { ...o, params: { seed: 0xc0ffee, ...(o.params || {}) } }
    : o;

const configs = [];

// every combine, every traversal, every keymap — one dimension at a time
for (const combine of A.COMBINE_NAMES) configs.push({ label: `combine=${combine}`, opts: { ...BASE, combine } });
for (const traversal of A.TRAVERSAL_NAMES) configs.push({ label: `traversal=${traversal}`, opts: { ...BASE, traversal } });
for (const keymap of A.KEYMAP_NAMES) configs.push({ label: `keymap=${keymap}`, opts: { ...BASE, keymap } });

// a cross-product sample: every combine against a few traversals/keymaps,
// since combine interacts with key-pixel handling
for (const combine of A.COMBINE_NAMES) {
  for (const traversal of ["spiral", "hilbert", "fisher-yates"]) {
    for (const keymap of ["adjacent", "poles"]) {
      configs.push({ label: `${combine}/${traversal}/${keymap}`, opts: { ...BASE, combine, traversal, keymap } });
    }
  }
}

// channel plans and bit depths — the areas the July port audit touched
configs.push({ label: "channels=r only", opts: { ...BASE, combine: "additive", channels: [{ ch: "r", combine: "additive" }] } });
configs.push({ label: "channels=bgr", opts: { ...BASE, combine: "additive", channels: "bgr" } });
configs.push({
  label: "per-channel combines",
  opts: { ...BASE, channels: [{ ch: "r", combine: "additive" }, { ch: "g", combine: "xor" }, { ch: "b", combine: "subtractive" }] },
});
configs.push({ label: "pack=mono", opts: { ...BASE, pack: "mono" } });
for (const bytesPerSample of [1, 2, 3]) {
  configs.push({ label: `bytesPerSample=${bytesPerSample}`, opts: { ...BASE, bytesPerSample } });
}

// borders — the aspect-preserving sizing work lives here
for (const borderWidth of [1, 2, 8, 24]) {
  configs.push({ label: `borderWidth=${borderWidth}`, opts: { ...BASE, borderWidth } });
}

// ---- run -----------------------------------------------------------------

console.log(`A (lab)     ${LABS}`);
console.log(`            CODEC_VERSION ${A.CODEC_VERSION}`);
console.log(`B (package) dist/node.js`);
console.log(`            CODEC_VERSION ${B.CODEC_VERSION}`);
console.log("");

check(
  "CODEC_VERSION matches across implementations",
  A.CODEC_VERSION === B.CODEC_VERSION,
  `${A.CODEC_VERSION} vs ${B.CODEC_VERSION}`
);

// The STGC header stores combine/keymap/traversal as INDICES into these
// arrays. If the orders ever diverge, every existing image silently decodes
// as the wrong mode — the single highest-consequence parity property here.
check("COMBINE_NAMES identical (order matters — header stores indices)", sameBytes(A.COMBINE_NAMES, B.COMBINE_NAMES), `${A.COMBINE_NAMES} vs ${B.COMBINE_NAMES}`);
check("TRAVERSAL_NAMES identical (order matters)", sameBytes(A.TRAVERSAL_NAMES, B.TRAVERSAL_NAMES), `${A.TRAVERSAL_NAMES} vs ${B.TRAVERSAL_NAMES}`);
check("KEYMAP_NAMES identical (order matters)", sameBytes(A.KEYMAP_NAMES, B.KEYMAP_NAMES), `${A.KEYMAP_NAMES} vs ${B.KEYMAP_NAMES}`);

// The `keyMap` guard. This harness originally passed the lab's spelling to
// both implementations; the package accepted it, ignored it, and encoded 38
// configurations with "adjacent" while labelling them correctly in the header
// — self-consistent output that was quietly not what was requested. The guard
// is what turns that into an error, so assert it actually fires.
{
  const src = imgB();
  let threw = null;
  try {
    B.encodeContainer(entries(), src, { ...toLabOpts({ ...BASE, keymap: "poles" }), borderWidth: 1 }, src);
  } catch (e) {
    threw = e.message;
  }
  check(
    "package rejects the lab's `keyMap` spelling instead of silently defaulting",
    threw !== null && /keymap/i.test(threw),
    threw === null ? "no error thrown" : threw
  );
}

for (const { label, opts: raw } of configs) {
  const opts = withSeed(raw);
  let a, b;

  try {
    a = encA(opts);
  } catch (e) {
    check(`${label}: lab encodes`, false, e.message);
    continue;
  }
  try {
    b = encB(opts);
  } catch (e) {
    check(`${label}: package encodes`, false, e.message);
    continue;
  }

  // 1. byte-identical encode
  check(
    `${label}: encode byte-identical`,
    a.width === b.width && a.height === b.height && sameBytes(a.data, b.data),
    a.width !== b.width || a.height !== b.height
      ? `dims ${a.width}x${a.height} vs ${b.width}x${b.height}`
      : firstDiff(a.data, b.data)
  );

  // 2. cross-decode: lab's output read by the package
  try {
    const { entries: out } = B.decodeContainer(new B.Img(a.width, a.height, new Uint8Array(a.data)));
    check(`${label}: lab→package decode`, out.length === 1 && sameBytes(out[0].data, PAYLOAD));
  } catch (e) {
    check(`${label}: lab→package decode`, false, e.message);
  }

  // 3. cross-decode: package's output read by the lab
  try {
    const encImg = new A.Img(b.width, b.height, new Uint8Array(b.data));
    const { entries: out } = A.decodeContainer(encImg, encImg);
    check(`${label}: package→lab decode`, out.length === 1 && sameBytes(out[0].data, PAYLOAD));
  } catch (e) {
    check(`${label}: package→lab decode`, false, e.message);
  }
}

function firstDiff(x, y) {
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i] !== y[i]) {
      const px = (i / 4) | 0;
      return `first diff at byte ${i} (pixel ${px % W},${(px / W) | 0} ch${i % 4}): ${x[i]} vs ${y[i]}`;
    }
  }
  return `lengths ${x.length} vs ${y.length}`;
}

console.log(`codec stage: ${pass} passed, ${failures.length} failed`);

// ═══════════════════════════════════════════════════════════════════════════
// Audio pipeline parity (Phase 1 step 2)
//
// The lab performs deinterleave → reverse → normalize → layout → PCM → mime
// inline in encode-batch.js. The package now owns that tail as
// prepareAudioEntry. Same input must give the same entry, byte for byte.
// ═══════════════════════════════════════════════════════════════════════════

const CFG = require(LABS.replace(/steg-core\.js$/, "config.js"));

function floatFrames(frames, channels) {
  const out = new Float32Array(frames * channels);
  let s = 7717;
  for (let i = 0; i < out.length; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    out[i] = ((s >>> 8) / 0x7fffff - 1) * 0.8;
  }
  return out;
}

// The lab's pipeline, transcribed from encode-batch.js buildAudioEntry.
function labAudioEntry(interleaved, { channels, sampleRate, bits, direction, normalize, layout, blockSize, name }) {
  const frames = (interleaved.length / channels) | 0;
  const mixed = [];
  for (let c = 0; c < channels; c++) {
    const ch = new Float32Array(frames);
    for (let i = 0; i < frames; i++) ch[i] = interleaved[i * channels + c];
    mixed.push(ch);
  }
  if (direction === "rev") mixed.forEach((ch) => ch.reverse());
  const db = CFG.resolveNormalize(normalize ?? null);
  if (db != null) A.peakNormalize(mixed, { targetDb: db });

  const effLayout = channels > 1 ? layout : "planar";
  const effBlock = effLayout === "block" ? Math.max(1, blockSize ?? 64) : 0;
  const appended = A.layoutChannels({ mixed, layout: effLayout, blockSize: effBlock });
  const data = A.float32ToPcm(appended, bits);
  const mimetype = A.buildAudioMime({ bits, rate: sampleRate, channels, layout: effLayout, blockSize: effBlock });
  return { mimetype, data, name };
}

for (const channels of [1, 2, 3]) {
  for (const bits of [8, 16, 24]) {
    for (const layout of ["planar", "interleaved", "block"]) {
      for (const direction of ["fwd", "rev"]) {
        for (const normalize of [null, true, -6, "-3.5", "off"]) {
          const label = `audio ch=${channels} bits=${bits} ${layout} ${direction} norm=${JSON.stringify(normalize)}`;
          const src = floatFrames(600, channels);
          let la, pa;
          try {
            la = labAudioEntry(new Float32Array(src), { channels, sampleRate: 22050, bits, direction, normalize, layout, blockSize: 64, name: "a" });
          } catch (e) {
            check(`${label}: lab builds`, false, e.message);
            continue;
          }
          try {
            pa = B.prepareAudioEntry({
              samples: new Float32Array(src),
              channels,
              sampleRate: 22050,
              bitsPerSample: bits,
              direction,
              normalize,
              layout,
              blockSize: 64,
              name: "a",
            });
          } catch (e) {
            check(`${label}: package builds`, false, e.message);
            continue;
          }
          check(`${label}: mimetype`, la.mimetype === pa.mimetype, `${la.mimetype} vs ${pa.mimetype}`);
          check(`${label}: pcm bytes`, sameBytes(la.data, pa.data), firstDiff(la.data, pa.data));
        }
      }
    }
  }
}

// resolveNormalize must agree on every loose form job files use.
for (const spec of [null, undefined, false, true, 0, -1, -6, -0.5, 3, "on", "off", "none", "", "yes", "no", "true", "false", "-3.5", "2", "garbage"]) {
  check(
    `resolveNormalize(${JSON.stringify(spec)})`,
    CFG.resolveNormalize(spec ?? null) === B.resolveNormalize(spec),
    `lab ${CFG.resolveNormalize(spec ?? null)} vs pkg ${B.resolveNormalize(spec)}`
  );
}

// resolveAudioRates encodes the relabel/resample contract. The mimetype rate
// is ALWAYS the target — writing the source rate there was a real bug once,
// and it is silent until you hear the playback.
{
  const relabel = B.resolveAudioRates({ mode: "relabel", sourceSampleRate: 44100, targetSampleRate: 22050 });
  check("relabel decodes at the SOURCE rate", relabel.decodeSampleRate === 44100, JSON.stringify(relabel));
  check("relabel labels with the TARGET rate", relabel.mimeSampleRate === 22050, JSON.stringify(relabel));
  const resample = B.resolveAudioRates({ mode: "resample", sourceSampleRate: 44100, targetSampleRate: 22050 });
  check("resample decodes at the TARGET rate", resample.decodeSampleRate === 22050, JSON.stringify(resample));
  check("resample labels with the TARGET rate", resample.mimeSampleRate === 22050, JSON.stringify(resample));
}

// ---- WAV I/O parity ------------------------------------------------------
{
  const labWav = require(LABS.replace(/steg-core\.js$/, "wav.js"));
  const { decodeWav, encodeWav } = await import("../dist/node.js");

  for (const [channels, bits] of [[1, 8], [1, 16], [2, 16], [2, 24]]) {
    const pcm = new Uint8Array(600 * channels * (bits >> 3));
    let s = 4242;
    for (let i = 0; i < pcm.length; i++) { s = (s * 1103515245 + 12345) >>> 0; pcm[i] = s & 0xff; }

    const labBuf = labWav.writeWav(pcm, 22050, channels, bits);
    const pkgBuf = encodeWav(pcm, 22050, channels, bits);
    check(`wav write ch=${channels} bits=${bits}: byte-identical`, sameBytes(new Uint8Array(labBuf), pkgBuf), firstDiff(new Uint8Array(labBuf), pkgBuf));

    // cross-read: each implementation reads the other's file
    const pkgReadOfLab = decodeWav(new Uint8Array(labBuf));
    check(`wav pkg reads lab ch=${channels} bits=${bits}`,
      pkgReadOfLab.sampleRate === 22050 && pkgReadOfLab.channels === channels &&
      pkgReadOfLab.bitsPerSample === bits && sameBytes(pkgReadOfLab.data, pcm),
      JSON.stringify({ sr: pkgReadOfLab.sampleRate, ch: pkgReadOfLab.channels, bits: pkgReadOfLab.bitsPerSample, len: pkgReadOfLab.data.length }));
  }
}

console.log(`audio + wav stage: ${pass} passed, ${failures.length} failed`);

// ═══════════════════════════════════════════════════════════════════════════
// Job schema parity (Phase 1 step 3)
//
// src/jobSchema.js is a mechanical move of the lab's lib/config.js — bodies
// untouched, wrapper and Core guards changed. This drives every export over
// the REAL job files in the lab, which is the only input that matters, plus
// synthetic edge cases for the split/frames planners.
// ═══════════════════════════════════════════════════════════════════════════

const PKGJOBS = await import("../dist/jobSchema.js");
const LABJOBS = require(LABS.replace(/steg-core\.js$/, "config.js"));

const deepEq = (a, b) => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEq(a[k], b[k]));
};
const show = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };

// Every export must exist on both sides.
for (const name of Object.keys(LABJOBS)) {
  check(`jobSchema exports ${name}`, PKGJOBS[name] !== undefined, "missing from the package");
}

// Constants and enum lists. ENUMS matters most: the package now sources
// combine/keymap/traversal from the codec instead of hardcoded fallbacks, so
// this asserts the real lists match what the lab was using.
check("DEFAULTS identical", deepEq(LABJOBS.DEFAULTS, PKGJOBS.DEFAULTS), show(PKGJOBS.DEFAULTS));
check("ENUMS identical", deepEq(LABJOBS.ENUMS, PKGJOBS.ENUMS), show(PKGJOBS.ENUMS));
check("SPLIT_AUDIO_KEYS identical", deepEq(LABJOBS.SPLIT_AUDIO_KEYS, PKGJOBS.SPLIT_AUDIO_KEYS));
check("NORMALIZE_DEFAULT_DB identical", LABJOBS.NORMALIZE_DEFAULT_DB === PKGJOBS.NORMALIZE_DEFAULT_DB);

// Pure helpers over a spread of inputs.
for (const p of ["a/b/c.wav", "x.MP3", "cover.png", "app.html", "note.md", "weird", "a.stegasette", "b.stegassette.png", "v.mp4"]) {
  check(`mimeFromPath(${p})`, LABJOBS.mimeFromPath(p) === PKGJOBS.mimeFromPath(p), `${LABJOBS.mimeFromPath(p)} vs ${PKGJOBS.mimeFromPath(p)}`);
  check(`outBase(${p})`, LABJOBS.outBase(p) === PKGJOBS.outBase(p), `${LABJOBS.outBase(p)} vs ${PKGJOBS.outBase(p)}`);
}
for (const a of [null, undefined, 0, 1, "1:1", "4:3", "16:9", "0.75", 0.75, "square", "garbage", -1]) {
  check(`resolveAspect(${show(a)})`, deepEq(LABJOBS.resolveAspect(a), PKGJOBS.resolveAspect(a)),
    `${show(LABJOBS.resolveAspect(a))} vs ${show(PKGJOBS.resolveAspect(a))}`);
}
for (const [count, layout] of [[1,"cols"],[2,"cols"],[3,"rows"],[4,"2x2"],[5,"2x2"],[9,"3x3"],[16,"4x4"],[7,"cols"],[0,"cols"],[6,"rows"]]) {
  check(`mosaicGrid(${count},${layout})`, deepEq(LABJOBS.mosaicGrid(count,layout), PKGJOBS.mosaicGrid(count,layout)),
    `${show(LABJOBS.mosaicGrid(count,layout))} vs ${show(PKGJOBS.mosaicGrid(count,layout))}`);
}
for (const e of [{path:"a.wav"},{path:"a.png"},{mimetype:"audio/L16"},{text:"hi"},{path:"v.mp4",sr:22050},{path:"v.mp4"}]) {
  check(`isAudioEntry(${show(e)})`, LABJOBS.isAudioEntry(e) === PKGJOBS.isAudioEntry(e),
    `${LABJOBS.isAudioEntry(e)} vs ${PKGJOBS.isAudioEntry(e)}`);
}

// The real job files — every job through resolveConfig, validateConfig,
// jobMode, framesSpec, splitSpec, and expandJob.
const jobsDir = LABS.replace(/lib\/steg-core\.js$/, "jobs");
const { readdirSync, readFileSync } = await import("node:fs");
let jobFiles = [];
try {
  jobFiles = readdirSync(jobsDir).filter((f) => f.endsWith(".jobs.json"));
} catch (e) {
  console.log(`(no jobs dir at ${jobsDir} — skipping real-job checks)`);
}

let jobCount = 0;
for (const file of jobFiles) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(`${jobsDir}/${file}`, "utf8"));
  } catch (e) {
    check(`${file} parses`, false, e.message);
    continue;
  }
  const jobs = Array.isArray(parsed) ? parsed : parsed.jobs || [parsed];
  jobs.forEach((job, i) => {
    const id = `${file}#${i}`;
    jobCount++;
    for (const fn of ["resolveConfig", "validateConfig", "jobMode", "framesSpec", "splitSpec", "splitAudioPath"]) {
      let a, b, ea = null, eb = null;
      try { a = LABJOBS[fn](job); } catch (e) { ea = e.message; }
      try { b = PKGJOBS[fn](job); } catch (e) { eb = e.message; }
      if (ea || eb) {
        check(`${id} ${fn} throws alike`, ea === eb, `lab ${show(ea)} vs pkg ${show(eb)}`);
      } else {
        check(`${id} ${fn}`, deepEq(a, b), `lab ${show(a)?.slice(0,160)} vs pkg ${show(b)?.slice(0,160)}`);
      }
    }
    // expandJob is the split/frames expander — the highest-value comparison
    const ctx = { durationMs: 187000, srcSr: 44100, bytesPerPixel: 3 };
    let ea = null, eb = null, a, b;
    try { a = LABJOBS.expandJob(job, ctx); } catch (e) { ea = e.message; }
    try { b = PKGJOBS.expandJob(job, ctx); } catch (e) { eb = e.message; }
    if (ea || eb) check(`${id} expandJob throws alike`, ea === eb, `lab ${show(ea)} vs pkg ${show(eb)}`);
    else check(`${id} expandJob (${a.length} job(s))`, deepEq(a, b), `lengths ${a.length} vs ${b.length}`);
  });
}
console.log(`job schema: ${jobFiles.length} job file(s), ${jobCount} job(s) compared`);

// Synthetic split planner cases — every chunking mode the schema supports.
const splitCtx = { durationMs: 187000, srcSr: 44100, bytesPerPixel: 3 };
const splitSpecs = [
  { count: 4 }, { count: 1 }, { count: 12 },
  { chunk: 20000 }, { chunk: 7000 },
  { maxBytes: 500000 }, { maxBytes: 50 },
  { maxPixels: 1000000 },
  { parts: [{ start: 0, end: 1000 }, { start: 1000, end: 5000 }] },
  { parts: [{ start: 0, end: 1000 }], count: 9 },
  { count: 3, sr: 11025, combine: "difference" },
  {}, { count: 0 }, { count: -2 }, { chunk: 0 },
];
for (const spec of splitSpecs) {
  let a, b, ea = null, eb = null;
  try { a = LABJOBS.planChunks(spec, splitCtx); } catch (e) { ea = e.message; }
  try { b = PKGJOBS.planChunks(spec, splitCtx); } catch (e) { eb = e.message; }
  if (ea || eb) check(`planChunks ${show(spec)} throws alike`, ea === eb, `lab ${show(ea)} vs pkg ${show(eb)}`);
  else check(`planChunks ${show(spec)}`, deepEq(a, b), `lab ${show(a)?.slice(0,140)} vs pkg ${show(b)?.slice(0,140)}`);
}
for (const srcSr of [8000, 22050, 44100, 48000]) {
  for (const spec of [{ sr: 22050, ch: 1, bits: 16 }, { sr: 44100, ch: 2, bits: 24, mode: "resample" }, { mode: "relabel" }]) {
    const la = LABJOBS.splitBytesPerSecond(spec, srcSr);
    const pa = PKGJOBS.splitBytesPerSecond(spec, srcSr);
    check(`splitBytesPerSecond(${show(spec)}, ${srcSr})`, la === pa, `${la} vs ${pa}`);
  }
}


// ── The job-schema → codec seam ────────────────────────────────────────────
//
// resolveConfig emits `encodeOpts.keyMap` (the lab's spelling), because it is a
// faithful move and the lab's encode-batch.js reads that key. The package's
// codec wants `keymap`. So encodeOpts CANNOT be passed straight through, and
// Phase 2 must translate at that boundary.
//
// This is exactly what the resolveKeymapName guard is for: assert the seam
// fails loudly rather than silently encoding with "adjacent".
{
  const { encodeOpts } = PKGJOBS.resolveConfig({ combine: "xor", keymap: "poles" });
  check(
    "resolveConfig still emits the lab's `keyMap` spelling (faithful move)",
    "keyMap" in encodeOpts && !("keymap" in encodeOpts),
    Object.keys(encodeOpts).join(",")
  );

  const src = imgB();
  let threw = null;
  try {
    B.encodeContainer(entries(), src, { ...encodeOpts, borderWidth: 1 }, src);
  } catch (e) {
    threw = e.message;
  }
  check(
    "feeding encodeOpts straight to the codec THROWS (seam caught, not silent)",
    threw !== null && /keymap/i.test(threw),
    threw === null ? "no error — the guard is not covering this path" : threw
  );

  // and the translated form works
  const { keyMap, ...rest } = encodeOpts;
  let ok = false;
  try {
    B.encodeContainer(entries(), imgB(), { ...rest, keymap: keyMap, borderWidth: 1 }, imgB());
    ok = true;
  } catch (e) {
    ok = e.message;
  }
  check("translating keyMap → keymap makes it work", ok === true, String(ok));
}

console.log("");
if (failures.length) {
  console.error(`${pass} passed, ${failures.length} FAILED`);
  console.error("");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${pass} passed, 0 failed — codec, audio pipeline, WAV, and job schema all agree.`);
