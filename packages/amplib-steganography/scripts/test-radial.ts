/**
 * test-radial.ts — the radial traversal and the "shape" fit.
 *
 * `radial` measures distance in half-widths and half-heights, so its prefixes
 * are the ellipse inscribed in the canvas — the boundary it declares in
 * TRAVERSAL_SHAPE. `fit: "shape"` sizes the canvas so the payload ends at the
 * traversal's declared boundary instead of reaching the corners; for a
 * traversal that declares none, it means the same thing as "compact".
 *
 * The assertions that matter most are the boring ones at the top. `center-out`,
 * the plain spiral and a default (`compact`) encode all have images in the wild
 * that decode by reproducing their exact pixel order, so this file pins those
 * orders as literals — a change to the shared solver or comparator that alters
 * them is not a refactor, it is a format break.
 *
 * Run: npm run test:radial
 */

import {
  buildDescriptor,
  compactFit,
  decodeImageData,
  ellipseDataPixelCount,
  ellipseFit,
  ellipseRadius2,
  encodeImageData,
  getPathIndices,
  interiorDims,
  isDataPixel,
  packStgcHeader,
  parseDescriptor,
  TRAVERSAL_NAMES,
} from "../src/Stegassette/index";
import type {
  Entry,
  FitFn,
  FitMode,
  StegaImageData,
  TraversalName,
  TraversalParams,
} from "../src/Stegassette/types";

let pass = 0;
const failures: string[] = [];
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (cond) pass++;
  else {
    failures.push(`${name}${extra ? " — " + extra : ""}`);
    console.error(`FAIL  ${name} ${extra}`);
  }
};
const sameList = (a: ArrayLike<number>, b: ArrayLike<number>) =>
  a.length === b.length && [...a].every((v, i) => v === b[i]);

const path = (
  W: number,
  H: number,
  traversal: TraversalName,
  params: TraversalParams = {},
  keyless = true
) => [...getPathIndices(W, H, traversal, params, keyless)];

/** Deterministic cover image — never flat, so a wrong key shows up as garbage. */
function cover(W: number, H: number): StegaImageData {
  const data = new Uint8Array(W * H * 4);
  let s = 0x1234567;
  for (let i = 0; i < W * H; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    data[i * 4] = s & 0xff;
    data[i * 4 + 1] = (s >>> 8) & 0xff;
    data[i * 4 + 2] = (s >>> 16) & 0xff;
    data[i * 4 + 3] = 255;
  }
  return { width: W, height: H, data };
}

function payload(n: number): Uint8Array {
  const p = new Uint8Array(n);
  for (let i = 0; i < n; i++) p[i] = (i * 97 + 13) & 0xff;
  return p;
}

const entriesOf = (n: number): Entry[] => [
  { mimetype: "application/octet-stream", name: "p.bin", data: payload(n) },
];

// ── compatibility ──────────────────────────────────────────────────────────
//
// Pinned as literals rather than compared against a recomputation, so the test
// has an opinion about what these orders are.

check("center-out is still Euclidean pixel distance", sameList(
  path(5, 4, "center-out"),
  [7, 12, 6, 8, 11, 13, 2, 17, 1, 3, 16, 18, 5, 9, 10, 14, 0, 4, 15, 19]));

check("radial does NOT redefine center-out", !sameList(
  path(5, 4, "center-out"), path(5, 4, "radial")));

check("spiral with no params is unchanged", sameList(
  path(5, 4, "spiral"),
  [0, 1, 2, 3, 4, 9, 14, 19, 18, 17, 16, 15, 10, 5, 6, 7, 8, 13, 12, 11]));

check("spiral rotation=cw is the default spiral", sameList(
  path(5, 4, "spiral"), path(5, 4, "spiral", { rotation: "cw" })));

check("spiral rotation=ccw winds the other way", sameList(
  path(5, 4, "spiral", { rotation: "ccw" }),
  [0, 5, 10, 15, 16, 17, 18, 19, 14, 9, 4, 3, 2, 1, 6, 11, 12, 13, 8, 7]));

// An unknown traversal param must not disturb a traversal that does not read
// it — old images carry no direction/rotation at all.
for (const t of TRAVERSAL_NAMES) {
  if (t === "radial" || t === "spiral") continue;
  check(`${t} ignores direction/rotation`, sameList(
    path(7, 5, t), path(7, 5, t, { direction: "in", rotation: "ccw" })));
}

