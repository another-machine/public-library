/**
 * Node.js entry point for @amplib/steganography.
 *
 * Provides PNG file I/O via pngjs and re-exports the pure Stegassette core
 * (encodeImageData / decodeImageData and all utilities). This is a separate
 * tsup entry so pngjs is never bundled into the browser build (src/index.ts).
 *
 * Usage:
 *   import { Stegassette, readPng, writePng } from "@amplib/steganography/node";
 *
 *   const src = await readPng("photo.png");
 *   const out = Stegassette.encodeImageData({ source: src, entries: [...] });
 *   await writePng("stegassette.png", out);
 *
 *   const { entries } = Stegassette.decodeImageData({ source: await readPng("stegassette.png") });
 */

// pngjs is only available in this Node bundle (optional dependency)
import { PNG } from "pngjs";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { Img } from "./Stegassette/Img";
import { decodeWav, encodeWav } from "./wav";
import type { WavData } from "./wav";
import type { StegaImageData } from "./Stegassette/types";

// Re-export the entire pure Stegassette core so consumers get one import
export * as Stegassette from "./Stegassette/index";
export * as Stegaprint from "./Stegaprint/index";

// WAV I/O lives on the Node entry only — the browser has decodeAudioData.
export { decodeWav, encodeWav } from "./wav";
export type { WavData } from "./wav";

/** Read a WAV file from disk into its format fields and raw PCM payload. */
export async function readWav(path: string): Promise<WavData> {
  return decodeWav(new Uint8Array(await readFile(path)));
}

/** Write raw PCM bytes to disk as a WAV file. */
export async function writeWav(
  path: string,
  pcm: Uint8Array,
  sampleRate: number,
  channels: number,
  bitsPerSample: number
): Promise<void> {
  await writeFile(path, encodeWav(pcm, sampleRate, channels, bitsPerSample));
}

/**
 * Read a PNG file from disk and return a StegaImageData (RGBA Uint8Array).
 */
export function readPng(path: string): Promise<StegaImageData> {
  return new Promise((resolve, reject) => {
    createReadStream(path)
      .pipe(new PNG())
      .on("parsed", function (this: PNG) {
        resolve(new Img(this.width, this.height, new Uint8Array(this.data)));
      })
      .on("error", reject);
  });
}

/**
 * Write a StegaImageData to a PNG file on disk.
 */
export function writePng(path: string, img: StegaImageData): Promise<void> {
  return new Promise((resolve, reject) => {
    const png = new PNG({ width: img.width, height: img.height });
    png.data = Buffer.from(img.data instanceof Uint8Array ? img.data : new Uint8Array(img.data));
    const ws = createWriteStream(path);
    ws.on("finish", resolve);
    ws.on("error", reject);
    png.pack().pipe(ws);
  });
}
