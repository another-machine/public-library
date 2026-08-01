/**
 * Collections — many stegassettes that belong together.
 *
 * A container is one stegassette. A *collection* is a set of them with a root
 * stegassette that describes the rest: the root carries a manifest entry and the
 * key, each member carries its own descriptor entry and a slice of payload.
 * The album format (`stega-album/1`) is the first profile built on this, but
 * nothing here knows what an album is — no track numbers, no lyrics, no audio.
 *
 * This module is pure. It is here rather than in a consumer because it was
 * previously written twice — once in the browser player and once, by hand, for
 * the Node batch pipeline — and the two had to be kept in lockstep by
 * discipline alone. The only thing that had made that necessary was crypto and
 * base64 being reached for through `node:crypto` and `Buffer` on one side and
 * `globalThis.crypto` on the other. WebCrypto AES-GCM is spec-identical across
 * both and has been global in Node since 19, so one implementation serves
 * everyone and the parity problem stops existing.
 *
 * On "encryption": it is possession-based. The key lives in the root
 * stegassette, so members are noise without it — you need the root to read the
 * set. It is NOT protection against someone who holds the root. That is the
 * intent (a record you own), not a DRM claim.
 */

import { Img } from "./Img";
import { dataPixelCount } from "./Img";
import { containerInteriorBytes } from "./entries";
import { autoScaleImg, cropImg, resolveBorderWidth } from "./geometry";
import { encodeContainer } from "./container";
import { stgcHeaderWidth } from "./index";
import type { CombineName, Entry, KeymapName, StegaImageData, TraversalName } from "./types";

/**
 * Steg settings a collection encodes with by default.
 *
 * Encrypted payloads are high-entropy, so a low-strength combine keeps the
 * artwork legible underneath. Every combine here is lossless.
 */
export interface CollectionSteg {
  combine: CombineName;
  traversal: TraversalName;
  keymap: KeymapName;
  /** Fractional borders resolve against the data-pixel count — see resolveBorderWidth. */
  border: number;
}

export const COLLECTION_STEG: CollectionSteg = {
  combine: "veil" as CombineName,
  traversal: "hilbert" as TraversalName,
  keymap: "adjacent" as KeymapName,
  border: 0.02,
};

// ---- names ---------------------------------------------------

/** Filename-safe slug, capped so a member name cannot outgrow a filesystem. */
export function slug(s: string): string {
  return (
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "untitled"
  );
}

/** `n` random bytes as hex. Collection and member ids are made from this. */
export function hexId(n: number): string {
  const u8 = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- base64 --------------------------------------------------
// Written against binary strings rather than Buffer so this file stays
// environment-agnostic; `atob`/`btoa` are in Node's global scope too.

export function toBase64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- possession-based crypto ---------------------------------
// AES-GCM: 12-byte IV, 128-bit tag appended to the ciphertext.

export interface EncryptedBytes {
  /** base64 IV, stored on the member's descriptor. */
  iv: string;
  data: Uint8Array;
}

/** A fresh 256-bit key, base64. Belongs in the root stegassette's manifest. */
export const newKey = (): string =>
  toBase64(crypto.getRandomValues(new Uint8Array(32)));

export const importKey = (keyB64: string): Promise<CryptoKey> =>
  crypto.subtle.importKey("raw", fromBase64(keyB64), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);

export async function encryptBytes(
  key: CryptoKey,
  bytes: Uint8Array
): Promise<EncryptedBytes> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
  return { iv: toBase64(iv), data: new Uint8Array(out) };
}

export async function decryptBytes(
  key: CryptoKey,
  ivB64: string,
  bytes: Uint8Array
): Promise<Uint8Array> {
  const out = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivB64) },
    key,
    bytes
  );
  return new Uint8Array(out);
}

// ---- splitting one stream across members ---------------------

/**
 * Cut a byte stream into `count` roughly equal parts.
 *
 * A member's payload is a slice of one continuous stream, so concatenating the
 * parts in order returns the stream exactly — that invariant is what lets a
 * single track span as many stegassettes as you like. Splitting happens before
 * encryption: each part gets its own IV, so parts stay independently
 * decryptable.
 */
export function splitStream(bytes: Uint8Array, count: number): Uint8Array[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`splitStream: count must be a positive integer, got ${count}`);
  }
  if (count === 1) return [bytes];
  const out: Uint8Array[] = [];
  const per = Math.ceil(bytes.length / count);
  for (let i = 0; i < count; i++) {
    out.push(bytes.subarray(i * per, Math.min((i + 1) * per, bytes.length)));
  }
  return out;
}

/** Concatenate member payloads back into the original stream. */
export function joinParts(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ---- stegassette encode ----------------------------------------

/**
 * Encode entries into a stegassette carried by `srcImg`.
 *
 * This differs from `encodeImageData` in one way that matters for a
 * collection: the artwork keeps its own resolution whenever it already has
 * room for the payload. Sizing the canvas to the exact fit would turn an album
 * cover into a thumbnail, so the image is only resized when it is genuinely
 * too small.
 *
 * Self-keying — the same image is both source and key.
 */
export function encodeStegassette(
  entries: Entry[],
  srcImg: StegaImageData,
  steg: CollectionSteg = COLLECTION_STEG
): StegaImageData {
  const total = containerInteriorBytes(entries);
  const aspect = srcImg.width / srcImg.height;
  const dataPx = Math.ceil(total / 3);

  // Two border resolutions: one against the payload (used when the image has
  // to be scaled to fit) and one against the artwork's own area (used when it
  // does not), because a fractional border means "of this canvas".
  const B = resolveBorderWidth(steg.border, dataPx, aspect);
  const nativeB = resolveBorderWidth(
    steg.border,
    Math.ceil((srcImg.width * srcImg.height) / 2),
    aspect
  );

  const opts = {
    combine: steg.combine,
    keymap: steg.keymap || ("adjacent" as KeymapName),
    traversal: steg.traversal,
    params: {},
  };

  // The width the header alone needs; a small payload would otherwise size the
  // canvas below it and encoding would refuse.
  const minWidth = stgcHeaderWidth(opts);
  const capacity =
    dataPixelCount(
      srcImg.width - 2 * nativeB,
      srcImg.height - 2 * nativeB
    ) * 3;

  // An odd width orphans the last data pixel of every odd row — its key
  // reflects back in-row and collides with its neighbour's — so keeping the
  // artwork at native size is only safe on an even width. Crop a single column
  // rather than rescaling the whole picture.
  const src = new Img(srcImg.width, srcImg.height, srcImg.data);
  const evenSrc =
    src.width % 2 === 0 ? src : cropImg(src, 0, 0, src.width - 1, src.height);

  const fits = capacity >= total && evenSrc.width >= minWidth;
  const useB = fits ? nativeB : B;
  const scaled = fits
    ? evenSrc
    : autoScaleImg(src, total, B, null, 3, minWidth);

  return encodeContainer(entries, scaled, { ...opts, borderWidth: useB }, scaled);
}
