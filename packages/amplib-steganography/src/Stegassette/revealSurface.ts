/**
 * RevealSurface — the shared pixel mechanism behind every Stegassette reveal.
 *
 * Encoding hid a payload in a cover's pixels, so reading it back develops the
 * cover again: a base canvas holds the reconstruction, an overlay canvas holds
 * the encoded image, and pixels are erased from the overlay in the stegassette's
 * own traversal order as they are read.
 *
 * This module owns only that mechanism. Two things are built on top of it, and
 * they are deliberately separate because they are different *levels*, not
 * competing implementations:
 *
 *   SeekableReveal  — you drive it, by fraction. `stega.now` drives it from its
 *                     own audio playhead; `animateReveal` drives it off a clock
 *                     for stegassettes with no audio.
 *   RevealPlayer    — drives itself, owning the AudioBuffer and playhead for
 *                     one or more audio tracks (see ./player).
 *
 * Erasing writes alpha 0 into an ImageData we hold and uploads the touched
 * bounding box once per flush. A `clearRect` per pixel made a deep seek cost
 * hundreds of milliseconds, because the work scales with how much of the image
 * the jump reveals — this is the one performance decision in here that matters.
 *
 * DOM-dependent: exported via ./browser, not the pure core.
 */

import { Img } from "./Img";
import { isAudioEntry, parseAudioEntry } from "./audio";
import { KEYMAP, isKeylessKeymap, type LocatingKeymapName } from "./keymap";
import { computeRevealOrder } from "./pcm";
import { reconstructCover } from "./reconstruct";
import { getPathIndices } from "./traversal";
import type { DecodedEntry, StgcOpts } from "./types";

