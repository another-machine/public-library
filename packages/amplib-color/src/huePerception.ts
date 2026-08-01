/**
 * A bijective mapping between display hue and perceptual hue.
 *
 * HSV hue is what a camera reports and what people use to name a color on a
 * screen. Oklch hue — atan2(b, a) of oklab — is the angle human vision reads
 * as evenly spaced. Both run 0–360°, but the mapping between them is severely
 * non-linear, and not in the direction most descriptions of it suggest.
 * Measured as perceptual degrees per display degree:
 *
 *   red 0.21×   orange 1.76×   yellow 1.29×   green 0.05×
 *   cyan 2.23×  blue 0.14×     deep blue 0.01×  magenta 0.94×
 *
 * Green and deep blue barely move at all — a wide sweep of display hue is
 * almost one perceptual color — while cyan and orange stretch. The spread
 * between the extremes is over two hundredfold.
 *
 * That is the whole reason this file exists. Divide a hue wheel into equal
 * slices in HSV and the slices do not look equal; divide it in oklch and they
 * do.
 */

/** sRGB gamma decode. */
function linearize(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** HSV(hue, 1, 1) → linear sRGB. */
function hsvToLinearRgb(hue: number): [number, number, number] {
  const x = 1 - Math.abs(((hue / 60) % 2) - 1);
  let r: number, g: number, b: number;
  if (hue < 60) {
    r = 1;
    g = x;
    b = 0;
  } else if (hue < 120) {
    r = x;
    g = 1;
    b = 0;
  } else if (hue < 180) {
    r = 0;
    g = 1;
    b = x;
  } else if (hue < 240) {
    r = 0;
    g = x;
    b = 1;
  } else if (hue < 300) {
    r = x;
    g = 0;
    b = 1;
  } else {
    r = 1;
    g = 0;
    b = x;
  }
  return [linearize(r), linearize(g), linearize(b)];
}

/**
 * Linear sRGB → oklch hue in degrees.
 * Matrix constants from Björn Ottosson's reference implementation (2020).
 */
function linearRgbToOklchHue(r: number, g: number, b: number): number {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const bAxis =
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  let hue = Math.atan2(bAxis, a) * (180 / Math.PI);
  if (hue < 0) hue += 360;
  return hue;
}

/** Forward table: display hue → perceptual hue, one entry per degree. */
const forward = new Float64Array(360);
for (let hue = 0; hue < 360; hue++) {
  const [r, g, b] = hsvToLinearRgb(hue);
  forward[hue] = linearRgbToOklchHue(r, g, b);
}

// Raw oklch hue is not quite monotonic in display hue: around display 231–240°
// it steps backwards by a fraction of a degree. Left alone that makes the
// mapping non-invertible right there, so every backward run is replaced with a
// straight interpolation across it.
for (let i = 0; i < 360; i++) {
  let delta = forward[(i + 1) % 360] - forward[i];
  if (delta < 0) delta += 360;
  if (delta > 180) {
    const start = forward[i];
    let j = i + 1;
    while (j < i + 360) {
      let ahead = forward[j % 360] - start;
      if (ahead < 0) ahead += 360;
      if (ahead > 0 && ahead <= 180) break;
      j++;
    }
    let span = forward[j % 360] - start;
    if (span < 0) span += 360;
    const steps = j - i;
    for (let k = 1; k < steps; k++) {
      forward[(i + k) % 360] = (start + (span * k) / steps) % 360;
    }
    i = j - 1;
  }
}

/**
 * Inverse table: perceptual hue → display hue.
 *
 * 7200 entries rather than 360 because the deep-blue zone squeezes roughly 16
 * display degrees into half a perceptual degree. At one entry per degree that
 * whole region would collapse to a single bin; at 0.05° per bin the worst
 * round-trip error is about 0.8°.
 */
const INVERSE_RESOLUTION = 7200;
const inverse = new Float64Array(INVERSE_RESOLUTION);
for (let index = 0; index < INVERSE_RESOLUTION; index++) {
  const degrees = index * (360 / INVERSE_RESOLUTION);
  let found = false;
  for (let hue = 0; hue < 360; hue++) {
    const start = forward[hue];
    const end = forward[(hue + 1) % 360];
    let delta = end - start;
    if (delta < 0) delta += 360;
    if (delta < 1e-9 || delta > 180) continue;
    let offset = degrees - start;
    if (offset < 0) offset += 360;
    if (offset < delta) {
      inverse[index] = hue + offset / delta;
      found = true;
      break;
    }
  }
  if (!found) {
    let best = 0;
    let bestDistance = 360;
    for (let hue = 0; hue < 360; hue++) {
      let distance = Math.abs(forward[hue] - degrees);
      if (distance > 180) distance = 360 - distance;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = hue;
      }
    }
    inverse[index] = best;
  }
}

/** Interpolate between two angles along the shorter arc. */
function lerpAngle(from: number, to: number, t: number): number {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return (((from + t * delta) % 360) + 360) % 360;
}

/** Display (HSV) hue → perceptual (oklch) hue. */
export function toPerceptual(hue: number): number {
  const wrapped = ((hue % 360) + 360) % 360;
  const index = Math.floor(wrapped) % 360;
  return lerpAngle(forward[index], forward[(index + 1) % 360], wrapped - index);
}

/** Perceptual (oklch) hue → display (HSV) hue. */
export function fromPerceptual(hue: number): number {
  const wrapped = ((hue % 360) + 360) % 360;
  const scaled = wrapped * (INVERSE_RESOLUTION / 360);
  const index = Math.floor(scaled) % INVERSE_RESOLUTION;
  return lerpAngle(
    inverse[index],
    inverse[(index + 1) % INVERSE_RESOLUTION],
    scaled - index
  );
}

/**
 * Worst round-trip error in degrees, sampled every `step` degrees.
 *
 * The two tables are built by different methods and only approximately invert
 * each other, so this is the number that says whether they still agree. It is
 * exported rather than run on import: a library that asserts at load time
 * costs every consumer the check whether or not they care, and cannot fail the
 * build when it matters. See `npm test`.
 */
export function worstRoundTripError(step = 0.25): number {
  let worst = 0;
  for (let hue = 0; hue < 360; hue += step) {
    const returned = fromPerceptual(toPerceptual(hue));
    let error = Math.abs(returned - hue);
    if (error > 180) error = 360 - error;
    if (error > worst) worst = error;
  }
  return worst;
}
