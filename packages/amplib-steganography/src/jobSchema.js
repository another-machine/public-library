/**
 * jobSchema — the canonical stegassette job/config schema.
 *
 * One JSON shape, one resolver, shared by the Node batch encoder (jobs/*.json)
 * and the browser editor: a jobs file can be pasted straight into the editor,
 * and the editor can emit a jobs file. Units are MILLISECONDS throughout
 * (start/end), matching batch jobs; the editor converts its internal seconds at
 * the boundary.
 *
 * A jobs file is an array of jobs, a single job, or { defaults, jobs } — see
 * resolveJobs, which is the only place that third shape is understood.
 *
 * MECHANICALLY MOVED from the lab's `lib/config.js`. The function bodies are
 * deliberately untouched — this is a wrapper change (IIFE + CJS dual pattern →
 * ESM named exports) plus the removal of the defensive `Core &&` guards, which
 * are unnecessary now that the codec is a real import. Those guards carried
 * hardcoded fallback copies of COMBINE_NAMES/KEYMAP_NAMES/TRAVERSAL_NAMES, and
 * since the STGC header stores those as INDICES, a fallback silently drifting
 * from the real list would mislabel every image. Importing them removes that
 * whole failure mode.
 *
 * Left as plain JS on purpose: a hand-translation to TypeScript is exactly the
 * kind of change that introduces silent divergence, and this file is the one
 * remaining shared surface with no differential coverage yet. Types can be
 * added incrementally now that there is only one copy.
 *
 * Browser-safe: no fs, no ffmpeg. Anything needing a binary (ffprobe) lives in
 * the jobs pipeline's own `probe.js`, not here.
 */

import {
  CHANNEL_NAMES,
  COMBINE_NAMES,
  KEYMAP_NAMES,
  PACK_NAMES,
  TRAVERSAL_NAMES,
  normalizeChannelPlan,
} from "./Stegassette/index";

// The schema versions INDEPENDENTLY of the codec, and must: the two change
// for different reasons. CODEC_VERSION pins the STGC wire format — bump it
// and every image ever encoded is implicated. This pins the job-file shape,
// which images know nothing about.
//
// They were once the same number, because the published copies of this file
// were stamped `stegassette-jobs-$CODEC_VERSION.js`. A schema change with no
// codec change then republished an EXISTING pinned filename with different
// bytes — a pin that silently changes meaning is worse than no pin, since
// the whole point is that a consumer can hold one and stop thinking about it.
//
// Format matches CODEC_VERSION (YYYY.MM.DD). Bump on any change to the job
// file shape or to how a field resolves.
//
// 2026.07.31 — the keymap enum gained "none" (keyless). ENUMS.keymap is
// KEYMAP_NAMES, imported from the codec, so a codec keymap is a schema change:
// this file's published bytes move with it, and a pin that did not move would
// mean two different validation surfaces under one filename. That it shares a
// date with CODEC_VERSION here is coincidence — both changed today — not the
// old coupling where this number WAS the codec's.
const SCHEMA_VERSION = "2026.07.31";

// Canonical field defaults (omitted fields fall back to these).
const DEFAULTS = {
  // file refs — batch-only; the editor ignores these on import (it uses
  // dropped files) and may stub/omit them on export.
  image: null,
  audio: null,
  out: null,
  // trim (milliseconds)
  start: 0,
  end: null,
  // audio
  sr: 22050,
  ch: 1,
  bits: 16,
  dir: "fwd", // fwd | rev
  mode: "relabel", // relabel | resample
  // peak normalization: null/false/"off" = off (default). true = on at the
  // default target (-1 dBFS). a number = on, that dBFS target (<= 0).
  normalize: null,
  layout: "planar", // planar | interleaved | block
  blockSize: 64,
  // effects
  combine: "xor",
  traversal: "raster",
  keymap: "adjacent",
  border: 0,
  aspect: null, // "original" | "16:9" | [W,H] | number | null
  seed: null, // fisher-yates
  angleA: 1, // angle traversal
  angleB: 1,
  kx: 0, // offset keymap
  ky: 0,
  // channel plan
  pack: "packed", // packed | aligned
  channels: null, // null = default (all 3, r→g→b, shared combine);
  //                 else array of { ch, combine } | letter string | token
  // entries — ordered array of { path, mimetype?, name?, ...audioParams } |
  //           { text, name? } objects. Audio entries are optional; a job with
  //           only file/text entries encodes a data-only cartridge.
  entries: [],
};