check("radial is appended to TRAVERSAL_NAMES, not inserted",
  TRAVERSAL_NAMES[TRAVERSAL_NAMES.length - 1] === "radial" &&
    TRAVERSAL_NAMES.length === 10, TRAVERSAL_NAMES.join(","));

// The descriptor a pre-radial encoder wrote for these traversals, byte for
// byte. `rotation` is absent for a default spiral on purpose: adding it would
// change every spiral image this encoder produces from here on.
const descOf = (traversal: TraversalName, params: TraversalParams = {}) =>
  new TextDecoder().decode(
    buildDescriptor({ combine: "xor", keymap: "adjacent", traversal, params }));

check("a default spiral descriptor is unchanged",
  descOf("spiral") === "combine=xor\x01keymap=adjacent\x01traversal=spiral\x01",
  JSON.stringify(descOf("spiral")));
check("a default center-out descriptor is unchanged",
  descOf("center-out") === "combine=xor\x01keymap=adjacent\x01traversal=center-out\x01",
  JSON.stringify(descOf("center-out")));
check("ccw is the only spiral rotation that lands in the descriptor",
  descOf("spiral", { rotation: "ccw" }) ===
    "combine=xor\x01keymap=adjacent\x01traversal=spiral\x01rotation=ccw\x01",
  JSON.stringify(descOf("spiral", { rotation: "ccw" })));
check("radial always writes its direction",
  descOf("radial") === "combine=xor\x01keymap=adjacent\x01traversal=radial\x01direction=out\x01" &&
    descOf("radial", { direction: "in" }) ===
      "combine=xor\x01keymap=adjacent\x01traversal=radial\x01direction=in\x01",
  JSON.stringify(descOf("radial", { direction: "in" })));

// Interior dimensions for a compact fit, pinned. These decide the size of every
// image this package has ever produced.
for (const [dataPx, aspect, B, keyless, IW, IH] of [
  [10000, 1, 1, false, 141, 142],
  [10000, 16 / 9, 1, false, 190, 106],
  [10000, 0.5, 2, false, 99, 203],
  [10000, 1, 1, true, 100, 100],
] as Array<[number, number, number, boolean, number, number]>) {
  const d = interiorDims(dataPx, aspect, B, keyless);
  const dExplicit = interiorDims(dataPx, aspect, B, keyless, compactFit);
  check(`compact interiorDims(${dataPx}, ${aspect.toFixed(3)}, ${B}, ${keyless})`,
    d.IW === IW && d.IH === IH, `${d.IW}x${d.IH}`);
  check(`an explicit compactFit is the default`,
    d.IW === dExplicit.IW && d.IH === dExplicit.IH);
}

{
  // …and the whole encode, byte for byte.
  const src = cover(200, 150);
  const opts = { source: src, traversal: "radial" as const, border: 1 };
  const a = encodeImageData({ ...opts, entries: entriesOf(4000) });
  const b = encodeImageData({ ...opts, entries: entriesOf(4000), fit: "compact" });
  check("an unspecified fit is identical to compact",
    a.width === b.width && a.height === b.height &&
      sameList(a.data as Uint8Array, b.data as Uint8Array));
}

// ── radial ordering ────────────────────────────────────────────────────────