export interface RevealSurfaceOptions {
  /** Class applied to the wrapper element (default "stegassette-player"). */
  className?: string;
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function asClamped(data: Uint8Array | Uint8ClampedArray): Uint8ClampedArray {
  return data instanceof Uint8ClampedArray
    ? data
    : new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Surfaces past this long-edge size display through a downscaled copy.
 *
 * CSS-scaling a full-resolution canvas leaves the shrink to the compositor's
 * sampler, which reads a couple of texels per screen pixel. Against per-pixel
 * payload noise that is aliasing: nearest-neighbor phases the checkerboard
 * into blocks, bilinear into blobs, and both patterns shift with zoom and
 * devicePixelRatio. A stepped-halving downscale averages every source pixel
 * (a box filter), so the noise reads as uniform grain at every zoom.
 */
const MAX_DISPLAY = 2048;

export class RevealSurface {
  /** Wrapper div holding the stacked base and overlay canvases. */
  readonly element: HTMLDivElement;
  /**
   * The two canvases actually stacked in `element`. On a downscaled surface
   * these are the display copies, not the full-resolution originals.
   */
  readonly baseCanvas: HTMLCanvasElement;
  readonly overlayCanvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  /** Interior-local linear indices, in traversal order. */
  readonly pathIdx: Uint32Array;
  readonly bytesPerPixel: number;
  readonly opts: StgcOpts;

  /** Full-resolution overlay canvas; null when the first halving runs in JS. */
  private fullOverlay: HTMLCanvasElement | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;
  /** Full-resolution base canvas; null when only the display copy reads it. */
  private fullBase: HTMLCanvasElement | null = null;
  private encoded: Uint8ClampedArray;
  private overlayData: ImageData;
  private px: Uint8ClampedArray;
  private B: number;
  private IW: number;
  private IH: number;
  /** True when the encode generates its key from position (no key pixels). */
  private keyless: boolean;
  /** Which channels the encode wrote (all three under a full plan). */
  private carried: boolean[];
  /** True for channel-plan encodes: some channels were never written. */
  private partial: boolean;
  /** Base pixels at full resolution, held only when `partial` needs them. */
  private basePx: Uint8ClampedArray | null = null;
  /** Downscaled display copies; null when the surface shows at full size. */
  private dispBase: HTMLCanvasElement | null = null;
  private dispOverlay: HTMLCanvasElement | null = null;
  private pyramid: HTMLCanvasElement[] = [];
  /** Half-resolution overlay copy, filled by `halveInto`. */
  private mip: HTMLCanvasElement | null = null;
  private mipCtx: CanvasRenderingContext2D | null = null;
  private mipData: ImageData | null = null;
  private mipW = 0;
  private mipH = 0;
  /**
   * Half-resolution blocks touched since the last flush.
   *
   * The touched bounding box is the wrong unit of work for the mip: a keymap
   * that throws key pixels across the image makes almost every frame's box
   * almost the whole image, while the pixels that actually changed number in
   * the thousands. Uploading a big box is cheap (the browser does it), but
   * re-averaging one is not, so the blocks are listed instead of bounded.
   */
  private dirty: Uint32Array | null = null;
  private dirtyLen = 0;
  /** Too many blocks to list — re-average the whole box instead. */
  private dirtyAll = false;

  // Bounding box of pixels touched since the last flush, so a frame only
  // re-uploads the region that actually changed.
  private dx0 = 0;
  private dy0 = 0;
  private dx1 = -1;
  private dy1 = -1;

  constructor(
    img: Img,
    opts: StgcOpts,
    { className = "stegassette-player" }: RevealSurfaceOptions = {}
  ) {
    const W = (this.width = img.width);
    const H = (this.height = img.height);
    this.opts = opts;
    this.B = opts.borderWidth;
    this.IW = W - 2 * this.B;
    this.IH = H - 2 * this.B;
    this.keyless = isKeylessKeymap(opts.keymap);
    this.pathIdx = getPathIndices(
      this.IW,
      this.IH,
      opts.traversal,
      opts.params ?? {},
      this.keyless
    );
    this.bytesPerPixel = opts.plan?.bytesPerPixel ?? 3;

    this.element = document.createElement("div");
    this.element.className = className;

    // A channel-plan encode wrote only some channels; the others still hold
    // the original cover at full resolution. Revealing those pixels must
    // rewrite the carried channels from the base rather than alpha-swap the
    // whole pixel, which would trade untouched full-resolution channels for
    // the reconstruction's upscale. Full plans keep the cheap alpha path.
    const chCombine: (string | null)[] = [null, null, null];
    const slots =
      opts.plan?.slots ??
      [0, 1, 2].map((c) => ({ ch: c, combine: opts.combine }));
    for (const s of slots) chCombine[s.ch] = s.combine;
    this.carried = chCombine.map((c) => c != null);
    this.partial = this.carried.includes(false);

    // Large surfaces stay offscreen and display through box-filtered copies
    // (see MAX_DISPLAY). Neither full-resolution canvas is on screen then, and
    // on a 65-megapixel stegassette the pair costs half a gigabyte, so each is
    // allocated only where something still reads it:
    //
    //   base    — read per pixel for the life of a channel-plan reveal; read
    //             once otherwise, to fill the display copy
    //   overlay — a putImageData target that only feeds the downscale chain,
    //             whose first halving `halveInto` can do in JS instead
    //
    // A surface just past MAX_DISPLAY has no halving step to replace, so it
    // keeps the overlay canvas and the direct upload.
    const scale = Math.min(1, MAX_DISPLAY / Math.max(W, H));
    const DW = scale < 1 ? Math.max(1, Math.round(W * scale)) : W;
    const DH = scale < 1 ? Math.max(1, Math.round(H * scale)) : H;
    const halveInJs = scale < 1 && Math.max(W, H) / 2 > Math.max(DW, DH);
    const needFullBase = scale === 1 || this.partial;

    // Overlay layer: the encoded image, erased as it is read.
    this.encoded = new Uint8ClampedArray(img.data);
    this.overlayData = new ImageData(new Uint8ClampedArray(this.encoded), W, H);
    this.px = this.overlayData.data;
    if (halveInJs) {
      this.mipW = Math.ceil(W / 2);
      this.mipH = Math.ceil(H / 2);
      this.mip = canvas(this.mipW, this.mipH);
      this.mipCtx = this.mip.getContext("2d")!;
      this.mipData = new ImageData(this.mipW, this.mipH);
      // A frame of playback dirties a few thousand blocks. Past a million,
      // listing them costs more than walking the box.
      this.dirty = new Uint32Array(Math.min(1 << 20, this.mipW * this.mipH));
    } else {
      this.fullOverlay = canvas(W, H);
      this.fullOverlay.className = "overlay";
      this.overlayCtx = this.fullOverlay.getContext("2d")!;
    }

    // Base layer: whatever of the cover can be recovered, smoothly upscaled
    // when it comes back at half resolution (which key-preserving combines
    // allow). One path for every mode, because "how much survives" is a
    // property of the encode that reconstructCover already answers:
    //
    //   keyed              → the cover, at half resolution
    //   keyless, full plan → the border ring, interior blank (reveals to black)
    //   keyless, partial   → the channels left out of the plan, at FULL
    //                        resolution, since they were never written
    //
    // A blanket keyless fill lived here and was wrong for the third case: it
    // painted over real cover that no combine had ever touched.
    const recon = reconstructCover(img, opts);
    const small = canvas(recon.width, recon.height);
    small
      .getContext("2d")!
      .putImageData(new ImageData(asClamped(recon.data), recon.width, recon.height), 0, 0);
    let baseSrc: HTMLCanvasElement = small;
    if (needFullBase) {
      this.fullBase = canvas(W, H);
      this.fullBase.className = "base";
      const baseCtx = this.fullBase.getContext("2d")!;
      baseCtx.imageSmoothingEnabled = true;
      baseCtx.drawImage(small, 0, 0, W, H);
      if (this.partial) this.basePx = baseCtx.getImageData(0, 0, W, H).data;
      baseSrc = this.fullBase;
    }

    if (scale < 1) {
      this.dispBase = canvas(DW, DH);
      this.dispBase.className = "base";
      this.dispOverlay = canvas(DW, DH);
      this.dispOverlay.className = "overlay";
      // The chain starts wherever the overlay copy starts: at the mip when the
      // first halving runs in JS, at full resolution otherwise.
      let pw = halveInJs ? this.mipW : W;
      let ph = halveInJs ? this.mipH : H;
      while (Math.max(pw, ph) / 2 > Math.max(DW, DH)) {
        pw = Math.ceil(pw / 2);
        ph = Math.ceil(ph / 2);
        this.pyramid.push(canvas(pw, ph));
      }
    }
    this.baseCanvas = this.dispBase ?? this.fullBase!;
    this.overlayCanvas = this.dispOverlay ?? this.fullOverlay!;
    this.element.append(this.baseCanvas, this.overlayCanvas);

    // The base copy is made once, here; the overlay copy is refreshed by every
    // flush. Both take the same chain, so both layers carry the same filter.
    // The base borrows the mip as scratch, which is free — no reveal has been
    // written into it yet.
    if (this.dispBase) {
      if (this.mipCtx) {
        this.mipCtx.imageSmoothingEnabled = true;
        this.mipCtx.imageSmoothingQuality = "high";
        this.mipCtx.drawImage(
          baseSrc,
          0,
          0,
          baseSrc.width,
          baseSrc.height,
          0,
          0,
          this.mipW,
          this.mipH
        );
        this.downscaleInto(this.mip!, this.dispBase);
      } else {
        this.downscaleInto(baseSrc, this.dispBase);
      }
    }

    this.reset();
  }

  /**
   * Stepped-halving downscale: each step averages 2x2, so the chain
   * approximates a box filter instead of sparse-sampling the noise.
   */
  private downscaleInto(src: HTMLCanvasElement, dst: HTMLCanvasElement): void {
    let cur: HTMLCanvasElement = src;
    let cw = src.width;
    let ch = src.height;
    for (const mid of this.pyramid) {
      const ctx = mid.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, mid.width, mid.height);
      ctx.drawImage(cur, 0, 0, cw, ch, 0, 0, mid.width, mid.height);
      cur = mid;
      cw = mid.width;
      ch = mid.height;
    }
    const ctx = dst.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, dst.width, dst.height);
    ctx.drawImage(cur, 0, 0, cw, ch, 0, 0, dst.width, dst.height);
  }

