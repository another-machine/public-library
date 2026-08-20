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
  readonly baseCanvas: HTMLCanvasElement;
  readonly overlayCanvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  /** Interior-local linear indices, in traversal order. */
  readonly pathIdx: Uint32Array;
  readonly bytesPerPixel: number;
  readonly opts: StgcOpts;

  private overlayCtx: CanvasRenderingContext2D;
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
    this.baseCanvas = canvas(W, H);
    this.baseCanvas.className = "base";
    this.overlayCanvas = canvas(W, H);
    this.overlayCanvas.className = "overlay";
    this.element.append(this.baseCanvas, this.overlayCanvas);

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
    const baseCtx = this.baseCanvas.getContext("2d")!;
    const recon = reconstructCover(img, opts);
    const small = canvas(recon.width, recon.height);
    small
      .getContext("2d")!
      .putImageData(new ImageData(asClamped(recon.data), recon.width, recon.height), 0, 0);
    baseCtx.imageSmoothingEnabled = true;
    baseCtx.drawImage(small, 0, 0, W, H);

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
    if (this.partial) this.basePx = baseCtx.getImageData(0, 0, W, H).data;

    // Overlay layer: the encoded image, erased as it is read.
    this.overlayCtx = this.overlayCanvas.getContext("2d")!;
    this.encoded = new Uint8ClampedArray(img.data);
    this.overlayData = new ImageData(new Uint8ClampedArray(this.encoded), W, H);
    this.px = this.overlayData.data;

    // Large surfaces stay offscreen and display through box-filtered copies
    // (see MAX_DISPLAY). The base copy is made once here; the overlay copy is
    // refreshed by every flush.
    const scale = Math.min(1, MAX_DISPLAY / Math.max(W, H));
    if (scale < 1) {
      const DW = Math.max(1, Math.round(W * scale));
      const DH = Math.max(1, Math.round(H * scale));
      this.dispBase = canvas(DW, DH);
      this.dispBase.className = "base";
      this.dispOverlay = canvas(DW, DH);
      this.dispOverlay.className = "overlay";
      this.element.textContent = "";
      this.element.append(this.dispBase, this.dispOverlay);
      let pw = W;
      let ph = H;
      while (Math.max(pw, ph) / 2 > Math.max(DW, DH)) {
        pw = Math.ceil(pw / 2);
        ph = Math.ceil(ph / 2);
        this.pyramid.push(canvas(pw, ph));
      }
      this.downscaleInto(this.baseCanvas, this.dispBase);
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
    this.overlayCtx.putImageData(this.overlayData, 0, 0);
    if (this.dispOverlay) this.downscaleInto(this.overlayCanvas, this.dispOverlay);
    this.dx0 = this.dy0 = 0;
    this.dx1 = this.dy1 = -1;
  }

  private touch(x: number, y: number): void {
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
    this.overlayCtx.putImageData(
      this.overlayData,
      0,
      0,
      this.dx0,
      this.dy0,
      this.dx1 - this.dx0 + 1,
      this.dy1 - this.dy0 + 1
    );
    if (this.dispOverlay) this.downscaleInto(this.overlayCanvas, this.dispOverlay);
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