{
  const W = 41, H = 25;
  const out = path(W, H, "radial");
  const inward = path(W, H, "radial", { direction: "in" });

  check("radial out starts at the center pixel",
    out[0] === ((H - 1) / 2) * W + (W - 1) / 2, String(out[0]));
  check("radial out ends at a corner",
    [0, W - 1, (H - 1) * W, H * W - 1].includes(out[out.length - 1]),
    String(out[out.length - 1]));
  check("radial covers every pixel exactly once",
    new Set(out).size === W * H && out.length === W * H);
  check("radial is deterministic", sameList(out, path(W, H, "radial")));

  // Direction owns the ORDER, not the footprint. The ellipse is a prefix of
  // both paths, holding the same pixels; only "in" walks it backwards. Reversing
  // the whole path instead would start a shape-fit payload in the corners.
  const k = ellipseDataPixelCount(W, H, true);
  check("the ellipse is a prefix of the radial path",
    out.slice(0, k).every((v) => ellipseRadius2(v % W, (v / W) | 0, W, H) <= 1) &&
      out.slice(k).every((v) => ellipseRadius2(v % W, (v / W) | 0, W, H) > 1),
    `k=${k}`);
  check("radial in covers the same ellipse as radial out",
    new Set(inward.slice(0, k)).size === k &&
      inward.slice(0, k).every((v) => out.slice(0, k).includes(v)));
  check("radial in is radial out reversed within the ellipse",
    sameList(inward.slice(0, k), out.slice(0, k).reverse()));
  check("radial in leaves the pixels outside the ellipse untouched, at the tail",
    sameList(inward.slice(k), path(W, H, "radial").slice(k)));
  check("radial in starts at the ellipse boundary, not a corner",
    ellipseRadius2(inward[0] % W, (inward[0] / W) | 0, W, H) <= 1);
  check("radial in ends at the center",
    inward[k - 1] === ((H - 1) / 2) * W + (W - 1) / 2, String(inward[k - 1]));

  // Radius is non-decreasing along the path — the property every prefix-is-an-
  // ellipse claim rests on.
  let monotone = true;
  for (let i = 1; i < out.length; i++) {
    const a = ellipseRadius2(out[i - 1] % W, (out[i - 1] / W) | 0, W, H);
    const b = ellipseRadius2(out[i] % W, (out[i] / W) | 0, W, H);
    if (b < a) monotone = false;
  }
  check("radial radius never decreases along the path", monotone);

  // Ties break by raster index, so the four pixels equidistant from the center
  // come out in reading order.
  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  const ring = [
    (cy - 2) * W + (cx - 2), (cy - 2) * W + (cx + 2),
    (cy + 2) * W + (cx - 2), (cy + 2) * W + (cx + 2),
  ];
  const positions = ring.map((v) => out.indexOf(v));
  check("equal radii break by raster index",
    positions.every((p, i) => i === 0 || p > positions[i - 1]),
    positions.join(","));
}

check("a square canvas orders radially exactly as center-out does",
  sameList(path(16, 16, "radial"), path(16, 16, "center-out")));

{
  // A prefix of the path, measured as a fraction of the half-axes, should reach
  // the same normalized extent on both axes — that is what "elliptical" means.
  // In pixels the extents differ by the aspect ratio, which is the point.
  const extents = (W: number, H: number, traversal: TraversalName) => {
    const p = path(W, H, traversal).slice(0, Math.round(W * H * 0.3));
    let ex = 0, ey = 0;
    for (const v of p) {
      ex = Math.max(ex, Math.abs((v % W) - (W - 1) / 2));
      ey = Math.max(ey, Math.abs(((v / W) | 0) - (H - 1) / 2));
    }
    return { ex, ey, nx: ex / (W / 2), ny: ey / (H / 2) };
  };

  for (const [W, H, label] of [
    [64, 64, "square"], [96, 32, "landscape"], [32, 96, "portrait"],
  ] as Array<[number, number, string]>) {
    const e = extents(W, H, "radial");
    check(`radial on a ${label} canvas is normalized-circular`,
      Math.abs(e.nx - e.ny) < 0.08, `nx=${e.nx.toFixed(3)} ny=${e.ny.toFixed(3)}`);
  }

  const land = extents(96, 32, "radial");
  check("a landscape radial prefix is wider than it is tall",
    land.ex > land.ey * 2.5, `${land.ex}px × ${land.ey}px`);
  const port = extents(32, 96, "radial");
  check("a portrait radial prefix is taller than it is wide",
    port.ey > port.ex * 2.5, `${port.ex}px × ${port.ey}px`);
  // center-out on the same rectangle is circular in pixels, so it runs off the
  // short edge long before the long one.
  const legacy = extents(96, 32, "center-out");
  check("center-out on a landscape canvas stays circular in pixels",
    Math.abs(legacy.ex - legacy.ey) < 3, `${legacy.ex}px × ${legacy.ey}px`);
}

// ── ellipse capacity ───────────────────────────────────────────────────────

