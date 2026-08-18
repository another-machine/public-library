import {
  dataPixelCount,
  ellipseDataPixelCount,
  ellipseRadius2,
  isDataPixel,
} from "./Img";
import type { FitFn, TraversalName, TraversalParams } from "./types";

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

/**
 * Inward spiral from the top-left corner.
 *
 * "cw" is the original spiral and the default — right along the top row, then
 * down, left, up. "ccw" mirrors the step order, so it walks down the left
 * column first. Only the non-default lands in the descriptor, which keeps a
 * plain spiral encode byte-identical to everything encoded before rotation
 * existed.
 */
function spiralPath(
  W: number,
  H: number,
  filter: FilterFn = isDataPixel,
  rotation: "cw" | "ccw" = "cw"
): Uint32Array {
  const seen = new Uint8Array(W * H);
  const out = new Uint32Array(countFiltered(W, H, filter));
  let n = 0;
  const ddx = rotation === "ccw" ? [0, 1, 0, -1] : [1, 0, -1, 0];
  const ddy = rotation === "ccw" ? [1, 0, -1, 0] : [0, 1, 0, -1];
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

/**
 * Aspect-normalized radial traversal.
 *
 * Sorted by `ellipseRadius2`, so distance is measured in half-widths and
 * half-heights rather than pixels: every prefix of the path is the ellipse
 * inscribed in the canvas at that radius — a circle when the canvas is square,
 * an oval when it is not. That is the whole difference from `center-out`, whose
 * pixel distance draws a circle on a rectangle and so reaches the short edges
 * long before the long ones.
 *
 * `direction: "in"` reverses **only the pixels inside the inscribed ellipse**,
 * and leaves the corners where they were, at the tail. Reversing the whole path
 * instead would start the payload in the corners, and a `fit: "shape"` canvas
 * — sized so the payload is exactly that ellipse — would come out as a frame
 * with an elliptical hole rather than the oval it was sized for. The footprint
 * is the direction's to keep; only the order through it is the direction's to
 * choose. Because the sort is by radius, the ellipse is a prefix of the sorted
 * array, so this is one reverse of a slice.
 */
function radialPath(
  W: number,
  H: number,
  filter: FilterFn = isDataPixel,
  direction: "out" | "in" = "out"
): Uint32Array {
  const arr = Array.from(rasterPath(W, H, filter));
  const r2 = (v: number) => ellipseRadius2(v % W, (v / W) | 0, W, H);
  arr.sort((p, q) => {
    const dp = r2(p), dq = r2(q);
    return dp < dq ? -1 : dp > dq ? 1 : p - q;
  });
  if (direction === "in") {
    let k = 0;
    while (k < arr.length && r2(arr[k]) <= 1) k++;
    for (let i = 0, j = k - 1; i < j; i++, j--) {
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
  }
  return Uint32Array.from(arr);
}

/**
 * The radial traversal's natural boundary: how many data pixels the inscribed
 * ellipse holds. Its prefixes stop exactly there in either `direction`, which
 * is what makes it radial's TRAVERSAL_SHAPE entry. Exported for callers
 * composing their own FitFn on top of it.
 */
export const ellipseFit: FitFn = (W, H, keyless) =>
  ellipseDataPixelCount(W, H, keyless);

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
  // Appended, never inserted: the descriptor stores the name, so order is
  // cosmetic on disk — but test-parity pins this exact order, and anything
  // that ever stores an index into this list depends on it holding.
  "radial",
];

/**
 * The natural fill boundary each traversal declares, if it has one that is
 * not the plain rectangle. `fit: "shape"` sizes the canvas to the entry here;
 * a traversal with no entry fills its rectangle, so "shape" for it means the
 * same thing as "compact". This is what makes shape/traversal mismatches
 * unrepresentable: a caller never names a shape, only asks for the
 * traversal's own.
 *
 * Only prefix boundaries belong here: an entry must count exactly the pixels
 * the traversal visits first, so a payload sized to it ends at that boundary.
 * (`center-out`'s prefixes are true circles and could be declared, but it is
 * kept only so old decodes still work — not as something to encode with.)
 */
export const TRAVERSAL_SHAPE: Partial<Record<TraversalName, FitFn>> = {
  radial: ellipseFit,
};

/**
 * Traversals kept only so their old encodes still decode — not offered as an
 * encode-time choice. Today just `center-out`, superseded by `radial`: see
 * TraversalName's doc for why. A caller building an encode-time menu from
 * TRAVERSAL_NAMES should filter these out; TRAVERSAL_NAMES itself keeps every
 * name, legacy included, because decode still has to recognize them all.
 */
export const TRAVERSAL_LEGACY: Partial<Record<TraversalName, true>> = {
  "center-out": true,
};

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
      return spiralPath(W, H, f, params.rotation === "ccw" ? "ccw" : "cw");
    case "angle":
      return anglePath(W, H, f, params.a ?? 1, params.b ?? 1);
    case "fisher-yates":
      return fisherYatesPath(W, H, f, params.seed);
    case "center-out":
      return centerOutPath(W, H, f);
    case "radial":
      return radialPath(W, H, f, params.direction === "in" ? "in" : "out");
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
