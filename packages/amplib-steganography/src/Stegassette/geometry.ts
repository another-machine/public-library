import { Img, dataPixelCount } from "./Img";

/** Bilinear scale of an Img to newW × newH. */
export function scaleImg(img: Img, newW: number, newH: number): Img {
  const out = new Img(newW, newH, new Uint8Array(newW * newH * 4));
  const sx = img.width / newW, sy = img.height / newH;
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const qx = x * sx, qy = y * sy;
      const x0 = Math.floor(qx), x1 = Math.min(img.width - 1, x0 + 1);
      const y0 = Math.floor(qy), y1 = Math.min(img.height - 1, y0 + 1);
      const fx = qx - x0, fy = qy - y0;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy,       w11 = fx * fy;
      const [r00, g00, b00] = img.get(x0, y0), [r10, g10, b10] = img.get(x1, y0);
      const [r01, g01, b01] = img.get(x0, y1), [r11, g11, b11] = img.get(x1, y1);
      out.set(
        x, y,
        Math.round(r00 * w00 + r10 * w10 + r01 * w01 + r11 * w11),
        Math.round(g00 * w00 + g10 * w10 + g01 * w01 + g11 * w11),
        Math.round(b00 * w00 + b10 * w10 + b01 * w01 + b11 * w11),
      );
    }
  }
  return out;
}

/** Copy a sub-rectangle of `img` into a new Img. */
export function cropImg(
  img: Img,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): Img {
  const out = new Img(sw, sh, new Uint8Array(sw * sh * 4));
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const [r, g, b] = img.get(sx + x, sy + y);
      out.set(x, y, r, g, b);
    }
  return out;
}

/**
 * Compute the interior dimensions (IW × IH) that will hold `dataPx` data
 * pixels AND result in a full canvas (interior + B-px border) with the given
 * aspect ratio.
 *
 * Solving the full-canvas aspect means a large border does not stretch the
 * cover image. B=0 gives a plain aspect-fit.
 */
export function interiorDims(
  dataPx: number,
  aspect: number,
  B = 0,
  keyless = false
): { IW: number; IH: number } {
  // The interior holds `density × IW × IH` data pixels: half under a keyed
  // encode, where a checkerboard is reserved for key pixels, and all of them
  // when the key is generated from position. This factor is the whole size
  // difference between the two modes.
  const density = keyless ? 1 : 2;
  const capacity = keyless
    ? (W: number, H: number) => W * H
    : dataPixelCount;
  // Solve aspect·h² − 2B(aspect+1)·h + (4B² − density·dataPx) = 0 for full height h = IH+2B
  const qb = -2 * B * (aspect + 1);
  const qc = 4 * B * B - density * dataPx;
  const disc = Math.max(0, qb * qb - 4 * aspect * qc);
  const h = (-qb + Math.sqrt(disc)) / (2 * aspect);
  let IH = Math.max(2, Math.round(h - 2 * B));
  let IW = Math.max(2, Math.round(aspect * (IH + 2 * B) - 2 * B));
  // grow whichever side keeps the full-canvas aspect closest to target
  while (capacity(IW, IH) < dataPx) {
    const dW = Math.abs((IW + 1 + 2 * B) / (IH + 2 * B) - aspect);
    const dH = Math.abs((IW + 2 * B) / (IH + 1 + 2 * B) - aspect);
    if (dW <= dH) IW++;
    else IH++;
  }
  return { IW, IH };
}

/**
 * Resolve a border spec to an integer border width (pixels per side, including
 * the mandatory 1 px header ring).
 *
 *   spec ≥ 1        → 1 + floor(spec)  (legacy integer; backward compatible)
 *   0 < spec < 1    → fraction of the final image width
 */
export function resolveBorderWidth(
  spec: number,
  dataPx: number,
  aspect: number,
  keyless = false
): number {
  const f = Number(spec) || 0;
  if (f > 0 && f < 1) {
    const ff = Math.min(f, 0.45, 0.45 / aspect);
    const fullW = Math.sqrt(
      ((keyless ? 1 : 2) * dataPx) / ((1 - 2 * ff) * (1 / aspect - 2 * ff)),
    );
    return Math.max(1, Math.round(ff * fullW));
  }
  return 1 + Math.max(0, Math.floor(f));
}

/**
 * Cover-crop and scale `img` so the full canvas exactly holds `totalBytes`
 * payload bytes at `B` px of border and the given aspect.
 *
 * @param img          Source image.
 * @param totalBytes   Total interior byte stream length (table + pad + payloads).
 * @param B            Border width in pixels.
 * @param aspectOverride  If provided, overrides the source aspect ratio.
 * @param bytesPerPixel  Channel plan density (default 3 = packed r,g,b).
 * @param minFullWidth  Minimum full canvas width in pixels (e.g. STGC header length).
 */
export function autoScaleImg(
  img: Img,
  totalBytes: number,
  B = 1,
  aspectOverride: number | null = null,
  bytesPerPixel = 3,
  minFullWidth = 1,
  keyless = false
): Img {
  const dataPx = Math.ceil(totalBytes / bytesPerPixel);
  const aspect = aspectOverride != null ? aspectOverride : img.width / img.height;
  let { IW, IH } = interiorDims(dataPx, aspect, B, keyless);
  // Clamp to ensure the full canvas is at least minFullWidth wide (e.g. for the STGC header).
  const minIW = Math.max(2, minFullWidth - 2 * B);
  if (IW < minIW) IW = minIW;
  const newW = IW + 2 * B, newH = IH + 2 * B;

  // shortcut: already the right size with no aspect change
  if (aspectOverride == null && newW === img.width && newH === img.height)
    return img;

  // cover-crop source to target aspect (centered)
  let src: Img = img;
  const srcAspect = img.width / img.height;
  if (Math.abs(srcAspect - aspect) > 0.0005) {
    let cropW: number, cropH: number;
    if (srcAspect > aspect) {
      cropH = img.height;
      cropW = Math.max(1, Math.round(img.height * aspect));
    } else {
      cropW = img.width;
      cropH = Math.max(1, Math.round(img.width / aspect));
    }
    const ox = Math.floor((img.width - cropW) / 2);
    const oy = Math.floor((img.height - cropH) / 2);
    src = cropImg(img, ox, oy, cropW, cropH);
  }

  // scale cover-cropped source to full canvas dimensions
  return scaleImg(src, newW, newH);
}