{
  let agree = true;
  let mismatch = "";
  for (let W = 2; W <= 40; W++)
    for (let H = 2; H <= 40; H++)
      for (const keyless of [false, true]) {
        let brute = 0;
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++)
            if (ellipseRadius2(x, y, W, H) <= 1 && (keyless || isDataPixel(x, y)))
              brute++;
        const n = ellipseDataPixelCount(W, H, keyless);
        if (n !== brute) {
          agree = false;
          mismatch ||= `${W}x${H} keyless=${keyless}: ${n} vs ${brute}`;
        }
      }
  check("ellipseDataPixelCount matches a per-pixel count", agree, mismatch);
}

check("the ellipse holds about π/4 of the rectangle",
  Math.abs(ellipseDataPixelCount(400, 400) / ((400 * 400) / 2) - Math.PI / 4) < 0.01,
  String(ellipseDataPixelCount(400, 400) / ((400 * 400) / 2)));

// ── shape fit ──────────────────────────────────────────────────────────────

/**
 * Walk an encoded image the way its own decoder would, and report where the
 * payload actually landed.
 */
function payloadExtent(enc: StegaImageData) {
  const { opts } = decodeImageData({ source: enc });
  const B = opts.borderWidth;
  const IW = enc.width - 2 * B, IH = enc.height - 2 * B;
  const keyless = opts.keymap === "none";
  const p = getPathIndices(IW, IH, opts.traversal, opts.params, keyless);
  const used = Math.ceil(opts.interiorByteLength / opts.plan.bytesPerPixel);
  let maxR2 = 0;
  for (let i = 0; i < used; i++)
    maxR2 = Math.max(maxR2, ellipseRadius2(p[i] % IW, (p[i] / IW) | 0, IW, IH));
  return { IW, IH, B, used, maxR2, capacity: ellipseDataPixelCount(IW, IH, keyless) };
}

for (const [aspect, label] of [
  [1, "square"], [16 / 9, "landscape"], [9 / 16, "portrait"],
] as Array<[number, string]>)
  for (const keymap of ["adjacent", "none"] as const)
    for (const direction of ["out", "in"] as const)
    for (const bytes of [800, 12000]) {
      const args = {
        source: cover(300, 300),
        entries: entriesOf(bytes),
        traversal: "radial" as const,
        params: { direction },
        keymap,
        aspectRatio: aspect,
        border: 1,
      };
      const enc = encodeImageData({ ...args, fit: "shape" });
      const compact = encodeImageData(args);
      const tag = `${label}/${keymap}/${direction}/${bytes}B`;

      // A canvas is integers, so the aspect can only be met to within a pixel
      // of the shorter side. Measured against the compact canvas for the same
      // payload rather than an absolute tolerance: the claim is that asking for
      // a circle costs nothing in shape, not that either fit is exact.
      const err = (i: StegaImageData) => Math.abs(i.width / i.height - aspect) / aspect;
      const rounding = 1.5 / Math.min(enc.width, enc.height);
      check(`shape fit keeps the ${tag} aspect ratio`,
        err(enc) <= Math.max(err(compact), rounding),
        `${enc.width}x${enc.height} (${err(enc) * 100}%) vs compact ${compact.width}x${compact.height} (${err(compact) * 100}%)`);
      check(`${label} stays ${label} (${keymap}/${bytes}B)`,
        aspect === 1
          ? Math.abs(enc.width - enc.height) <= 1
          : Math.sign(enc.width - enc.height) === Math.sign(aspect - 1),
        `${enc.width}x${enc.height}`);

      const e = payloadExtent(enc);
      check(`the ${tag} payload lands inside the ellipse`,
        e.maxR2 <= 1, `max r² = ${e.maxR2.toFixed(6)}`);
      // Slack here is the gap between the payload and the ellipse it was sized
      // for — an unwritten ring going out, a hole at the center coming in. The
      // floor is one row or column of the grid, not zero.
      check(`the ${tag} ellipse is filled, not merely fitted`,
        e.used <= e.capacity && e.capacity - e.used <= e.capacity * 0.06,
        `${e.used} of ${e.capacity} (${(((e.capacity - e.used) / e.capacity) * 100).toFixed(2)}% spare)`);

      const { entries: back } = decodeImageData({ source: enc });
      check(`the ${tag} shape-fit payload round-trips`,
        back.length === 1 && sameList(back[0].data, payload(bytes)));
    }

