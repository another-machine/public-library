/**
 * Browser reveal player for Stegassette images.
 *
 * Plays the audio hidden in an encoded image while visually removing the
 * waveform: a base canvas holds the reconstructed cover (reconstructCover),
 * an overlay canvas holds the encoded image, and as playback advances the
 * overlay is cleared pixel-by-pixel in audio order — revealing the original
 * image in sync with the sound. Ported from the labs stegassette editor
 * (index.html pload/pplay/pframe).
 *
 * DOM-dependent: exported via ./browser, not the pure core.
 */

import { Img } from "./Img";
import { decodeContainer } from "./container";
import { isAudioEntry, parseAudioEntry } from "./audio";
import { computeRevealOrder } from "./pcm";
import { reconstructCover } from "./reconstruct";
import { getPathIndices } from "./traversal";
import { KEYMAP } from "./keymap";
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
  audioStartPxIdx: number;
  audioEndPxIdx: number;
  revealOrder: Int32Array;
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
  private baseCtx: CanvasRenderingContext2D;
  private overlayCtx: CanvasRenderingContext2D;
  private encodedCanvas: HTMLCanvasElement;
  private pathIdx: Uint32Array;
  private tracks: RevealTrack[];
  private B: number;
  private IW: number;
  private IH: number;
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
    this.B = opts.borderWidth;
    this.IW = img.width - 2 * this.B;
    this.IH = img.height - 2 * this.B;
    this.pathIdx = getPathIndices(
      this.IW,
      this.IH,
      opts.traversal,
      opts.params ?? {}
    );

    const bpp = opts.plan?.bytesPerPixel ?? 3;
    this.tracks = entries.filter(isAudioEntry).map((entry) => {
      const parsed = parseAudioEntry(entry);
      const audioStartPxIdx = Math.floor(entry.dataOffset / bpp);
      const audioEndPxIdx = Math.min(
        Math.ceil((entry.dataOffset + entry.data.length) / bpp),
        this.pathIdx.length
      );
      return {
        channels: parsed.channels,
        sampleRate: parsed.sampleRate,
        dur: parsed.channels[0].length / parsed.sampleRate,
        audioStartPxIdx,
        audioEndPxIdx,
        revealOrder: computeRevealOrder({
          pathLen: audioEndPxIdx - audioStartPxIdx,
          channels: parsed.channels.length,
          bits: parsed.bitsPerSample,
          layout: parsed.layout,
          blockSize: parsed.blockSize,
          bytesPerPixel: bpp,
        }),
        fillIdx: 0,
        buffer: null,
      };
    });
    if (!this.tracks.length) {
      throw new Error("stegassette: no audio entries in image");
    }
    this.duration = this.tracks[0].dur;

    // Encoded image kept at native size for overlay redraws
    this.encodedCanvas = document.createElement("canvas");
    this.encodedCanvas.width = img.width;
    this.encodedCanvas.height = img.height;
    const encCtx = this.encodedCanvas.getContext("2d")!;
    const encImageData = new ImageData(
      new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length),
      img.width,
      img.height
    );
    encCtx.putImageData(encImageData, 0, 0);

    // Wrapper with stacked base (reconstruction) + overlay (encoded) canvases
    this.element = document.createElement("div");
    this.element.className = className;
    this.baseCanvas = document.createElement("canvas");
    this.baseCanvas.className = "base";
    this.overlayCanvas = document.createElement("canvas");
    this.overlayCanvas.className = "overlay";
    this.baseCanvas.width = this.overlayCanvas.width = img.width;
    this.baseCanvas.height = this.overlayCanvas.height = img.height;
    this.element.append(this.baseCanvas, this.overlayCanvas);
    this.baseCtx = this.baseCanvas.getContext("2d")!;
    this.overlayCtx = this.overlayCanvas.getContext("2d")!;

    // Base layer: reconstructed cover, smoothly upscaled if half-res
    const recon = reconstructCover(img, opts);
    const tmp = document.createElement("canvas");
    tmp.width = recon.width;
    tmp.height = recon.height;
    const tmpCtx = tmp.getContext("2d")!;
    const reconData =
      recon.data instanceof Uint8ClampedArray
        ? recon.data
        : new Uint8ClampedArray(
            recon.data.buffer,
            recon.data.byteOffset,
            recon.data.length
          );
    tmpCtx.putImageData(new ImageData(reconData, recon.width, recon.height), 0, 0);
    this.baseCtx.imageSmoothingEnabled = true;
    this.baseCtx.drawImage(tmp, 0, 0, img.width, img.height);

    this.drawEncodedOverlay();
  }

  /** Paint the full encoded image on the overlay, border cleared so the reconstruction rings it. */
  private drawEncodedOverlay() {
    const { width: W, height: H, B } = this;
    this.overlayCtx.drawImage(this.encodedCanvas, 0, 0);
    if (B > 0) {
      this.overlayCtx.clearRect(0, 0, W, B);
      this.overlayCtx.clearRect(0, H - B, W, B);
      this.overlayCtx.clearRect(0, 0, B, H);
      this.overlayCtx.clearRect(W - B, 0, B, H);
    }
  }

  /** Clear the overlay at an interior path value and its keymapped partner. */
  private clearOverlayAt(v: number) {
    const { IW, IH, B, opts } = this;
    const lx = v % IW;
    const ly = (v / IW) | 0;
    this.overlayCtx.clearRect(lx + B, ly + B, 1, 1);
    const [klx, kly] = KEYMAP[opts.keymap](lx, ly, IW, IH, opts.params ?? {});
    this.overlayCtx.clearRect(klx + B, kly + B, 1, 1);
  }

  /** Instantly reveal pixels that carry no audio (entry table, text entries, slack). */
  private fillNonAudioPixels() {
    const minStart = Math.min(...this.tracks.map((t) => t.audioStartPxIdx));
    const maxEnd = Math.max(...this.tracks.map((t) => t.audioEndPxIdx));
    for (let i = 0; i < minStart; i++) this.clearOverlayAt(this.pathIdx[i]);
    for (let i = maxEnd; i < this.pathIdx.length; i++)
      this.clearOverlayAt(this.pathIdx[i]);
  }

  private frame = () => {
    if (!this.playing) return;
    const raw = this.audioContext.currentTime - this.t0;
    if (raw >= 0) {
      const loop = Math.floor(raw / this.duration);
      if (loop > this.loopCount) {
        this.loopCount = loop;
        this.drawEncodedOverlay();
        this.fillNonAudioPixels();
        for (const t of this.tracks) t.fillIdx = 0;
      }
      for (const t of this.tracks) {
        const pathLen = t.audioEndPxIdx - t.audioStartPxIdx;
        const elapsed = raw % t.dur;
        const revealIdx = Math.min(
          Math.floor((elapsed / t.dur) * pathLen),
          pathLen - 1
        );
        for (let i = t.fillIdx; i <= revealIdx; i++)
          this.clearOverlayAt(this.pathIdx[t.audioStartPxIdx + t.revealOrder[i]]);
        t.fillIdx = Math.max(t.fillIdx, revealIdx + 1);
      }
    }
    this.rafId = requestAnimationFrame(this.frame);
  };

  async play() {
    if (this.playing) return;
    await this.audioContext.resume();
    this.drawEncodedOverlay();
    this.fillNonAudioPixels();
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
      t.fillIdx = 0;
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
    this.drawEncodedOverlay();
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