  /** Restore the fully-encoded overlay, with the border ring cleared so the reconstruction rings it. */
  reset(): void {
    this.px.set(this.encoded);
    const { width: W, height: H, B } = this;
    // Keyless keeps its ring opaque. Its reconstruction is full-resolution, so
    // the ring underneath is the same pixels either way — but leaving the
    // encoded ring in place avoids resampling a border that is already exact.
    if (B > 0 && !this.keyless) {
      // Alpha 0 across the ring; the base canvas shows through.
      for (let y = 0; y < H; y++) {
        const inRing = y < B || y >= H - B;
        for (let x = 0; x < W; x++) {
          if (inRing || x < B || x >= W - B) this.px[(y * W + x) * 4 + 3] = 0;
        }
      }
    }
    // `px.set` above went around touch(), so nothing is listed and everything
    // changed.
    this.dirtyAll = true;
    this.upload(0, 0, W - 1, H - 1);
    this.dx0 = this.dy0 = 0;
    this.dx1 = this.dy1 = -1;
  }

  /** Push one box of `px` through to whatever the element shows. */
  private upload(x0: number, y0: number, x1: number, y1: number): void {
    if (this.mipCtx) {
      const mx0 = x0 >> 1;
      const my0 = y0 >> 1;
      const mx1 = Math.min(this.mipW - 1, x1 >> 1);
      const my1 = Math.min(this.mipH - 1, y1 >> 1);
      if (this.dirtyAll) {
        for (let my = my0; my <= my1; my++)
          for (let mx = mx0; mx <= mx1; mx++) this.halveAt(mx, my);
      } else {
        const d = this.dirty!;
        const mipW = this.mipW;
        for (let i = 0; i < this.dirtyLen; i++) {
          const mo = d[i];
          const my = (mo / mipW) | 0;
          this.halveAt(mo - my * mipW, my);
        }
      }
      this.dirtyLen = 0;
      this.dirtyAll = false;
      this.mipCtx.putImageData(
        this.mipData!,
        0,
        0,
        mx0,
        my0,
        mx1 - mx0 + 1,
        my1 - my0 + 1
      );
      this.downscaleInto(this.mip!, this.dispOverlay!);
      return;
    }
    this.overlayCtx!.putImageData(
      this.overlayData,
      0,
      0,
      x0,
      y0,
      x1 - x0 + 1,
      y1 - y0 + 1
    );
    if (this.dispOverlay) this.downscaleInto(this.fullOverlay!, this.dispOverlay);
  }