// Enum option lists — single source of truth for dropdowns + validation.
const ENUMS = {
  combine: COMBINE_NAMES,
  keymap: KEYMAP_NAMES,
  traversal: TRAVERSAL_NAMES,
  pack: PACK_NAMES,
  channel: CHANNEL_NAMES,
  dir: ["fwd", "rev"],
  mode: ["relabel", "resample"],
  layout: ["planar", "interleaved", "block"],
  bits: [8, 16, 24],
  mosaic: ["cols", "rows", "2x2", "3x3", "4x4"],
};

// Mimetype from a filename/path extension — one map for the batch encoder,
// the editor, and the entry-kind checks below.
const MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  aac: "audio/aac",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  xml: "application/xml",
  pdf: "application/pdf",
};
function mimeFromPath(filePath) {
  const ext = String(filePath || "")
    .split(".")
    .pop()
    .toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

// Default peak-normalization target (dBFS) when normalize is enabled as a
// bare flag (true / "on") without an explicit level.
const NORMALIZE_DEFAULT_DB = -1;

// Resolve a `normalize` spec to a target dBFS number, or null when off.
//   null / false / "off" / "" / "none" → null (off)
//   true / "on" / "yes"                → NORMALIZE_DEFAULT_DB
//   number / numeric string            → that dBFS, clamped to <= 0
function resolveNormalize(spec) {
  if (spec == null || spec === false) return null;
  if (spec === true) return NORMALIZE_DEFAULT_DB;
  if (typeof spec === "string") {
    const s = spec.trim().toLowerCase();
    if (s === "" || s === "off" || s === "none" || s === "false") return null;
    if (s === "on" || s === "yes" || s === "true") return NORMALIZE_DEFAULT_DB;
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.min(0, n) : NORMALIZE_DEFAULT_DB;
  }
  if (typeof spec === "number")
    return Number.isFinite(spec) ? Math.min(0, spec) : null;
  return null;
}

// Normalize an aspect spec to a numeric ratio (or null = keep original).
function resolveAspect(aspect) {
  if (!aspect || aspect === "original") return null;
  if (typeof aspect === "string" && aspect.includes(":")) {
    const [aw, ah] = aspect.split(":").map(Number);
    return aw && ah ? aw / ah : null;
  }
  if (Array.isArray(aspect) && aspect.length === 2)
    return aspect[0] / aspect[1];
  if (typeof aspect === "number") return aspect;
  return null;
}

// Merge a partial job over DEFAULTS, tolerating hyphenated angle keys.
function withDefaults(job = {}) {
  const j = { ...DEFAULTS, ...job };
  if (job["angle-a"] != null) j.angleA = job["angle-a"];
  if (job["angle-b"] != null) j.angleB = job["angle-b"];
  return j;
}

// resolveConfig(job) → fully-resolved settings used by both encoders.
// Returns normalized audio params, steg effect params, the channel-plan
// inputs, and a ready-to-use `encodeOpts` object for StegCore.encodeContainer.
function resolveConfig(job = {}) {
  const j = withDefaults(job);

  const sr = parseInt(j.sr) || 22050;
  const ch = parseInt(j.ch) || 1;
  const bits = parseInt(j.bits) || 16;
  const bytesPerSample = bits >> 3;
  // border >= 1 → explicit extra px (legacy). 0 < border < 1 → fraction of the
  // output width, resolved by the encode runner once the payload size is known
  // (see StegCore.resolveBorderWidth). borderWidth here is a placeholder in the
  // fractional case; the runner overwrites it before encoding.
  const borderRaw = Number(j.border) || 0;
  const borderFraction = borderRaw > 0 && borderRaw < 1 ? borderRaw : 0;
  const borderWidth = borderFraction
    ? 1
    : 1 + Math.max(0, Math.floor(borderRaw));

  // peak normalization: resolve to a target dBFS number, or null when off.
  // null/false/"off"/"" → off; true → default target; number/numeric string →
  // that target (clamped to <= 0 so the normalized peak never forces clipping).
  const normalizeDb = resolveNormalize(j.normalize);

  const layout = ch > 1 ? j.layout || "planar" : "planar";
  const blockSize =
    layout === "block" ? Math.max(1, parseInt(j.blockSize) || 64) : 0;

  const params = {};
  if (j.traversal === "fisher-yates") {
    if (j.seed != null) params.seed = j.seed >>> 0;
  } else if (j.traversal === "angle") {
    params.a = j.angleA;
    params.b = j.angleB;
  }
  if (j.keymap === "offset") {
    params.kx = j.kx | 0;
    params.ky = j.ky | 0;
  }

  // Both spellings, deliberately. Job FILES spell it `keymap`; the lab's
  // steg-core.js read `keyMap`; this package's codec reads `keymap` and throws
  // if it sees only `keyMap` (rather than silently defaulting to "adjacent").
  // encodeOpts is fed straight into encodeContainer by the batch runner and the
  // test suite, so emitting only one spelling breaks one side or the other.
  // The pair can go once nothing reads `keyMap` anywhere.
  const keymap = j.keymap || "adjacent";

  const encodeOpts = {
    combine: j.combine || "xor",
    traversal: j.traversal || "raster",
    keymap,
    keyMap: keymap,
    borderWidth,
    borderFraction,
    params,
    pack: j.pack === "aligned" ? "aligned" : j.pack === "mono" ? "mono" : "packed",
    channels: j.channels || null,
    bytesPerSample,
  };

  return {
    files: { image: j.image, audio: j.audio, out: j.out },
    trim: { start: j.start | 0, end: j.end == null ? null : j.end | 0 },
    audio: {
      sr,
      ch,
      bits,
      dir: j.dir === "rev" ? "rev" : "fwd",
      mode: j.mode === "resample" ? "resample" : "relabel",
      normalizeDb,
      layout,
      blockSize,
      bytesPerSample,
    },
    aspectOverride: resolveAspect(j.aspect),
    // `entries` is canonical; fall back to `texts` for old jobs files.
    entries: Array.isArray(j.entries) ? j.entries
      : Array.isArray(j.texts) ? j.texts : [],
    encodeOpts,
  };
}

// Validate enum-bearing fields; returns an array of human-readable warnings
// (empty = clean). Used by the editor when importing pasted JSON.
function validateConfig(job = {}) {
  const warn = [];
  const inEnum = (k, list) => {
    if (job[k] != null && !list.includes(job[k]))
      warn.push(`${k}="${job[k]}" is not one of: ${list.join(", ")}`);
  };
  inEnum("combine", ENUMS.combine);
  inEnum("keymap", ENUMS.keymap);
  inEnum("traversal", ENUMS.traversal);
  inEnum("pack", ENUMS.pack);
  inEnum("dir", ENUMS.dir);
  inEnum("mode", ENUMS.mode);
  inEnum("layout", ENUMS.layout);
  if (job.bits != null && !ENUMS.bits.includes(parseInt(job.bits)))
    warn.push(`bits=${job.bits} is not one of: ${ENUMS.bits.join(", ")}`);
  // channel-plan combines
  const ch = job.channels;
  const combos = [];
  if (Array.isArray(ch))
    for (const s of ch)
      if (s && typeof s === "object" && s.combine) combos.push(s.combine);
  if (typeof ch === "string" && ch.includes("."))
    for (const t of ch.split("+")) {
      const c = t.split(".")[1];
      if (c) combos.push(c);
    }
  for (const c of combos)
    if (!ENUMS.combine.includes(c))
      warn.push(`channel combine "${c}" is not one of: ${ENUMS.combine.join(", ")}`);
  // video-still cover
  const f = job.frames;
  if (f && !Array.isArray(f)) {
    if (f.layout != null && !ENUMS.mosaic.includes(f.layout))
      warn.push(
        `frames.layout="${f.layout}" is not one of: ${ENUMS.mosaic.join(", ")}`,
      );
    if (!Array.isArray(f.at) || !f.at.length)
      warn.push("frames needs an `at` array of timestamps (ms)");
  }
  return warn;
}

// A job's `out` is an extensionless base path; the encode runner appends
// `.png` and the video runner appends `.mp4`. Strip only real media
// extensions so dotted stem names (e.g. "01.stegasette") survive — and so a
// legacy `out` that still carries a `.png` extension resolves the same.
function outBase(out) {
  return String(out).replace(/\.(png|mp4|webm|mov|mkv)$/i, "");
}

// ══════════════════════════════════════════════════════════════════════
// frames — a cover built from video stills
// ══════════════════════════════════════════════════════════════════════
// The editor's video mode grabs stills off a video and tiles them into one
// cover. `frames` is that, written down: the job's `image` points at a video
// and `frames.at` lists the timestamps to grab (ms).
//
//   "image": "clip.mp4",
//   "frames": { "at": [1200, 45000, 90200], "layout": "3x3" }
//
// One timestamp is just that still. `layout` tiles several: cols | rows |
// 2x2 | 3x3 | 4x4 (default: cols). Cells beyond the frame count stay empty.

function framesSpec(job) {
  const f = job && job.frames;
  if (!f) return null;
  const at = Array.isArray(f) ? f : Array.isArray(f.at) ? f.at : null;
  if (!at || !at.length) return null;
  const layout = (!Array.isArray(f) && f.layout) || "cols";
  return {
    at: at.map(Number).filter((n) => Number.isFinite(n) && n >= 0),
    layout: ENUMS.mosaic.includes(layout) ? layout : "cols",
  };
}

// Mosaic grid for `count` stills under a layout name. Shared so the editor's
// canvas compositor and the batch encoder's pixel compositor agree on shape.
function mosaicGrid(count, layout) {
  const n = Math.max(1, count | 0);
  if (layout === "rows") return { cols: 1, rows: n };
  if (layout && /^(\d)x\1$/.test(layout)) {
    const k = parseInt(layout[0], 10);
    return { cols: k, rows: k };
  }
  return { cols: n, rows: 1 };
}

// ══════════════════════════════════════════════════════════════════════
// split — one long source audio spread across N images
// ══════════════════════════════════════════════════════════════════════
// A job may carry a `split` block in place of its own audio entry. Expanding
// it yields one ORDINARY job per chunk — each with its own cover image, `out`
// path and text entries, and an audio entry trimmed to that chunk's window of
// the shared source file. Everything downstream (encode-batch, video-batch,
// the editor) only ever sees plain jobs.
//
//   "split": {
//     "path": "source/tape.mp3",    source audio every chunk slices
//     "sr": 11025, "ch": 1, …       audio params shared by every chunk
//     "start": 0, "end": null,      source window to divide (ms; end
//                                   defaults to the probed duration)
//     "count": 8,                   ── N equal chunks
//     "chunk": 45000,               ── ms per chunk (count is derived)
//     "maxPixels": 16000000,        ── chunk to fit an output-pixel budget
//     "maxBytes": 4000000,          ── chunk to fit a payload-byte budget
//     "gap": 0,                     ms of source dropped between chunks
//     "pad": 2,                     digits in the generated `out` suffix
//     "image": "cover.png",         cover for parts that name none
//     "images": ["a.png", "b.png"], per-part covers, positional
//     "entries": [ … ],             entries appended to EVERY chunk
//     "parts": [                    per-chunk detail; its length sets count
//       { "start": 0, "end": 42000, image/out/name overrides,
//         "entries": [ { "text": "…" } ],
//         plus any audio key (sr/ch/bits/…) or steg key (combine/…) }
//     ]
//   }
//
// The auto modes divide the window into EQUAL chunks (no runt tail): `chunk`
// and the budgets pick the count, then the span is shared out evenly.

// Does this entry describe audio to run through the pipeline? An `audio/*`
// path always does; a `video/*` path does when it carries audio params, which
// is how the editor's video mode names a clip's own soundtrack.
function isAudioEntry(entry) {
  if (!entry || entry.path == null) return false;
  const mime = entry.mimetype || mimeFromPath(entry.path);
  if (mime.startsWith("audio/")) return true;
  return (
    mime.startsWith("video/") &&
    SPLIT_AUDIO_KEYS.some((k) => k !== "mimetype" && entry[k] != null)
  );
}

// Which editor mode a job describes — derived, never stored, so a job file
// and the editor can't disagree:
//   series  a `split` block           video  video stills as the cover
//   clip    one audio entry           data   no audio at all (data cartridge)
function jobMode(job = {}) {
  if (splitSpec(job)) return "series";
  if (framesSpec(job)) return "video";
  const entries = Array.isArray(job.entries) ? job.entries : [];
  if (entries.some(isAudioEntry)) return "clip";
  if (job.image && mimeFromPath(job.image).startsWith("video/")) return "video";
  return "data";
}

// Part/spec keys that belong on the chunk's audio ENTRY rather than the job.
const SPLIT_AUDIO_KEYS = [
  "sr",
  "ch",
  "bits",
  "dir",
  "mode",
  "normalize",
  "layout",
  "blockSize",
  "mimetype",
];
// Part keys consumed by the expander itself.
const PART_STRUCTURAL = ["start", "end", "image", "out", "name", "entries"];

function splitSpec(job) {
  const s = job && job.split;
  return s && typeof s === "object" ? s : null;
}

// Source audio path a split chunks (callers probe this for duration/rate).
function splitAudioPath(job) {
  const s = splitSpec(job);
  return s ? s.path || null : null;
}

// PCM bytes one second of SOURCE audio becomes under a split's settings.
// `relabel` keeps the source samples (only the declared rate changes), so its
// payload is sized by the source rate; `resample` actually rewrites them.
function splitBytesPerSecond(spec, srcSr) {
  const sr = parseInt(spec.sr) || DEFAULTS.sr;
  const ch = parseInt(spec.ch) || DEFAULTS.ch;
  const bits = parseInt(spec.bits) || DEFAULTS.bits;
  const mode = spec.mode || DEFAULTS.mode;
  const eff = mode === "resample" ? sr : srcSr || sr;
  return Math.max(1, eff * ch * (bits >> 3));
}

// Payload bytes one DATA pixel carries under this job's channel plan.
function jobBytesPerPixel(job, spec) {
  const bits =
    parseInt((spec && spec.bits) ?? job.bits) || DEFAULTS.bits;
  const { encodeOpts } = resolveConfig({ ...job, bits });
  return normalizeChannelPlan(
    encodeOpts,
    encodeOpts.bytesPerSample,
    0,
  ).bytesPerPixel;
}

// Payload-byte ceiling per chunk, or null when the spec sets no budget.
// A pixel budget converts through the data/key checkerboard: only half the
// output pixels carry payload, each holding `bytesPerPixel` of it.
function splitByteBudget(spec, ctx) {
  if (spec.maxBytes != null) return Math.max(1, Number(spec.maxBytes) || 0);
  if (spec.maxPixels != null) {
    const bpp = ctx.bytesPerPixel || 3;
    const reserve = Math.max(0, Number(spec.reserveBytes) || 0);
    const px = Math.max(2, Number(spec.maxPixels) || 0);
    return Math.max(1, Math.floor((px / 2) * bpp) - reserve);
  }
  return null;
}

// Divide a split's source window into chunk windows: [{ start, end }] in ms.
// ctx: { durationMs, srcSr, bytesPerPixel } — only the auto modes need it.
function planChunks(spec, ctx = {}) {
  const parts = Array.isArray(spec.parts) ? spec.parts : null;
  const gap = Math.max(0, Number(spec.gap) || 0);

  // fully explicit parts describe their own windows — nothing to divide
  if (parts && parts.length && parts.every((p) => p && p.start != null && p.end != null))
    return parts.map((p) => ({ start: Number(p.start), end: Number(p.end) }));

  const winS = Math.max(0, Number(spec.start) || 0);
  const winE = spec.end != null ? Number(spec.end) : ctx.durationMs ?? null;
  if (winE == null || !(winE > winS))
    throw new Error(
      "split: need `end` (or a readable source duration) to divide into chunks",
    );

  let count = null;
  if (parts && parts.length) count = parts.length;
  else if (spec.count != null) count = Math.max(1, parseInt(spec.count) || 1);

  if (count == null) {
    let chunkMs;
    if (spec.chunk != null) chunkMs = Math.max(1, Number(spec.chunk) || 0);
    else {
      const budget = splitByteBudget(spec, ctx);
      if (budget == null)
        throw new Error(
          "split: needs one of `parts`, `count`, `chunk`, `maxBytes` or `maxPixels`",
        );
      chunkMs = Math.max(
        1,
        Math.floor((budget / splitBytesPerSecond(spec, ctx.srcSr)) * 1000),
      );
    }
    count = Math.max(1, Math.ceil((winE - winS) / chunkMs));
  }

  const span = (winE - winS) / count;
  const windows = [];
  for (let i = 0; i < count; i++) {
    const s = winS + i * span;
    const e = i === count - 1 ? winE : winS + (i + 1) * span - gap;
    windows.push({ start: Math.round(s), end: Math.round(Math.max(s, e)) });
  }
  // a partly-specified part still pins whichever edge it names
  if (parts)
    parts.forEach((p, i) => {
      if (!p || !windows[i]) return;
      if (p.start != null) windows[i].start = Number(p.start);
      if (p.end != null) windows[i].end = Number(p.end);
    });
  return windows;
}

// expandJob(job, ctx) → [job] unchanged, or one plain job per split chunk.
function expandJob(job = {}, ctx = {}) {
  const spec = splitSpec(job);
  if (!spec) return [job];

  const c = { bytesPerPixel: jobBytesPerPixel(job, spec), ...ctx };
  const windows = planChunks(spec, c);
  const parts = Array.isArray(spec.parts) ? spec.parts : [];
  const images = Array.isArray(spec.images) ? spec.images : [];
  const pad = spec.pad != null ? Math.max(0, parseInt(spec.pad) || 0) : 2;
  const baseOut = spec.out != null ? spec.out : job.out;

  const sharedAudio = {};
  for (const k of SPLIT_AUDIO_KEYS)
    if (spec[k] != null) sharedAudio[k] = spec[k];

  // top-level fields every chunk inherits (its own entries come from the part)
  const inherited = { ...job };
  delete inherited.split;
  delete inherited.entries;

  return windows.map((w, i) => {
    const part = parts[i] || {};
    const out = { ...inherited };

    const image = part.image ?? images[i] ?? spec.image ?? job.image;
    if (image != null) out.image = image;

    const o =
      part.out ??
      (baseOut != null
        ? `${outBase(baseOut)}-${String(i + 1).padStart(pad, "0")}`
        : null);
    if (o != null) out.out = o;

    // any non-structural, non-audio part key overrides the job (combine,
    // traversal, keymap, border, aspect, channels, …)
    for (const k of Object.keys(part))
      if (!PART_STRUCTURAL.includes(k) && !SPLIT_AUDIO_KEYS.includes(k))
        out[k] = part[k];

    const audio = { path: spec.path, ...sharedAudio };
    for (const k of SPLIT_AUDIO_KEYS) if (part[k] != null) audio[k] = part[k];
    const nm = part.name ?? spec.name;
    if (nm != null) audio.name = String(nm);
    audio.start = w.start;
    audio.end = w.end;

    out.entries = [
      audio,
      ...(Array.isArray(part.entries) ? part.entries : []),
      ...(Array.isArray(spec.entries) ? spec.entries : []),
      ...(Array.isArray(job.entries) ? job.entries : []),
    ];
    return out;
  });
}

// ══════════════════════════════════════════════════════════════════════
// jobs files — shared settings, overridden per job
// ══════════════════════════════════════════════════════════════════════
// A jobs file is one of:
//
//   [ job, job, … ]                    an array of jobs
//   job                                a single job
//   { "defaults": { … }, "jobs": [ … ] }
//
// The third form lifts settings every job shares — a project usually picks
// one look and keeps it — so a job carries only what makes it that job.
// It is the same inheritance a split already gives its `parts`: a key set
// on the job wins over the same key in `defaults`.
//
// The merge is one level deep, so a job's `entries`, `split`, `frames` or
// `channels` REPLACE the default rather than merging into it. Those are
// whole specs; half-overriding one would be a guessing game.
//
// Nothing else in the schema knows about this shape — resolveJobs is the
// only door, and everything downstream sees plain jobs.
function resolveJobs(file) {
  if (file && !Array.isArray(file) && Array.isArray(file.jobs)) {
    const defaults = file.defaults || {};
    return file.jobs.map((job) => ({ ...defaults, ...job }));
  }
  return Array.isArray(file) ? file : [file];
}

// expandJobs(jobs, ctxFor) — flatten a whole jobs file. `ctxFor(job, spec)`
// is called only for split jobs and supplies { durationMs, srcSr } for the
// auto modes (the batch runners probe with ffprobe; the editor knows the
// decoded buffer). Returning nothing is fine when the split is explicit.
function expandJobs(jobs, ctxFor) {
  const list = resolveJobs(jobs);
  const out = [];
  for (const job of list) {
    const spec = splitSpec(job);
    const ctx =
      spec && typeof ctxFor === "function" ? ctxFor(job, spec) || {} : {};
    for (const j of expandJob(job, ctx)) out.push(j);
  }
  return out;
}

export {
  SCHEMA_VERSION,
  DEFAULTS,
  ENUMS,
  NORMALIZE_DEFAULT_DB,
  SPLIT_AUDIO_KEYS,
  resolveConfig,
  validateConfig,
  resolveAspect,
  resolveNormalize,
  outBase,
  mimeFromPath,
  isAudioEntry,
  jobMode,
  framesSpec,
  mosaicGrid,
  splitSpec,
  splitAudioPath,
  splitBytesPerSecond,
  planChunks,
  expandJob,
  expandJobs,
  resolveJobs,
};
