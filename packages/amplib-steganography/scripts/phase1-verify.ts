/**
 * Phase 1 success criteria, from Stegaprint.md §12.
 *
 *   1. lossless round trip is bit-exact — if this fails nothing else means
 *      anything;
 *   2. 2048² round-trips 8 KB of text through a Q75 re-encode with zero errors;
 *   3. and through Q75 → Q75 → Q75 chained, which is the case that catches an
 *      embedding surviving only because it was the first one.
 *
 * Run: npm run verify
 */

import jpeg from "jpeg-js";
import { capacity, decode, encode, fitSource } from "../src/Stegaprint/container";
import { EntryType } from "../src/Stegaprint/records";
import type { PrintEntry } from "../src/Stegaprint/records";
import type { StegaImageData } from "../src/Stegassette/types";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function testImage(width: number, height: number): StegaImageData {
  const r = rng(0x5eed);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const qx = x < width / 2 ? 0 : 1;
      const qy = y < height / 2 ? 0 : 1;
      let v: number;
      if (qx === 0 && qy === 0) v = 128;
      else if (qx === 1 && qy === 0) v = (x / width) * 255;
      else if (qx === 0 && qy === 1)
        v = (Math.floor(x / 23) + Math.floor(y / 19)) % 2 ? 40 : 215;
      else v = 60 + r() * 160;
      data[i] = v;
      data[i + 1] = v * 0.9 + 12;
      data[i + 2] = v * 0.8 + 30;
      data[i + 3] = 255;
    }
  return { width, height, data };
}

function jpegRoundTrip(img: StegaImageData, quality: number): StegaImageData {
  const enc = jpeg.encode(
    { data: Buffer.from(img.data), width: img.width, height: img.height },
    quality
  );
  const dec = jpeg.decode(enc.data, { useTArray: true });
  return { width: dec.width, height: dec.height, data: dec.data as Uint8Array };
}

function jpegKB(img: StegaImageData, q: number): number {
  return (
    jpeg.encode({ data: Buffer.from(img.data), width: img.width, height: img.height }, q)
      .data.length / 1024
  );
}

/**
 * PSNR over the interior only.
 *
 * Whole-image PSNR is meaningless for this format: the fiducial border replaces
 * ~10% of the pixels with full-contrast black and white *on purpose* (§6.1), and
 * it dominates the number — 15 dB for an image whose interior is at 32. What a
 * viewer judges as "how much did the picture change" is the interior, so that is
 * what gets measured; the border is a design element, not an error.
 */