  /**
   * Average one 2x2 block of `px` into the half-resolution mip. This is the
   * same first halving the drawImage chain used to do, done where the pixels
   * already live — which is what lets the full-resolution overlay canvas go.
   *
   * Alpha is premultiplied on the way in. A revealed pixel keeps the encoded
   * colour it carried and only drops to alpha 0, so a plain average would let
   * it tint the block with noise it is no longer showing.
   */
  private halveAt(mx: number, my: number): void {
    const { width: W, height: H, px } = this;
    const rx0 = mx << 1;
    const ry0 = my << 1;
    // An odd edge has no second row or column to pair with; the lone pixel
    // counts twice, which averages to itself.
    const rx1 = rx0 + 1 < W ? rx0 + 1 : rx0;
    const row0 = ry0 * W;
    const row1 = (ry0 + 1 < H ? ry0 + 1 : ry0) * W;
    const oA = (row0 + rx0) * 4;
    const oB = (row0 + rx1) * 4;
    const oC = (row1 + rx0) * 4;
    const oD = (row1 + rx1) * 4;
    let al = px[oA + 3];
    let a = al;
    let r = px[oA] * al;
    let g = px[oA + 1] * al;
    let b = px[oA + 2] * al;
    al = px[oB + 3];
    a += al;
    r += px[oB] * al;
    g += px[oB + 1] * al;
    b += px[oB + 2] * al;
    al = px[oC + 3];
    a += al;
    r += px[oC] * al;
    g += px[oC + 1] * al;
    b += px[oC + 2] * al;
    al = px[oD + 3];
    a += al;
    r += px[oD] * al;
    g += px[oD + 1] * al;
    b += px[oD + 2] * al;
    const mp = this.mipData!.data;
    const mo = (my * this.mipW + mx) * 4;
    if (a > 0) {
      mp[mo] = r / a;
      mp[mo + 1] = g / a;
      mp[mo + 2] = b / a;
    } else {
      mp[mo] = mp[mo + 1] = mp[mo + 2] = 0;
    }
    mp[mo + 3] = a >> 2;
  }

