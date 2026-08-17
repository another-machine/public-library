/**
 * The fiducial border — the header, engraved (Stegaprint.md §6.1).
 *
 * Header cells are full-contrast 8×8 blocks, black or white. A quantizer that
 * destroyed them would have destroyed the picture too, which is the entire
 * argument for putting the one structure that cannot degrade here rather than
 * embedding it in the payload substrate and defending it with redundancy.
 *
 * Four corner marks give the registration needed to undo a rescale. Phase 1
 * draws them and verifies them at native resolution; the affine fit that
 * consumes them is phase 3.
 */

import { N } from "./dct";
import { HEADER_SIZE } from "./header";
import { majority, repeat } from "./ecc";
import { fromBits, toBits } from "./bits";
import type { StegaImageData } from "../Stegassette/types";

/** Corner marks occupy CORNER×CORNER blocks at each corner. */
export const CORNER = 3;
/** Header bits are written this many times around the ring and majority-voted. */
export const HEADER_REPEAT = 3;

const DARK = 16;
const LIGHT = 239;
/** Anything on the wrong side of this reads as the other symbol. */
const MID = (DARK + LIGHT) / 2;

/**
 * Corner pattern: a filled ring with a hollow centre, per block.
 * Distinct under rotation of the whole image only by its position, which is
 * all phase 3 needs — the four marks are identified by which corner they are.
 */
function cornerCell(i: number, j: number): boolean {
  const edge = i === 0 || j === 0 || i === CORNER - 1 || j === CORNER - 1;
  return edge;
}

/** Is block (bx, by) inside the border ring? */
export function isBorderBlock(
  bx: number,
  by: number,
  BW: number,
  BH: number,
  border: number
): boolean {
  return bx < border || by < border || bx >= BW - border || by >= BH - border;
}

/** Is block (bx, by) part of a corner mark? */
export function isCornerBlock(bx: number, by: number, BW: number, BH: number): boolean {
  const left = bx < CORNER, right = bx >= BW - CORNER;
  const top = by < CORNER, bottom = by >= BH - CORNER;
  return (left || right) && (top || bottom);
}

/**
 * Border ring blocks in raster order, excluding corner marks — the cells the
 * header rides. Raster order makes the sequence identical for every border
 * depth, so a decoder that has not yet read the header can still find byte 0.
 */
export function headerCells(
  BW: number,
  BH: number,
  border: number
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let by = 0; by < BH; by++)
    for (let bx = 0; bx < BW; bx++)
      if (isBorderBlock(bx, by, BW, BH, border) && !isCornerBlock(bx, by, BW, BH))
        out.push([bx, by]);
  return out;
}

/**
 * Smallest `BW + BH` whose ring at the *thinnest* border still holds the header.
 *
 * The header is a fixed ~960 cells, so a small canvas can only carry it by
 * thickening the ring — and the arithmetic that minimizes total blocks picks
 * exactly that, which is how a short message ended up as a 360×264 image with a
 * 9-block border eating more than half the picture.
 *
 * That is the efficient answer and the wrong one. §6.1 makes the border a design
 * element — a frame the image wears — and a frame occupying 40% of the canvas is
 * not a frame, it is the picture. So sizing grows the canvas to keep the border
 * at CORNER rather than growing the border to spare the canvas.
 *
 * Ring cells at depth b = 2b(BW + BH) − 4b² − 4·CORNER², so the constraint is
 * linear in the semi-perimeter and independent of aspect.
 */
export function minSemiPerimeter(): number {
  const b = CORNER;
  const need = HEADER_SIZE * 8 * HEADER_REPEAT + 4 * CORNER * CORNER + 4 * b * b;
  return Math.ceil(need / (2 * b));
}

/**
 * Smallest border depth whose ring holds the repeated header.
 *
 * Never less than CORNER. The corner marks are CORNER×CORNER blocks anchored at
 * the image corners, so a shallower ring would leave part of each mark sitting
 * on an interior block — and `headerCells` excludes corner blocks from the
 * header while the interior traversal happily hands them payload, so the mark
 * would be painted over live data. That failure is invisible until a canvas is
 * small enough to select the shallow border, and then it costs a handful of
 * bytes on an otherwise perfect lossless round trip.
 */
