/**
 * RevealSurface — the shared pixel mechanism behind every Stegassette reveal.
 *
 * Encoding hid a payload in a cover's pixels, so reading it back develops the
 * cover again: a base canvas holds the reconstruction, an overlay canvas holds
 * the encoded image, and pixels are erased from the overlay in the cartridge's
 * own traversal order as they are read.
 *
 * This module owns only that mechanism. Two things are built on top of it, and
 * they are deliberately separate because they are different *levels*, not
 * competing implementations:
 *
 *   SeekableReveal  — you drive it, by fraction. `stega.now` drives it from its
 *                     own audio playhead; `animateReveal` drives it off a clock
 *                     for cartridges with no audio.
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
import { KEYMAP } from "./keymap";
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

  // Bounding box of pixels touched since the last flush, so a frame only
  // re-uploads the region that actually changed.
  private dx0 = 0;
  private dy0 = 0;
  private dx1 = -1;
  private dy1 = -1;

  constructor(img: Img, opts: StgcOpts, { className = "stegassette-player" }: RevealSurfaceOptions = {}) {
    const W = (this.width = img.width);
    const H = (this.height = img.height);
    this.opts = opts;
    this.B = opts.borderWidth;
    this.IW = W - 2 * this.B;
    this.IH = H - 2 * this.B;
    this.pathIdx = getPathIndices(this.IW, this.IH, opts.traversal, opts.params ?? {});
    this.bytesPerPixel = opts.plan?.bytesPerPixel ?? 3;

    this.element = document.createElement("div");
    this.element.className = className;
    this.baseCanvas = canvas(W, H);
    this.baseCanvas.className = "base";
    this.overlayCanvas = canvas(W, H);
    this.overlayCanvas.className = "overlay";
    this.element.append(this.baseCanvas, this.overlayCanvas);

    // Base layer: the reconstructed cover, smoothly upscaled when it comes
    // back at half resolution (which key-preserving combines allow).
    const recon = reconstructCover(img, opts);
    const small = canvas(recon.width, recon.height);
    small
      .getContext("2d")!
      .putImageData(new ImageData(asClamped(recon.data), recon.width, recon.height), 0, 0);
    const baseCtx = this.baseCanvas.getContext("2d")!;
    baseCtx.imageSmoothingEnabled = true;
    baseCtx.drawImage(small, 0, 0, W, H);

    // Overlay layer: the encoded image, erased as it is read.
    this.overlayCtx = this.overlayCanvas.getContext("2d")!;
    this.encoded = new Uint8ClampedArray(img.data);
    this.overlayData = new ImageData(new Uint8ClampedArray(this.encoded), W, H);
    this.px = this.overlayData.data;

    this.reset();
  }

  /** Restore the fully-encoded overlay, with the border ring cleared so the reconstruction rings it. */
  reset(): void {
    this.px.set(this.encoded);
    const { width: W, height: H, B } = this;
    if (B > 0) {
      // Alpha 0 across the ring; the base canvas shows through.
      for (let y = 0; y < H; y++) {
        const inRing = y < B || y >= H - B;
        for (let x = 0; x < W; x++) {
          if (inRing || x < B || x >= W - B) this.px[(y * W + x) * 4 + 3] = 0;
        }
      }
    }
    this.overlayCtx.putImageData(this.overlayData, 0, 0);
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
  clearAt(pathIndex: number): void {
    const { IW, IH, B, width: W, opts } = this;
    const v = this.pathIdx[pathIndex];
    const lx = v % IW;
    const ly = (v / IW) | 0;
    const x = lx + B;
    const y = ly + B;
    this.px[(y * W + x) * 4 + 3] = 0;
    this.touch(x, y);
    const [klx, kly] = KEYMAP[opts.keymap](lx, ly, IW, IH, opts.params ?? {});
    const kx = klx + B;
    const ky = kly + B;
    this.px[(ky * W + kx) * 4 + 3] = 0;
    this.touch(kx, ky);
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
 * Pass `null` to sweep the whole interior — that is what a cartridge with no
 * timed payload (a data-only cartridge) reveals.
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
 * Run a reveal off the clock rather than a playhead, for cartridges with no
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
