/**
 * Browser reveal player for Stegassette images.
 *
 * Plays the audio hidden in an encoded image while visually removing the
 * waveform, revealing the original cover in sync with the sound. Ported from
 * the labs stegassette editor (index.html pload/pplay/pframe).
 *
 * The pixel mechanism — stacked base/overlay canvases, traversal-ordered
 * erasure, batched uploads — lives in ./revealSurface and is shared with
 * SeekableReveal, which the standalone player drives from its own playhead.
 * This class is the self-driving level: it owns the AudioBuffers and the clock
 * for one or more audio tracks.
 *
 * DOM-dependent: exported via ./browser, not the pure core.
 */

import { Img } from "./Img";
import { decodeContainer } from "./container";
import { isAudioEntry, parseAudioEntry } from "./audio";
import { RevealSurface, SeekableReveal, revealSpanForEntry } from "./revealSurface";
import type { RevealSpan } from "./revealSurface";
import type { DecodedEntry, StgcOpts } from "./types";

export interface CreateRevealPlayerParams {
  /** Encoded Stegassette image (decoded pixels must be unmodified). */
  source: HTMLImageElement | HTMLCanvasElement;
  audioContext: AudioContext;
  /** Class applied to the wrapper element (default "stegassette-player"). */
  className?: string;
}

interface RevealTrack {
  channels: Float32Array[];
  sampleRate: number;
  dur: number;
  span: RevealSpan;
  fillIdx: number;
  buffer: AudioBuffer | null;
}

/**
 * Read pixels without color-space conversion where supported, so the decoded
 * bytes match what the encoder wrote.
 */