{
  // The corners are the whole cost of the mode: a shape canvas has ~4/π the
  // area of the compact one holding the same payload.
  const args = {
    source: cover(300, 300), entries: entriesOf(9000),
    traversal: "radial" as const, aspectRatio: 1, border: 1,
  };
  const compact = encodeImageData(args);
  const shaped = encodeImageData({ ...args, fit: "shape" });
  const ratio = (shaped.width * shaped.height) / (compact.width * compact.height);
  check("a radial shape canvas is about 4/π the area of a compact one",
    Math.abs(ratio - 4 / Math.PI) < 0.05, ratio.toFixed(4));
}

{
  // A payload smaller than the header is sized by the header, not the data, in
  // either fit — the branch that would otherwise hand encodeContainer a canvas
  // whose border ring cannot hold its own header.
  for (const fit of ["compact", "shape"] as FitMode[])
    for (const border of [1, 0.1]) {
      const enc = encodeImageData({
        source: cover(64, 64), entries: entriesOf(1),
        traversal: "radial", fit, border, aspectRatio: 1,
      });
      const { entries: back, opts } = decodeImageData({ source: enc });
      check(`a 1-byte ${fit} payload at border ${border} round-trips`,
        back.length === 1 && back[0].data.length === 1 && back[0].data[0] === payload(1)[0],
        `${enc.width}x${enc.height} B=${opts.borderWidth}`);
      if (fit === "shape")
        check(`a 1-byte shape payload still lands inside the ellipse`,
          payloadExtent(enc).maxR2 <= 1);
    }
}

// ── "shape" is the traversal's own boundary ────────────────────────────────
//
// A caller never names a shape — "shape" reads the traversal's TRAVERSAL_SHAPE
// entry, so there is no mismatched pairing to reject. For every traversal that
// declares no boundary, the natural shape is the rectangle itself and "shape"
// is byte-identical to "compact".

for (const traversal of TRAVERSAL_NAMES.filter((t) => t !== "radial")) {
  const args = {
    source: cover(48, 48), entries: entriesOf(600), traversal, border: 1,
    ...(traversal === "fisher-yates" ? { seed: 7 } : {}),
  };
  const byShape = encodeImageData({ ...args, fit: "shape" });
  const byCompact = encodeImageData({ ...args, fit: "compact" });
  check(`fit: "shape" with ${traversal} is byte-identical to compact`,
    byShape.width === byCompact.width && byShape.height === byCompact.height &&
      sameList(byShape.data, byCompact.data));
}

for (const direction of ["out", "in"] as const) {
  const enc = encodeImageData({
    source: cover(64, 64), entries: entriesOf(2000),
    traversal: "radial", params: { direction }, fit: "shape",
    aspectRatio: 1, border: 1,
  });
  check(`fit: "shape" with radial direction "${direction}" fills the ellipse`,
    payloadExtent(enc).maxR2 <= 1);
}

// ── custom FitFn ─────────────────────────────────────────────────────────────
//
// fit accepts any capacity function, not just the preset names. All spellings
// of the same capacity size identically — resolveFit translates the words to
// functions once, and the sizing math only ever sees the function. What a
// custom shape looks like against a given traversal is the caller's to judge;
// nothing is policed.

for (const border of [1, 0.1]) {
  const args = {
    source: cover(64, 64), entries: entriesOf(2000),
    traversal: "radial" as const, aspectRatio: 1, border,
  };
  const byName = encodeImageData({ ...args, fit: "shape" });
  const byFn = encodeImageData({ ...args, fit: ellipseFit });
  // border 0.1 exercises the fractional-border path, which once measured the
  // named and function spellings against different area estimates.
  check(`fit: ellipseFit matches fit: "shape" at border ${border}`,
    byName.width === byFn.width && byName.height === byFn.height &&
      sameList(byName.data, byFn.data),
    `${byName.width}x${byName.height} vs ${byFn.width}x${byFn.height}`);
}

{
  // The ellipse against a rectangle-filling traversal: nothing stops at that
  // boundary, so the payload just gets a 4/π canvas and fills it corner to
  // corner as far as it reaches — a deliberate look, available on request.
  const args = {
    source: cover(64, 64), entries: entriesOf(2000),
    traversal: "raster" as const, aspectRatio: 1, border: 1,
  };
  const enc = encodeImageData({ ...args, fit: ellipseFit });
  const compact = encodeImageData(args);
  const ratio = (enc.width * enc.height) / (compact.width * compact.height);
  check("fit: ellipseFit with raster oversizes by ~4/π, by request",
    Math.abs(ratio - 4 / Math.PI) < 0.1, ratio.toFixed(4));
  const { entries: back } = decodeImageData({ source: enc });
  check("an ellipse-sized raster encode still round-trips",
    back.length === 1 && sameList(back[0].data, payload(2000)));
}

