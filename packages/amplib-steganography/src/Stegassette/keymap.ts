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
  // Keyless: there is no key pixel at all.
  "none",
];

/**
 * Keymaps that generate their key instead of locating it.
 *
 * These change the shape of the encode, not just where the key is read from:
 * no pixel is reserved as a key, so the traversal visits the whole interior and
 * the image needs half the area. Three consequences, all enforced elsewhere:
 * combines with a KEY_MOD are rejected (they need a key pixel to stash bits
 * into), reconstructCover has nothing to recover, and the reveal develops
 * against a flat fill rather than the cover.
 */
export const KEYLESS_KEYMAPS: ReadonlySet<KeymapName> = new Set(["none"]);

/** True when this keymap generates its key from position. */
export function isKeylessKeymap(name: KeymapName | undefined): boolean {
  return name != null && KEYLESS_KEYMAPS.has(name);
}

/**
 * Key fields for keyless keymaps: (x, y, channel) → key byte.
 *
 * A field has to be a pure function of position and the descriptor's own
 * params, because decode recomputes it from nothing but the header — that is
 * what lets the key cost zero pixels.
 *
 * There is one, and it is the constant 0: the identity element for xor,
 * additive and bitshift, so the pixel holds the payload byte verbatim.
 *
 * A position-varying field (an ordered dither, a gradient, a seeded hash) is a
 * valid member of this table and was prototyped — but it earns nothing. The
 * payload's own entropy dominates whatever it is combined with, so the result
 * is noise either way, and the thing that actually keeps a picture is leaving a
 * channel out of the plan (see EncodeOptions.channels). Adding one later is a
 * new name in KEYMAP_NAMES and an entry here; nothing else has to move.
 */
export type KeyFieldFn = (
  x: number,
  y: number,
  channel: number,
  IW: number,
  IH: number,
  params?: TraversalParams
) => number;

export const KEY_FIELD: Record<"none", KeyFieldFn> = {
  none: () => 0,
};

/** The key field for a keyless keymap. Throws if it is not one. */
export function resolveKeyField(name: KeymapName): KeyFieldFn {
  const f = KEY_FIELD[name as "none"];
  if (!f) throw new Error(`keymap "${name}" does not generate a key field`);
  return f;
}

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

/**
 * Validate and default the `keymap` option at a PUBLIC boundary.
 *
 * Catches one specific migration hazard: the lab's `steg-core.js` names this
 * option `keyMap`, this package names it `keymap`. That is the only naming
 * divergence in the whole option surface, so a call site ported from the lab
 * that keeps `keyMap` falls through to the `"adjacent"` default and silently
 * encodes with the wrong keymap — self-consistent output, correctly labelled
 * in the header, and quietly not what was asked for. Fail loudly instead.
 *
 * Must be called where caller-supplied options first arrive (encodeContainer,
 * encodeImageData). By the time options reach writeInterior/readInterior they
 * have been normalized and the misspelling is already lost.
 */
export function resolveKeymapName(opts: { keymap?: KeymapName }): KeymapName {
  const loose = opts as Record<string, unknown>;
  if (loose.keyMap !== undefined && loose.keymap === undefined) {
    throw new Error(
      'Stegassette options use `keymap` (lowercase "m"), not `keyMap`. ' +
        "The lab's steg-core.js spells it `keyMap`; passing that here would " +
        'silently fall back to "adjacent".'
    );
  }
  const name = (opts.keymap || "adjacent") as KeymapName;
  if (!KEYMAP[name as LocatingKeymapName] && !isKeylessKeymap(name))
    throw new Error(`unknown keymap: ${name}`);
  return name;
}

/**
 * Look up the pixel-locating keymap function for already-normalized options.
 *
 * Throws for keyless keymaps rather than returning a fallback: there is no key
 * pixel to locate, and silently pairing against "adjacent" would encode against
 * a key the decoder never reads. Callers branch on isKeylessKeymap first.
 */
export function resolveKeymap(opts: {
  keymap?: KeymapName;
  params?: TraversalParams;
}): KeymapFn {
  const name = resolveKeymapName(opts);
  if (isKeylessKeymap(name))
    throw new Error(
      `keymap "${name}" generates its key from position and has no key pixel; ` +
        `use resolveKeyField(name) instead`
    );
  return KEYMAP[name as LocatingKeymapName];
}

/**
 * Keymaps that locate a key pixel. Deliberately narrower than KeymapName, so
 * indexing KEYMAP with a raw KeymapName is a compile error rather than an
 * undefined at runtime — a keyless name reaching this table would pair every
 * byte against a key the decoder never reads.
 */
export type LocatingKeymapName = Exclude<KeymapName, "none">;

export const KEYMAP: Record<LocatingKeymapName, KeymapFn> = {
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