  private touch(x: number, y: number): void {
    if (this.dirty !== null) {
      if (this.dirtyLen < this.dirty.length)
        this.dirty[this.dirtyLen++] = (y >> 1) * this.mipW + (x >> 1);
      else this.dirtyAll = true;
    }
    if (this.dx1 < this.dx0) {
      this.dx0 = this.dx1 = x;
      this.dy0 = this.dy1 = y;
      return;
    }
    if (x < this.dx0) this.dx0 = x;
    else if (x > this.dx1) this.dx1 = x;
    if (y < this.dy0) this.dy0 = y;
    else if (y > this.dy1) this.dy1 = y;
  }

  /**
   * Erase the pixel at a traversal position, and its keymapped key pixel.
   *
   * Both, because a data pixel and its key are a pair: clearing only the data
   * pixels would develop a checkerboard of the image rather than the image.
   */
  /**
   * Reveal one pixel. A full encode swaps the whole pixel to the base via
   * alpha; a channel-plan encode rewrites only the carried channels so the
   * untouched channels keep the full-resolution original.
   */
  private clearPx(x: number, y: number): void {
    const o = (y * this.width + x) * 4;
    if (this.partial) {
      const base = this.basePx!;
      for (let c = 0; c < 3; c++) if (this.carried[c]) this.px[o + c] = base[o + c];
    } else {
      this.px[o + 3] = 0;
    }
    this.touch(x, y);
  }

  clearAt(pathIndex: number): void {
    const { IW, IH, B, opts } = this;
    const v = this.pathIdx[pathIndex];
    const lx = v % IW;
    const ly = (v / IW) | 0;
    this.clearPx(lx + B, ly + B);
    // Keyless has no partner to clear — every interior pixel is a data pixel,
    // so the checkerboard this pairing exists to avoid cannot arise.
    if (this.keyless) return;
    const [klx, kly] = KEYMAP[opts.keymap as LocatingKeymapName](
      lx,
      ly,
      IW,
      IH,
      opts.params ?? {}
    );
    this.clearPx(klx + B, kly + B);
  }

  /** Erase a half-open range of traversal positions. */
  clearRange(from: number, to: number): void {
    const end = Math.min(to, this.pathIdx.length);
    for (let i = Math.max(0, from); i < end; i++) this.clearAt(i);
  }

  /** Upload the touched region. Cheap when nothing changed. */
  flush(): void {
    if (this.dx1 < this.dx0) return;
    this.upload(this.dx0, this.dy0, this.dx1, this.dy1);
    this.dx0 = this.dy0 = 0;
    this.dx1 = this.dy1 = -1;
  }
}

/** The traversal positions one entry's payload occupies, and the order they light up in. */
export interface RevealSpan {
  startPxIdx: number;
  endPxIdx: number;
  /**
   * Index permutation within the span, or null for plain traversal order.
   * Raw PCM under planar or interleaved layouts does not map to pixels in
   * order — this is the order the pixels actually become audible in.
   */
  revealOrder: Int32Array | null;
}