function interiorPsnr(
  a: StegaImageData,
  b: StegaImageData,
  border: number
): number {
  const B = border * 8;
  let sum = 0, n = 0;
  for (let y = B; y < a.height - B; y++)
    for (let x = B; x < a.width - B; x++) {
      const i = (y * a.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const d = a.data[i + c] - b.data[i + c];
        sum += d * d;
        n++;
      }
    }
  const mse = sum / n;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

/** Deterministic filler text — 8 KB of it, and readable so damage is obvious. */
function makeText(bytes: number): string {
  const words =
    "a print is a picture made to be reproduced and passed around which " +
    "survives copying and wears a visible mark saying what it is ".split(" ").join(" ");
  let s = "";
  let i = 0;
  while (s.length < bytes) s += `${i++} ${words} `;
  return s.slice(0, bytes);
}

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function main() {
  const TEXT_BYTES = 8 * 1024;
  const text = makeText(TEXT_BYTES);
  const payload = new TextEncoder().encode(text);
  const entries: PrintEntry[] = [
    { type: EntryType.Text, name: "message.txt", data: payload },
  ];

  console.log("# Stegaprint phase 1 verification\n");

  // ---- criterion 1: lossless round trip is bit-exact
  console.log("## 1. Lossless round trip\n");
  const src = testImage(2048, 2048);
  const t0 = Date.now();
  const enc = encode({ source: src, entries });
  const encMs = Date.now() - t0;
  // The canvas is sized by the payload, not by the source, so the cover has to
  // be brought to the encoded dimensions before PSNR means anything.
  const cover = fitSource(src, enc.width / 8, enc.height / 8);
  const back = decode(enc);
  console.log(
    `  encoded ${enc.width}×${enc.height} (canvas is payload-sized, not source-sized)` +
      `  ${(encMs / 1000).toFixed(1)}s` +
      `  interior PSNR ${interiorPsnr(cover, enc, back.header.border).toFixed(1)}dB` +
      `  border ${back.header.border} blocks` +
      `  jpeg@Q75 ${jpegKB(enc, 75).toFixed(0)}KB`
  );
  check("header round-trips", back.header.entryCount === 1);
  check("corner marks register", back.registered);
  check("one entry recovered", back.entries.length === 1);
  const got = back.entries[0];
  check(
    "payload bit-exact",
    bytesEqual(got.data.subarray(0, payload.length), payload),
    `${got.data.length} bytes back, crcOk=${got.crcOk}`
  );
  check("name round-trips", got.name === "message.txt", got.name);
  check("mimetype resolves", got.mimetype === "text/plain", got.mimetype);

  // ---- criteria 2 & 3: JPEG, and JPEG chained
  console.log("\n## 2/3. JPEG re-encode\n");
  const CHAINS: Array<number[]> = [
    [95], [85], [75], [75, 75], [75, 75, 75], [60], [60, 60], [85, 75, 60], [50],
  ];
  for (const chain of CHAINS) {
    let img = enc;
    for (const q of chain) img = jpegRoundTrip(img, q);
    let label = chain.join("→");
    try {
      const r = decode(img);
      const e = r.entries[0];
      const exact = e && bytesEqual(e.data.subarray(0, payload.length), payload);
      let diff = 0;
      if (e) {
        const n = Math.min(e.data.length, payload.length);
        for (let i = 0; i < n; i++) if (e.data[i] !== payload[i]) diff++;
      }
      const critical = chain.every((q) => q === 75);
      const ok = exact;
      if (critical) check(`Q${label} exact`, !!ok, `${diff} bad bytes`);
      else
        console.log(
          `  ${ok ? "PASS" : "····"}  Q${label}` +
            `  ${diff} bad bytes of ${payload.length}` +
            `  (${((diff / payload.length) * 100).toFixed(2)}%)`
        );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (chain.every((q) => q === 75)) check(`Q${label} exact`, false, msg);
      else console.log(`  ····  Q${label}  decode failed: ${msg}`);
    }
  }

  // ---- capacity, against the predictions in Stegaprint.md §3
  console.log("\n## 4. Capacity vs. the §3 table\n");
  const PREDICTED: Record<string, [number, number]> = {
    // size → [keyed KB, keyless KB] as predicted by the document
    "1024": [11, 21],
    "1600": [26, 53],
    "2048": [43, 86],
    "4096": [172, 344],
  };
  console.log("  size      keyed (pred)     keyless (pred)");
  for (const [size, [pk, pl]] of Object.entries(PREDICTED)) {
    const n = Number(size);
    const keyed = capacity(n, n).bytes / 1024;
    const keyless = capacity(n, n, { keymap: "none" }).bytes / 1024;
    console.log(
      `  ${size.padStart(4)}²  ` +
        `${keyed.toFixed(0).padStart(6)}KB (${String(pk).padStart(3)})  ` +
        `${keyless.toFixed(0).padStart(8)}KB (${String(pl).padStart(3)})`
    );
  }

  // ---- fill the interior, to prove the capacity number is real
  console.log("\n## 5. Full-capacity round trip at 1024²\n");
  const cap = capacity(1024, 1024);
  for (const frac of [0.5, 0.9, 1.0]) {
    const want = Math.floor((cap.bytes - 64) * frac);
    const bigPayload = new TextEncoder().encode(makeText(want));
    try {
      const bigEnc = encode({
        source: testImage(1024, 1024),
        entries: [{ type: EntryType.Text, name: "full.txt", data: bigPayload }],
        // Force the exact canvas so this measures capacity() rather than
        // measuring the payload-driven sizing that would just grow past it.
        width: 1024,
        height: 1024,
      });
      const lossless = decode(bigEnc);
      const jpg = decode(jpegRoundTrip(bigEnc, 75));
      const cmp = (r: typeof jpg) => {
        const d = r.entries[0]?.data;
        if (!d) return -1;
        let bad = 0;
        for (let i = 0; i < bigPayload.length; i++)
          if (d[i] !== bigPayload[i]) bad++;
        return bad;
      };
      const lossBad = cmp(lossless), jpgBad = cmp(jpg);
      check(
        `${(bigPayload.length / 1024).toFixed(1)}KB (${(frac * 100).toFixed(0)}% of capacity) survives Q75`,
        jpgBad === 0,
        `${bigEnc.width}×${bigEnc.height} border=${lossless.header.border}b ` +
          `lossless ${lossBad} bad, jpeg ${jpgBad} bad`
      );
    } catch (err) {
      check(`${(frac * 100).toFixed(0)}% of capacity`, false, String(err));
    }
  }

  // ---- variants that are built but not the default, so nothing ships untested
  console.log("\n## 6. Non-default variants\n");
  type Variant = Omit<Parameters<typeof encode>[0], "source" | "entries">;
  const VARIANTS: Array<[string, Variant]> = [
    ["modulate=pair", { modulate: "pair" }],
    ["keymap=none (keyless)", { keymap: "none" }],
    ["ecc=none", { ecc: "none" }],
    ["ecc=full", { ecc: "full" }],
    ["traversal=hilbert", { traversal: "hilbert" }],
    ["traversal=fisher-yates", { traversal: "fisher-yates", seed: 12345 }],
    ["keymap=mirror-x", { keymap: "mirror-x" }],
    ["M=2", { M: 2 }],
  ];
  for (const [label, extra] of VARIANTS) {
    try {
      const e = encode({ source: src, entries, ...extra });
      const lossless = decode(e).entries[0];
      const jpg = decode(jpegRoundTrip(e, 75)).entries[0];
      const okLossless = bytesEqual(lossless.data.subarray(0, payload.length), payload);
      const okJpeg = bytesEqual(jpg.data.subarray(0, payload.length), payload);
      check(
        label,
        okLossless && okJpeg,
        `${e.width}×${e.height}  lossless ${okLossless ? "ok" : "BAD"}, Q75 ${okJpeg ? "ok" : "BAD"}`
      );
    } catch (err) {
      check(label, false, err instanceof Error ? err.message : String(err));
    }
  }

  console.log(
    `\n${failures === 0 ? "All phase 1 criteria met." : `${failures} FAILURE(S).`}`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
