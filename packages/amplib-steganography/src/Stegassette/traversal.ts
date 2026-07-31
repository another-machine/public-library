import { dataPixelCount, isDataPixel } from "./Img";
import type { TraversalName, TraversalParams } from "./types";

type FilterFn = (x: number, y: number) => boolean;

/** Every interior pixel is a data pixel — the keyless case. */
const allPixels: FilterFn = () => true;

/** Count pixels matching `filter`. O(1) for the two universal filters. */
function countFiltered(W: number, H: number, filter: FilterFn): number {
  if (filter === isDataPixel) return dataPixelCount(W, H);
  if (filter === allPixels) return W * H;
  let n = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (filter(x, y)) n++;
  return n;
}

function rasterPath(W: number, H: number, filter: FilterFn = isDataPixel): Uint32Array {
  const out = new Uint32Array(countFiltered(W, H, filter));
  let n = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (filter(x, y)) out[n++] = y * W + x;
  return out;
}

function boustrophedonPath(
  W: number,
  H: number,
  filter: FilterFn = isDataPixel
): Uint32Array {
  const out = new Uint32Array(countFiltered(W, H, filter));
  let n = 0;
  for (let y = 0; y < H; y++) {
    if (y % 2 === 0) {
      for (let x = 0; x < W; x++) if (filter(x, y)) out[n++] = y * W + x;
    } else {
      for (let x = W - 1; x >= 0; x--) if (filter(x, y)) out[n++] = y * W + x;
    }
  }
  return out;
}

function spiralPath(
  W: number,
  H: number,
  filter: FilterFn = isDataPixel
): Uint32Array {
  const seen = new Uint8Array(W * H);
  const out = new Uint32Array(countFiltered(W, H, filter));
  let n = 0;
  const ddx = [1, 0, -1, 0];
  const ddy = [0, 1, 0, -1];
  let x = 0, y = 0, dir = 0;
  for (let i = 0; i < W * H; i++) {
    if (filter(x, y)) out[n++] = y * W + x;
    seen[y * W + x] = 1;
    let nx = x + ddx[dir], ny = y + ddy[dir];
    if (nx < 0 || nx >= W || ny < 0 || ny >= H || seen[ny * W + nx]) {
      dir = (dir + 1) % 4;
      nx = x + ddx[dir];
      ny = y + ddy[dir];
    }
    x = nx;
    y = ny;
  }
  return out;
}

/**
 * Sort data pixels by a·x + b·y; tie-break by raster index so (0,0)
 * degenerates to raster order.
 */
function anglePath(
  W: number,
  H: number,
  filter: FilterFn = isDataPixel,
  a = 1,
  b = 1
): Uint32Array {
  const arr = Array.from(rasterPath(W, H, filter));
  arr.sort((p, q) => {
    const dk =
      a * (p % W) + b * ((p / W) | 0) - (a * (q % W) + b * ((q / W) | 0));
    return dk || p - q;
  });
  return Uint32Array.from(arr);
}

/**
 * Seeded LCG Fisher-Yates shuffle.
 * If seed is omitted, a deterministic default is derived from image dimensions.
 */
