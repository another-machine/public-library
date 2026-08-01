/**
 * Reconstruct the original cover image from a STGC-encoded image.
 *
 * Faithful TypeScript port of the reconstruction algorithm from the lab's
 * `index.html` (~lines 1355–1548). Pure / environment-agnostic.
 *
 * For key-preserving combine ops (xor, additive, subtractive, bitshift,
 * midpoint, signed, veil, whisper) the key pixels are untouched by encoding,
 * so the cover is recovered exactly at half-resolution by averaging the two
 * diagonal key pixels in each 2×2 block.
 *
 * For non-key-preserving ops (difference, noise, echo) data pixels are
 * approximated by 4-neighbor interpolation, key-pixel symmetry is restored
 * per channel, and mixed plans are decimated to half-res at the end.
 */

import { KEYMAP, isKeylessKeymap, type LocatingKeymapName } from "./keymap";
import { getPathIndices } from "./traversal";
import type { CombineName, StegaImageData, StgcOpts } from "./types";

export const KEY_PRESERVING = new Set<CombineName>([
  "xor",
  "additive",
  "subtractive",
  "bitshift",
  "midpoint",
  "signed",
  "veil",
  "whisper",
]);

/** Low-bit masks applied to key pixels that stash audio bits there. */
const KEY_MASK: Partial<Record<CombineName, number>> = {
  midpoint: 0xfe,
  veil: 0xfc,
  whisper: 0xf0,
};

