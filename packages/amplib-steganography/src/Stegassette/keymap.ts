import { isDataPixel } from "./Img";
import type { KeymapName, TraversalParams } from "./types";

/**
 * A keymap function maps interior-local data-pixel coordinates (dx, dy) to the
 * interior-local coordinates of its paired key pixel.
 * IW/IH are the interior width/height; params carries optional kx/ky offsets.
 */
type KeymapFn = (
  dx: number,
  dy: number,
  IW: number,
  IH: number,
  params?: TraversalParams
) => [number, number];

export const KEYMAP_NAMES: readonly KeymapName[] = [
  "adjacent",
  "poles",
  "mirror-x",
  "mirror-y",
  "offset",
  "rotate",
];

/**
 * Snap a target (px, py) to the nearest IN-INTERIOR key pixel. Keys must never
 * land on the border ring: the STGC header rewrites ring alpha, and canvases
 * premultiply-round the RGB of any pixel with alpha < 255, which silently
 * corrupts whatever bytes were keyed against it.
 */
function snapToKey(px: number, py: number, IW: number, IH: number): [number, number] {
  if (!isDataPixel(px, py)) return [px, py];
  const inRow = py % 2 === 0 ? px - 1 : px + 1;
  if (inRow >= 0 && inRow < IW) return [inRow, py];
  // Orphan: this column has no in-row partner — the last column of every odd
  // row on an odd-width interior, or a 1-wide interior. Step a row: the
  // checkerboard parity flips, so the same column is a key pixel there, and it
  // is one no other data pixel claims (on the neighbouring row the keys run
  // 0, 2, … IW-3). Reflecting back in-row instead handed two data pixels the
  // same key, which a key-modifying combine cannot survive — the second write
  // destroys the bits the first stashed, so that byte is unrecoverable.
  return [px, py > 0 ? py - 1 : Math.min(py + 1, IH - 1)];
}

export const KEYMAP: Record<KeymapName, KeymapFn> = {
  // one pixel left on even rows, one right on odd rows, reflected back inside
  // the interior at the edges (always lands on an in-bounds key pixel)
  adjacent: (dx, dy, IW, IH) => snapToKey(dx, dy, IW, IH),

  // diagonally opposite corner (180° rotation), then snap to nearest key pixel
  poles: (dx, dy, IW, IH) =>
    snapToKey(IW - 1 - dx, IH - 1 - dy, IW, IH),

  // horizontally flipped, then snap to nearest key pixel
  "mirror-x": (dx, dy, IW, IH) =>
    snapToKey(IW - 1 - dx, dy, IW, IH),

  // vertically flipped, then snap to nearest key pixel
  "mirror-y": (dx, dy, IW, IH) =>
    snapToKey(dx, IH - 1 - dy, IW, IH),

  // data position + (kx, ky) wrapped torus-style, snap to nearest key pixel
  offset: (dx, dy, IW, IH, p = {}) => {
    const ox = (((dx + (p.kx ?? 0)) % IW) + IW) % IW;
    const oy = (((dy + (p.ky ?? 0)) % IH) + IH) % IH;
    return snapToKey(ox, oy, IW, IH);
  },

  // 90° clockwise rotation (aspect-normalized), snap to nearest key pixel
  rotate: (dx, dy, IW, IH) => {
    const px = Math.round((1 - (IH > 1 ? dy / (IH - 1) : 0)) * (IW - 1));
    const py = Math.round((IW > 1 ? dx / (IW - 1) : 0) * (IH - 1));
    return snapToKey(px, py, IW, IH);
  },
};