/**
 * Compute the reveal span for a decoded entry.
 *
 * Pass `null` to sweep the whole interior — that is what a stegassette with no
 * timed payload (a data-only stegassette) reveals.
 */
export function revealSpanForEntry(
  entry: DecodedEntry | null,
  bytesPerPixel: number,
  pathLen: number
): RevealSpan {
  if (!entry) return { startPxIdx: 0, endPxIdx: pathLen, revealOrder: null };

  const len = entry.data.length;
  const startPxIdx = Math.floor(entry.dataOffset / bytesPerPixel);
  const endPxIdx = Math.min(
    Math.ceil((entry.dataOffset + len) / bytesPerPixel),
    pathLen
  );

  let revealOrder: Int32Array | null = null;
  if (isAudioEntry(entry) && /^audio\/l/i.test(entry.mimetype)) {
    const parsed = parseAudioEntry(entry);
    revealOrder = computeRevealOrder({
      pathLen: Math.max(1, endPxIdx - startPxIdx),
      channels: parsed.channels.length,
      bits: parsed.bitsPerSample,
      layout: parsed.layout,
      blockSize: parsed.blockSize,
      bytesPerPixel,
    });
  }

  return { startPxIdx, endPxIdx, revealOrder };
}

/**
 * A single-span reveal driven by the caller, by fraction.
 *
 * `seek` is monotonic — it only ever reveals forward, because revealing is
 * erasure. Call `reset()` to start over.
 */
export class SeekableReveal {
  readonly surface: RevealSurface;
  readonly span: RevealSpan;
  /** Convenience passthrough to `surface.element`. */
  readonly element: HTMLDivElement;

  private filled = -1;

  constructor(
    img: Img,
    opts: StgcOpts,
    entry: DecodedEntry | null = null,
    options: RevealSurfaceOptions = {}
  ) {
    this.surface = new RevealSurface(img, opts, options);
    this.element = this.surface.element;
    this.span = revealSpanForEntry(entry, this.surface.bytesPerPixel, this.surface.pathIdx.length);
    this.reset();
  }

  /**
   * Back to fully encoded, except the pixels outside the span — the entry
   * table, other entries, and any slack past the payload are not part of the
   * timed sweep, so they are revealed immediately.
   */
  reset(): void {
    this.surface.reset();
    const { startPxIdx, endPxIdx } = this.span;
    this.surface.clearRange(0, startPxIdx);
    this.surface.clearRange(endPxIdx, this.surface.pathIdx.length);
    this.surface.flush();
    this.filled = -1;
  }

  /** Reveal up to `fraction` (0–1) of the span. */
  seek(fraction: number): void {
    const { startPxIdx, endPxIdx, revealOrder } = this.span;
    const span = Math.max(1, endPxIdx - startPxIdx);
    const target = Math.min(span - 1, Math.floor(Math.max(0, fraction) * span));
    if (target <= this.filled) return;
    for (let i = this.filled + 1; i <= target; i++) {
      this.surface.clearAt(startPxIdx + (revealOrder ? revealOrder[i] : i));
    }
    this.filled = target;
    this.surface.flush();
  }
}

/**
 * Run a reveal off the clock rather than a playhead, for stegassettes with no
 * audio to sync to. Returns a cancel function.
 *
 * Uses setInterval rather than requestAnimationFrame deliberately: a
 * backgrounded tab stops serving frames, which would leave the image half
 * developed, whereas progress measured against the clock still finishes.
 */
export function animateReveal(
  target: SeekableReveal,
  ms: number,
  onDone?: () => void
): () => void {
  target.reset();
  const t0 = performance.now();
  const id = setInterval(() => {
    const p = (performance.now() - t0) / ms;
    target.seek(p);
    if (p >= 1) {
      clearInterval(id);
      if (onDone) onDone();
    }
  }, 33);
  return () => clearInterval(id);
}