export function reconstructCover(
  image: StegaImageData,
  opts: StgcOpts,
): StegaImageData {
  const W = image.width, H = image.height;
  const B = opts.borderWidth;
  const IW = W - 2 * B, IH = H - 2 * B;

  // Flat RGBA byte array for reading source pixel values (never mutated).
  const px: Uint8Array =
    image.data instanceof Uint8Array
      ? image.data
      : new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);

  // Per-channel combine op (null = passthrough, carries no data).
  const chCombine: (CombineName | null)[] = [null, null, null];
  const slots =
    opts.plan?.slots ??
    ([0, 1, 2] as const).map((c) => ({ ch: c, combine: opts.combine }));
  for (const s of slots) chCombine[s.ch] = s.combine;

  // ── Keyless ─────────────────────────────────────────────────────────────
  // No pixel was held back to carry a cover value, so nothing can be recovered
  // for a channel that carries payload — blank those rather than return a
  // plausible-looking interpolation of noise.
  //
  // Only those, though. A partial channel plan (say `channels: "r"`) leaves the
  // channels outside the plan completely untouched, so G and B still hold the
  // original cover at FULL resolution — better than the half-res reconstruction
  // a keyed encode can offer. Blanking them would throw away the one real
  // picture such an encode has.
  if (isKeylessKeymap(opts.keymap)) {
    const out = new Uint8ClampedArray(px.length);
    out.set(px);
    const carries = chCombine.map((c) => c != null);
    if (carries.some(Boolean)) {
      for (let y = B; y < H - B; y++)
        for (let x = B; x < W - B; x++) {
          const o = (y * W + x) * 4;
          for (let c = 0; c < 3; c++) if (carries[c]) out[o + c] = 0;
          out[o + 3] = 255;
        }
    }
    return { data: out, width: W, height: H };
  }

  const realOnly = chCombine.every((c) => c == null || KEY_PRESERVING.has(c));
  const hasKeyPreserving = chCombine.some(
    (c) => c != null && KEY_PRESERVING.has(c),
  );

  // ── Real-only path ──────────────────────────────────────────────────────
  // All channels are key-preserving or passthrough → key pixels hold original
  // cover values exactly.  Average the two diagonal key pixels per 2×2 block
  // for a lossless half-resolution reconstruction.
  if (realOnly) {
    const reconW = (W + 1) >> 1;
    const reconH = (H + 1) >> 1;
    const reconData = new Uint8ClampedArray(reconW * reconH * 4);
    for (let by = 0; by < reconH; by++) {
      for (let bx = 0; bx < reconW; bx++) {
        const x0 = bx << 1, y0 = by << 1;
        const x1 = x0 + 1, y1 = y0 + 1;
        const tl = (y0 * W + x0) * 4;
        const hasBR = x1 < W && y1 < H;
        const br = hasBR ? (y1 * W + x1) * 4 : tl;
        const o = (by * reconW + bx) * 4;
        for (let c = 0; c < 3; c++) {
          const combine = chCombine[c];
          const m = combine != null ? (KEY_MASK[combine] ?? 0xff) : 0xff;
          reconData[o + c] = hasBR
            ? ((px[tl + c] & m) + (px[br + c] & m) + 1) >> 1
            : px[tl + c] & m;
        }
        reconData[o + 3] = 255;
      }
    }
    return { data: reconData, width: reconW, height: reconH };
  }

  // ── Full-res path ────────────────────────────────────────────────────────
  // At least one channel uses difference / noise / echo.  Approximate data
  // pixels by interpolation, then restore key-pixel symmetry per channel.
  const pathIdx = getPathIndices(IW, IH, opts.traversal, opts.params);
  const bpp = opts.plan?.bytesPerPixel ?? 3;
  const nEnc = Math.min(
    pathIdx.length,
    Math.ceil((opts.interiorByteLength || 0) / bpp),
  );

  // Coordinate helpers — work in absolute canvas space (include border).
  function dataXY(pi: number): [number, number] {
    const v = pathIdx[pi];
    return [(v % IW) + B, ((v / IW) | 0) + B];
  }
  function keyXY(pi: number): [number, number] {
    const v = pathIdx[pi];
    const lx = v % IW, ly = (v / IW) | 0;
    const [klx, kly] = KEYMAP[opts.keymap as LocatingKeymapName](lx, ly, IW, IH, opts.params ?? {});
    return [klx + B, kly + B];
  }

  // Mutable reconstruction buffer, seeded with the encoded pixels.
  const reconData = new Uint8ClampedArray(px.length);
  reconData.set(px);

  // Pass 1 — interpolate each data pixel from its 4 encoded neighbors.
  for (let pi = 0; pi < nEnc; pi++) {
    const [dx, dy] = dataXY(pi);
    const eo = (dy * W + dx) * 4;
    for (let c = 0; c < 3; c++) {
      const op = chCombine[c];
      if (op == null) continue; // passthrough channel
      const m = op === "midpoint" ? 0xfe : 0xff;
      let acc = 0, n = 0;
      for (const [nx, ny] of [
        [dx - 1, dy], [dx + 1, dy],
        [dx, dy - 1], [dx, dy + 1],
      ] as [number, number][]) {
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
          acc += px[(ny * W + nx) * 4 + c] & m;
          n++;
        }
      }
      reconData[eo + c] = n ? Math.round(acc / n) : 0;
    }
  }

  // Pass 2 — restore key-pixel symmetry per channel.
  for (let i = 0; i < nEnc; i++) {
    const [dx, dy] = dataXY(i);
    const [kx, ky] = keyXY(i);
    const doff = (dy * W + dx) * 4;
    const koff = (ky * W + kx) * 4;
    for (let c = 0; c < 3; c++) {
      const op = chCombine[c];
      if (op === "midpoint") {
        reconData[koff + c] &= 0xfe;
      } else if (op === "difference") {
        let sp = px[koff + c], dp = px[doff + c];
        if (sp < dp) sp += 256;
        const mid = Math.round((sp - dp) / 2 + dp) & 0xff;
        reconData[doff + c] = mid;
        reconData[koff + c] = mid;
      } else if (op === "echo") {
        reconData[koff + c] = px[koff + c] ^ px[doff + c];
      }
    }
  }

  // Pass 3 (echo only) — re-interpolate data pixels from now-restored keys.
  if (chCombine.some((c) => c === "echo")) {
    for (let pi = 0; pi < nEnc; pi++) {
      const [dx, dy] = dataXY(pi);
      const eo = (dy * W + dx) * 4;
      for (let c = 0; c < 3; c++) {
        if (chCombine[c] !== "echo") continue;
        let acc = 0, n = 0;
        for (const [nx, ny] of [
          [dx - 1, dy], [dx + 1, dy],
          [dx, dy - 1], [dx, dy + 1],
        ] as [number, number][]) {
          if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
            acc += reconData[(ny * W + nx) * 4 + c];
            n++;
          }
        }
        if (n) reconData[eo + c] = Math.round(acc / n);
      }
    }
  }

  // Mixed plan — decimate full-res to half-res, sampling only diagonal key
  // pixels (which hold real or restored values, never fabricated data pixels).
  if (hasKeyPreserving) {
    const rw = (W + 1) >> 1, rh = (H + 1) >> 1;
    const half = new Uint8ClampedArray(rw * rh * 4);
    for (let by = 0; by < rh; by++) {
      for (let bx = 0; bx < rw; bx++) {
        const x0 = bx << 1, y0 = by << 1;
        const x1 = x0 + 1, y1 = y0 + 1;
        const tl = (y0 * W + x0) * 4;
        const hasBR = x1 < W && y1 < H;
        const br = hasBR ? (y1 * W + x1) * 4 : tl;
        const o = (by * rw + bx) * 4;
        for (let c = 0; c < 3; c++)
          half[o + c] = hasBR
            ? (reconData[tl + c] + reconData[br + c] + 1) >> 1
            : reconData[tl + c];
        half[o + 3] = 255;
      }
    }
    return { data: half, width: rw, height: rh };
  }

  return { data: reconData, width: W, height: H };
}