export function borderForHeader(BW: number, BH: number): number {
  const need = HEADER_SIZE * 8 * HEADER_REPEAT;
  for (let b = CORNER; b <= Math.min(BW, BH) >> 1; b++)
    if (headerCells(BW, BH, b).length >= need) return b;
  throw new Error(
    `image too small for a STGP fiducial border: need ${need} cells, ` +
      `${BW}×${BH} blocks cannot provide them`
  );
}

// ---- painting --------------------------------------------------

function fillBlock(img: StegaImageData, bx: number, by: number, v: number): void {
  const ox = bx * N, oy = by * N;
  for (let y = 0; y < N; y++) {
    let o = ((oy + y) * img.width + ox) * 4;
    for (let x = 0; x < N; x++) {
      img.data[o] = v;
      img.data[o + 1] = v;
      img.data[o + 2] = v;
      img.data[o + 3] = 255;
      o += 4;
    }
  }
}

/** Mean luma of a block — what a cell reads back as after any smoothing. */
function blockMean(img: StegaImageData, bx: number, by: number): number {
  const ox = bx * N, oy = by * N;
  let s = 0;
  for (let y = 0; y < N; y++) {
    let o = ((oy + y) * img.width + ox) * 4;
    for (let x = 0; x < N; x++) {
      s += 0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2];
      o += 4;
    }
  }
  return s / (N * N);
}

/** Draw the four corner marks. */
export function drawCorners(img: StegaImageData, BW: number, BH: number): void {
  const corners: Array<[number, number]> = [
    [0, 0], [BW - CORNER, 0], [0, BH - CORNER], [BW - CORNER, BH - CORNER],
  ];
  for (const [ox, oy] of corners)
    for (let j = 0; j < CORNER; j++)
      for (let i = 0; i < CORNER; i++)
        fillBlock(img, ox + i, oy + j, cornerCell(i, j) ? DARK : LIGHT);
}

/**
 * Paint the header around the ring, repeated HEADER_REPEAT times.
 *
 * The repeats are laid down consecutively rather than interleaved: the ring is
 * traversed in raster order, so consecutive copies land on physically distant
 * cells (top edge, then left/right columns, then bottom), which is the
 * interleaving that matters — a smudge on one edge cannot outvote the others.
 */
export function drawHeader(
  img: StegaImageData,
  BW: number,
  BH: number,
  border: number,
  header: Uint8Array
): void {
  const cells = headerCells(BW, BH, border);
  const bits = repeat(toBits(header), HEADER_REPEAT);
  if (bits.length > cells.length)
    throw new Error("STGP header does not fit the fiducial ring");
  for (let i = 0; i < cells.length; i++) {
    const [bx, by] = cells[i];
    // Cells past the header keep a fixed alternating fill, so the border reads
    // as a deliberate pattern rather than trailing off into whatever was there.
    const bit = i < bits.length ? bits[i] : (bx + by) & 1;
    fillBlock(img, bx, by, bit ? LIGHT : DARK);
  }
  drawCorners(img, BW, BH);
}

/** Read the header back off the ring, majority-voting the repeats. */
export function readHeader(
  img: StegaImageData,
  BW: number,
  BH: number,
  border: number
): Uint8Array {
  const cells = headerCells(BW, BH, border);
  const n = HEADER_SIZE * 8;
  const bits = new Uint8Array(n * HEADER_REPEAT);
  for (let i = 0; i < bits.length && i < cells.length; i++)
    bits[i] = blockMean(img, cells[i][0], cells[i][1]) >= MID ? 1 : 0;
  return fromBits(majority(bits, HEADER_REPEAT, n));
}

/**
 * Verify the corner marks are where they should be.
 *
 * Phase 1 uses this only as a sanity check — if the marks do not read, the
 * image has been transformed in a way phase 1 does not handle, and saying so is
 * more useful than decoding noise. Phase 3 replaces it with a search that
 * *locates* the marks and fits an affine transform from where it finds them.
 */
export function checkCorners(img: StegaImageData, BW: number, BH: number): boolean {
  const corners: Array<[number, number]> = [
    [0, 0], [BW - CORNER, 0], [0, BH - CORNER], [BW - CORNER, BH - CORNER],
  ];
  for (const [ox, oy] of corners)
    for (let j = 0; j < CORNER; j++)
      for (let i = 0; i < CORNER; i++) {
        const want = cornerCell(i, j);
        const got = blockMean(img, ox + i, oy + j) < MID;
        if (want !== got) return false;
      }
  return true;
}