function fisherYatesPath(
  W: number,
  H: number,
  filter: FilterFn = isDataPixel,
  seed?: number
): Uint32Array {
  const p = rasterPath(W, H, filter);
  let s = seed != null ? seed >>> 0 : (W * 1664525 + H * 1013904223) >>> 0;
  for (let i = p.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  return p;
}

function centerOutPath(
  W: number,
  H: number,
  filter: FilterFn = isDataPixel
): Uint32Array {
  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  const arr = Array.from(rasterPath(W, H, filter));
  arr.sort((a, b) => {
    const ax = a % W, ay = (a / W) | 0;
    const bx = b % W, by = (b / W) | 0;
    return (
      (ax - cx) ** 2 + (ay - cy) ** 2 - ((bx - cx) ** 2 + (by - cy) ** 2) ||
      a - b
    );
  });
  return Uint32Array.from(arr);
}

function hilbertPath(
  W: number,
  H: number,
  filter: FilterFn = isDataPixel
): Uint32Array {
  const size = 1 << Math.ceil(Math.log2(Math.max(W, H, 2)));
  const out = new Uint32Array(countFiltered(W, H, filter));
  let n = 0;
  for (let t = 0; t < size * size; t++) {
    let x = 0, y = 0, tt = t;
    for (let s = 1; s < size; s <<= 1) {
      const rx = (tt >> 1) & 1, ry = (tt ^ rx) & 1;
      if (ry === 0) {
        if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
        const tmp = x; x = y; y = tmp;
      }
      x += s * rx;
      y += s * ry;
      tt >>= 2;
    }
    if (x < W && y < H && filter(x, y)) out[n++] = y * W + x;
  }
  return out;
}

/**
 * Clockwise angular sweep from 12 o'clock, radius ascending within a ray.
 * Integer-only comparator (no trig) so Node and every browser sort identically.
 */
function polarPath(
  W: number,
  H: number,
  filter: FilterFn = isDataPixel
): Uint32Array {
  const arr = Array.from(rasterPath(W, H, filter));
  // doubled coords centered on the image
  const RX = (v: number) => 2 * (v % W) - (W - 1);
  const RY = (v: number) => 2 * ((v / W) | 0) - (H - 1);
  // half 0 = [12:00, 6:00); half 1 = [6:00, 12:00)
  const half = (rx: number, ry: number) =>
    rx > 0 || (rx === 0 && ry <= 0) ? 0 : 1;
  arr.sort((p, q) => {
    const ax = RX(p), ay = RY(p), bx = RX(q), by = RY(q);
    const ha = half(ax, ay), hb = half(bx, by);
    if (ha !== hb) return ha - hb;
    const cross = ax * by - ay * bx;
    if (cross !== 0) return cross > 0 ? -1 : 1;
    return ax * ax + ay * ay - (bx * bx + by * by) || p - q;
  });
  return Uint32Array.from(arr);
}

/**
 * Visit pixels in ordered-dither (Bayer matrix) order — every prefix of the
 * path is a uniform sample of the plane, so the image "develops" evenly.
 */
function bayerPath(
  W: number,
  H: number,
  filter: FilterFn = isDataPixel
): Uint32Array {
  const bits = Math.max(1, Math.ceil(Math.log2(Math.max(W, H, 2))));
  const arr = Array.from(rasterPath(W, H, filter));
  const bv = (x: number, y: number): number => {
    let v = 0;
    for (let i = 0; i < bits; i++) {
      const xb = (x >> i) & 1, yb = (y >> i) & 1;
      v = v * 4 + (((xb ^ yb) << 1) | yb);
    }
    return v;
  };
  arr.sort(
    (p, q) => bv(p % W, (p / W) | 0) - bv(q % W, (q / W) | 0) || p - q
  );
  return Uint32Array.from(arr);
}

export const TRAVERSAL_NAMES: readonly TraversalName[] = [
  "raster",
  "boustrophedon",
  "spiral",
  "angle",
  "fisher-yates",
  "center-out",
  "hilbert",
  "polar",
  "bayer",
];

/**
 * Returns a Uint32Array of interior-local linear indices (v = y*W + x),
 * filtered to data pixels.
 *
 * Memory-efficient: 4 bytes/pixel vs ~50-90 bytes for [x,y] V8 tuples.
 * Recover coordinates with: lx = v % W, ly = (v / W) | 0
 */
export function getPathIndices(
  W: number,
  H: number,
  traversal: TraversalName,
  params: TraversalParams = {},
  keyless = false
): Uint32Array {
  // Keyless keymaps reserve no key pixels, so the path covers the whole
  // interior rather than the checkerboard half of it. Every path builder
  // already takes this filter; only the default differs.
  const f: FilterFn = keyless ? allPixels : isDataPixel;
  switch (traversal) {
    case "raster":
      return rasterPath(W, H, f);
    case "boustrophedon":
      return boustrophedonPath(W, H, f);
    case "spiral":
      return spiralPath(W, H, f);
    case "angle":
      return anglePath(W, H, f, params.a ?? 1, params.b ?? 1);
    case "fisher-yates":
      return fisherYatesPath(W, H, f, params.seed);
    case "center-out":
      return centerOutPath(W, H, f);
    case "hilbert":
      return hilbertPath(W, H, f);
    case "polar":
      return polarPath(W, H, f);
    case "bayer":
      return bayerPath(W, H, f);
    default:
      return rasterPath(W, H, f);
  }
}

/**
 * Expands getPathIndices to [x, y] tuples.
 * Allocates ~16× the memory of the index array — only use for small images / tests.
 */
export function getPath(
  W: number,
  H: number,
  traversal: TraversalName,
  params: TraversalParams = {}
): Array<[number, number]> {
  const idx = getPathIndices(W, H, traversal, params);
  const out: Array<[number, number]> = new Array(idx.length);
  for (let i = 0; i < idx.length; i++)
    out[i] = [idx[i] % W, (idx[i] / W) | 0];
  return out;
}
