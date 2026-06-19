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
import { Img } from "./Stegassette/Img";
import type { StegaImageData } from "./Stegassette/types";

// Re-export the entire pure Stegassette core so consumers get one import
export * as Stegassette from "./Stegassette/index";

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
