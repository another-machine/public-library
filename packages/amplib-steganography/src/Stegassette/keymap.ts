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
 * Snap a target (px, py) to the nearest key pixel if it happens to land on a
 * data pixel. Adjacent fallback is determined by row parity.
 */
function snapToKey(px: number, py: number): [number, number] {
  if (!isDataPixel(px, py)) return [px, py];
  return py % 2 === 0 ? [px - 1, py] : [px + 1, py];
}

export const KEYMAP: Record<KeymapName, KeymapFn> = {
  // one pixel left on even rows, one right on odd rows (always lands on a key pixel)
  adjacent: (dx, dy) => (dy % 2 === 0 ? [dx - 1, dy] : [dx + 1, dy]),

  // diagonally opposite corner (180° rotation), then snap to nearest key pixel
  poles: (dx, dy, IW, IH) =>
    snapToKey(IW - 1 - dx, IH - 1 - dy),

  // horizontally flipped, then snap to nearest key pixel
  "mirror-x": (dx, dy, IW) =>
    snapToKey(IW - 1 - dx, dy),

  // vertically flipped, then snap to nearest key pixel
  "mirror-y": (dx, dy, _IW, IH) =>
    snapToKey(dx, IH - 1 - dy),

  // data position + (kx, ky) wrapped torus-style, snap to nearest key pixel
  offset: (dx, dy, IW, IH, p = {}) => {
    const ox = (((dx + (p.kx ?? 0)) % IW) + IW) % IW;
    const oy = (((dy + (p.ky ?? 0)) % IH) + IH) % IH;
    return snapToKey(ox, oy);
  },

  // 90° clockwise rotation (aspect-normalized), snap to nearest key pixel
  rotate: (dx, dy, IW, IH) => {
    const px = Math.round((1 - (IH > 1 ? dy / (IH - 1) : 0)) * (IW - 1));
    const py = Math.round((IW > 1 ? dx / (IW - 1) : 0) * (IH - 1));
    return snapToKey(px, py);
  },
};