{
  // A shape the library has never seen: half of whatever the rectangle holds.
  // With raster that is a payload band across the top of an untouched cover.
  const halfFit: FitFn = (W, H) => Math.floor((W * H) / 2);
  const args = {
    source: cover(64, 64), entries: entriesOf(3000),
    traversal: "raster" as const, keymap: "none" as const, aspectRatio: 1, border: 1,
  };
  const enc = encodeImageData({ ...args, fit: halfFit });
  const compact = encodeImageData(args);
  const ratio = (enc.width * enc.height) / (compact.width * compact.height);
  check("a custom FitFn drives canvas size (halfFit ~doubles the area)",
    Math.abs(ratio - 2) < 0.15, ratio.toFixed(4));

  const { entries: back } = decodeImageData({ source: enc });
  check("a custom-FitFn encode still round-trips",
    back.length === 1 && sameList(back[0].data, payload(3000)));
}

// ── descriptor round trips ─────────────────────────────────────────────────

for (const [traversal, params] of [
  ["radial", { direction: "out" }],
  ["radial", { direction: "in" }],
  ["spiral", { rotation: "cw" }],
  ["spiral", { rotation: "ccw" }],
] as Array<[TraversalName, TraversalParams]>) {
  const enc = encodeImageData({
    source: cover(200, 200), entries: entriesOf(3000),
    traversal, params, border: 1, aspectRatio: 1,
  });
  const { entries: back, opts } = decodeImageData({ source: enc });
  const key = params.direction ? "direction" : "rotation";
  const want = params.direction ?? params.rotation;
  // "cw" is the default and is not written, so it comes back undefined —
  // which the traversal reads as "cw".
  const got = (opts.params as Record<string, unknown>)[key] ?? "cw";
  check(`${traversal} ${key}=${want} round-trips`,
    got === want && sameList(back[0].data, payload(3000)), String(got));
}

{
  const legacy = "combine=xor\x01keymap=poles\x01traversal=fisher-yates\x01seed=42\x01";
  const enc = new TextEncoder().encode(legacy);
  const parsed = parseDescriptor(enc);
  check("a pre-radial descriptor still parses",
    parsed.combine === "xor" && parsed.keymap === "poles" &&
      parsed.traversal === "fisher-yates" && parsed.seed === 42 &&
      parsed.direction === undefined && parsed.rotation === undefined,
    JSON.stringify(parsed));
  const hdr = packStgcHeader({
    combine: "xor", keymap: "poles", traversal: "fisher-yates",
    params: { seed: 42 }, interiorByteLength: 99, entryCount: 1,
  });
  check("a descriptor with no direction/rotation is still what we write",
    new TextDecoder().decode(hdr.slice(12, 12 + enc.length)) === legacy,
    JSON.stringify(new TextDecoder().decode(hdr.slice(12, hdr.length - 1))));
}

{
  // descLen is a single byte; a descriptor over 255 must fail rather than wrap.
  let msg: string | null = null;
  try {
    packStgcHeader({
      combine: "xor", keymap: "adjacent", traversal: "raster",
      interiorByteLength: 0, entryCount: 0, ch: "r.xor+".repeat(50),
    });
  } catch (e) {
    msg = (e as Error).message;
  }
  check("an oversized descriptor throws", msg !== null && /descriptor too large/.test(msg ?? ""), String(msg));

  let ok: string | null = null;
  try {
    packStgcHeader({
      combine: "xor", keymap: "adjacent", traversal: "raster",
      interiorByteLength: 0, entryCount: 0, ch: "x".repeat(200),
    });
  } catch (e) {
    ok = (e as Error).message;
  }
  check("a descriptor just under the limit still packs", ok === null, String(ok));
}

console.log("");
if (failures.length) {
  console.error(`${pass} passed, ${failures.length} FAILED`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${pass} passed, 0 failed — radial and the shape fit hold.`);
