import type { StegaImageData } from "./types";

/**
 * RGBA pixel buffer with typed, clamped get/set.
 * Implements StegaImageData so it can be returned as a neutral result.
 * `set` always forces alpha = 255 on written pixels (interior pixels per spec).
 * Use `setAlpha` for border pixels that carry header bytes.
 */
export class Img implements StegaImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(
    width: number,
    height: number,
    data: Uint8Array | Uint8ClampedArray | ArrayBuffer
  ) {
    this.width = width;
    this.height = height;
    this.data =
      data instanceof Uint8Array
        ? data
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data); // Uint8ClampedArray, Buffer, etc.
  }

  /** Returns [r, g, b] for pixel (x, y), clamped to image bounds. */
  get(x: number, y: number): [number, number, number] {
    x = Math.max(0, Math.min(this.width - 1, x | 0));
    y = Math.max(0, Math.min(this.height - 1, y | 0));
    const o = (y * this.width + x) * 4;
    return [this.data[o], this.data[o + 1], this.data[o + 2]];
  }

  /** Writes [r, g, b] to pixel (x, y) and forces alpha = 255. */
  set(x: number, y: number, r: number, g: number, b: number): void {
    const o = (y * this.width + x) * 4;
    this.data[o] = r;
    this.data[o + 1] = g;
    this.data[o + 2] = b;
    this.data[o + 3] = 255;
  }

  /** Returns the alpha of pixel (x, y), clamped to image bounds. */
  getAlpha(x: number, y: number): number {
    x = Math.max(0, Math.min(this.width - 1, x | 0));
    y = Math.max(0, Math.min(this.height - 1, y | 0));
    return this.data[(y * this.width + x) * 4 + 3];
  }

  /** Writes alpha to pixel (x, y). */
  setAlpha(x: number, y: number, a: number): void {
    this.data[(y * this.width + x) * 4 + 3] = a & 0xff;
  }
}

/**
 * Interior pixels are split by a checkerboard:
 *   data pixel: y%2==0 → x%2==1 ; y%2==1 → x%2==0
 *   key pixel:  all others
 * Coordinates are interior-local (0-based from the top-left interior corner).
 */
export function isDataPixel(x: number, y: number): boolean {
  return y % 2 === 0 ? x % 2 === 1 : x % 2 === 0;
}

/** Returns true when (x, y) is within the B-pixel border frame. */
export function isBorderPixel(
  x: number,
  y: number,
  W: number,
  H: number,
  B: number
): boolean {
  return x < B || x >= W - B || y < B || y >= H - B;
}

/**
 * Returns all border pixel coordinates in raster order (row by row):
 *   top row, then left/right columns for each interior row, then bottom row.
 */
export function getBorderPixels(
  W: number,
  H: number,
  B: number
): Array<[number, number]> {
  const px: Array<[number, number]> = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (isBorderPixel(x, y, W, H, B)) px.push([x, y]);
  return px;
}

/**
 * Number of data pixels (checkerboard) in an IW×IH interior.
 * Even rows (y even) hold floor(W/2) data pixels (x odd); odd rows hold
 * ceil(W/2) (x even). O(1); used to allocate exact Uint32Array paths — an
 * over-count leaves phantom (0,0) entries at the tail of the path, which
 * write payload onto a key pixel at exact-capacity fills.
 */
export function dataPixelCount(W: number, H: number): number {
  return (
    Math.floor(W / 2) * Math.ceil(H / 2) + Math.ceil(W / 2) * Math.floor(H / 2)
  );
}

/** Number of border pixels in a W×H image with border width B. */
export function borderPixelCount(W: number, H: number, B: number): number {
  return W * H - (W - 2 * B) * (H - 2 * B);
}