async function rawImg(
  source: HTMLImageElement | HTMLCanvasElement
): Promise<Img> {
  // Lazy / display:none images may never load (and decode() can reject on
  // them) — load a fresh eager Image from the same URL instead.
  if ("naturalWidth" in source && source.naturalWidth === 0) {
    const fresh = new Image();
    fresh.crossOrigin = source.crossOrigin;
    fresh.src = source.currentSrc || source.src;
    try {
      await fresh.decode();
    } catch (_) {
      // Safari's decode() can reject spuriously — fall back to load events
      if (!fresh.complete) {
        await new Promise<void>((resolve, reject) => {
          fresh.onload = () => resolve();
          fresh.onerror = () => reject(new Error(`failed to load ${fresh.src}`));
        });
      }
    }
    if (fresh.naturalWidth === 0) {
      throw new Error(`stegassette: could not load image ${fresh.src}`);
    }
    source = fresh;
  }
  const w = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h = "naturalHeight" in source ? source.naturalHeight : source.height;
  let drawable: CanvasImageSource = source;
  if (typeof createImageBitmap === "function") {
    try {
      drawable = await createImageBitmap(source, {
        colorSpaceConversion: "none",
      });
    } catch (_) {}
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(drawable, 0, 0);
  return new Img(w, h, context.getImageData(0, 0, w, h).data);
}

export class RevealPlayer {
  readonly surface: RevealSurface;
  readonly element: HTMLDivElement;
  readonly baseCanvas: HTMLCanvasElement;
  readonly overlayCanvas: HTMLCanvasElement;
  readonly opts: StgcOpts;
  readonly entries: DecodedEntry[];
  readonly width: number;
  readonly height: number;
  /** Duration in seconds of the primary (first) audio track. */
  readonly duration: number;

  private audioContext: AudioContext;
  private tracks: RevealTrack[];
  private sources: AudioBufferSourceNode[] = [];
  private rafId: number | null = null;
  private t0 = 0;
  private loopCount = 0;
  playing = false;

  constructor(
    img: Img,
    decoded: { entries: DecodedEntry[]; opts: StgcOpts },
    { audioContext, className = "stegassette-player" }: CreateRevealPlayerParams
  ) {
    const { entries, opts } = decoded;
    this.audioContext = audioContext;
    this.opts = opts;
    this.entries = entries;
    this.width = img.width;
    this.height = img.height;

    this.surface = new RevealSurface(img, opts, { className });
    this.element = this.surface.element;
    this.baseCanvas = this.surface.baseCanvas;
    this.overlayCanvas = this.surface.overlayCanvas;

    const bpp = this.surface.bytesPerPixel;
    const pathLen = this.surface.pathIdx.length;
    this.tracks = entries.filter(isAudioEntry).map((entry) => {
      const parsed = parseAudioEntry(entry);
      return {
        channels: parsed.channels,
        sampleRate: parsed.sampleRate,
        dur: parsed.channels[0].length / parsed.sampleRate,
        span: revealSpanForEntry(entry, bpp, pathLen),
        fillIdx: 0,
        buffer: null,
      };
    });
    if (!this.tracks.length) {
      throw new Error("stegassette: no audio entries in image");
    }
    this.duration = this.tracks[0].dur;

    this.restart();
  }

  /**
   * Back to fully encoded, then instantly reveal everything no track covers —
   * the entry table, text entries, and any slack past the payloads are not
   * part of the timed sweep.
   */
  private restart(): void {
    this.surface.reset();
    const minStart = Math.min(...this.tracks.map((t) => t.span.startPxIdx));
    const maxEnd = Math.max(...this.tracks.map((t) => t.span.endPxIdx));
    this.surface.clearRange(0, minStart);
    this.surface.clearRange(maxEnd, this.surface.pathIdx.length);
    this.surface.flush();
    for (const t of this.tracks) t.fillIdx = 0;
  }

  private frame = () => {
    if (!this.playing) return;
    const raw = this.audioContext.currentTime - this.t0;
    if (raw >= 0) {
      const loop = Math.floor(raw / this.duration);
      if (loop > this.loopCount) {
        this.loopCount = loop;
        this.restart();
      }
      for (const t of this.tracks) {
        const { startPxIdx, endPxIdx, revealOrder } = t.span;
        const pathLen = endPxIdx - startPxIdx;
        const elapsed = raw % t.dur;
        const revealIdx = Math.min(
          Math.floor((elapsed / t.dur) * pathLen),
          pathLen - 1
        );
        for (let i = t.fillIdx; i <= revealIdx; i++) {
          this.surface.clearAt(startPxIdx + (revealOrder ? revealOrder[i] : i));
        }
        t.fillIdx = Math.max(t.fillIdx, revealIdx + 1);
      }
      // One upload per frame, covering everything this frame touched.
      this.surface.flush();
    }
    this.rafId = requestAnimationFrame(this.frame);
  };

  async play() {
    if (this.playing) return;
    await this.audioContext.resume();
    this.restart();
    this.loopCount = 0;
    this.t0 = this.audioContext.currentTime + 0.02;
    this.sources = this.tracks.map((t) => {
      if (!t.buffer) {
        t.buffer = this.audioContext.createBuffer(
          t.channels.length,
          t.channels[0].length,
          t.sampleRate
        );
        for (let ch = 0; ch < t.channels.length; ch++)
          t.buffer.getChannelData(ch).set(t.channels[ch]);
      }
      const node = this.audioContext.createBufferSource();
      node.buffer = t.buffer;
      node.loop = true;
      node.connect(this.audioContext.destination);
      node.start(this.t0);
      return node;
    });
    this.playing = true;
    this.rafId = requestAnimationFrame(this.frame);
  }

  /** Stop audio and restore the encoded image on the overlay. */
  stop() {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    for (const src of this.sources) {
      try {
        src.stop();
      } catch (_) {}
    }
    this.sources = [];
    this.playing = false;
    this.surface.reset();
    this.surface.flush();
  }

  async toggle() {
    if (this.playing) this.stop();
    else await this.play();
  }

  destroy() {
    this.stop();
    this.element.remove();
  }
}

/**
 * Decode an encoded Stegassette image and build a reveal player for it.
 * Append `player.element` (a div containing two stacked canvases) to the DOM
 * and call `player.play()` / `player.stop()` / `player.toggle()`.
 */
export async function createRevealPlayer(
  params: CreateRevealPlayerParams
): Promise<RevealPlayer> {
  const img = await rawImg(params.source);
  const decoded = decodeContainer(img);
  return new RevealPlayer(img, decoded, params);
}

/**
 * Decode an image and build a caller-driven reveal for it — the counterpart to
 * createRevealPlayer for callers that own their own playhead, or that want to
 * reveal a specific entry (or the whole interior, with `entry: null`).
 */
export async function createSeekableReveal({
  source,
  entry = null,
  className,
}: {
  source: HTMLImageElement | HTMLCanvasElement;
  entry?: DecodedEntry | null;
  className?: string;
}): Promise<{
  reveal: SeekableReveal;
  entries: DecodedEntry[];
  opts: StgcOpts;
}> {
  const img = await rawImg(source);
  const decoded = decodeContainer(img);
  return {
    reveal: new SeekableReveal(img, decoded.opts, entry, { className }),
    entries: decoded.entries,
    opts: decoded.opts,
  };
}
