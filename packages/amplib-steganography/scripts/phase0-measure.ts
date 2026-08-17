/**
 * Phase 0 — measure before designing.
 *
 * Every Δ, carrier choice and capacity figure in Stegaprint.md is a prediction
 * derived from the standard quantization tables. This rig replaces them with
 * measurements.
 *
 * The order matters. The first table is the only ground truth: how far does a
 * real encoder actually move each coefficient? Everything else — the Δ table,
 * the carrier set, the capacity — is derived from that. Deriving Δ from the
 * *standard* tables instead was the first thing this rig disproved: encoders do
 * not have to use them, and jpeg-js does not.
 *
 * Run: npm run measure
 */

import jpeg from "jpeg-js";
import { BLOCK, ZIGZAG } from "../src/Stegaprint/dct";
import {
  blockCoeffs,
  blockDims,
  planesToRgb,
  putCoeffs,
  rgbToPlanes,
} from "../src/Stegaprint/blocks";
import { qimDecode, qimEncode } from "../src/Stegaprint/modulate";
import { stepsZigzag } from "../src/Stegaprint/quant";
import type { StegaImageData } from "../src/Stegassette/types";

// ---- deterministic test material -------------------------------

/** Mulberry32 — small, seeded, and identical across runs. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A synthetic cover with the four regions that behave differently under
 * quantization: flat (worst case for visibility, best for prediction), smooth
 * gradient, hard edges, and texture.
 */
function testImage(width: number, height: number): StegaImageData {
  const r = rng(0x5eed);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
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
  }
  return { width, height, data };
}

const REGION = ["flat", "gradient", "edges", "texture"] as const;
type Region = (typeof REGION)[number];

function regionOf(bx: number, by: number, BW: number, BH: number): Region {
  const qx = bx < BW / 2 ? 0 : 1;
  const qy = by < BH / 2 ? 0 : 1;
  if (qx === 0 && qy === 0) return "flat";
  if (qx === 1 && qy === 0) return "gradient";
  if (qx === 0 && qy === 1) return "edges";
  return "texture";
}

// ---- JPEG round trip -------------------------------------------

function jpegRoundTrip(img: StegaImageData, quality: number): StegaImageData {
  const enc = jpeg.encode(
    { data: Buffer.from(img.data), width: img.width, height: img.height },
    quality
  );
  const dec = jpeg.decode(enc.data, { useTArray: true });
  return { width: dec.width, height: dec.height, data: dec.data as Uint8Array };
}

function jpegBytes(img: StegaImageData, quality: number): number {
  return jpeg.encode(
    { data: Buffer.from(img.data), width: img.width, height: img.height },
    quality
  ).data.length;
}

// ---- coefficient perturbation: the ground truth -----------------

/** All 64 coefficients of every block, in zig-zag order. */
function allCoeffs(img: StegaImageData): Float64Array[] {
  const { BW, BH } = blockDims(img.width, img.height);
  const planes = rgbToPlanes(img);
  const raw = new Float64Array(BLOCK);
  const scratch = new Float64Array(BLOCK);
  const out: Float64Array[] = [];
  for (let by = 0; by < BH; by++) {
    for (let bx = 0; bx < BW; bx++) {
      blockCoeffs(planes.y, planes.width, bx, by, raw, scratch);
      const z = new Float64Array(BLOCK);
      for (let i = 0; i < BLOCK; i++) z[i] = raw[ZIGZAG[i]];
      out.push(z);
    }
  }
  return out;
}

function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[i];
}

interface Perturbation {
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

/** |Δc| distribution per zig-zag index, cover → JPEG(q) → cover. */
function measurePerturbation(
  cover: StegaImageData,
  quality: number
): Perturbation[] {
  const before = allCoeffs(cover);
  const after = allCoeffs(jpegRoundTrip(cover, quality));
  const out: Perturbation[] = [];
  for (let i = 0; i < BLOCK; i++) {
    const d: number[] = [];
    for (let b = 0; b < before.length; b++) d.push(Math.abs(after[b][i] - before[b][i]));
    d.sort((a, b) => a - b);
    out.push({
      p50: quantile(d, 0.5),
      p95: quantile(d, 0.95),
      p99: quantile(d, 0.99),
      max: d[d.length - 1],
    });
  }
  return out;
}

// ---- embed / extract -------------------------------------------

interface EmbedResult {
  image: StegaImageData;
  symbols: Uint8Array;
  iterations: number;
}

/**
 * Embed one symbol per block at `carrier`, iterating to convergence (§10.2):
 * setting a coefficient in the DCT domain and rounding the inverse back to
 * 8-bit perturbs the very coefficient just set.
 */
function embed(
  cover: StegaImageData,
  carrier: number,
  M: number,
  delta: number,
  maxIterations = 8
): EmbedResult {
  const { BW, BH } = blockDims(cover.width, cover.height);
  const nBlocks = BW * BH;
  const r = rng(0xc0ffee);
  const symbols = new Uint8Array(nBlocks);
  for (let i = 0; i < nBlocks; i++) symbols[i] = Math.floor(r() * M) % M;

  const raster = ZIGZAG[carrier];
  const planes = rgbToPlanes(cover);
  const coeffs = new Float64Array(BLOCK);
  const scratch = new Float64Array(BLOCK);
  let iterations = 0;

  for (let pass = 0; pass < maxIterations; pass++) {
    iterations = pass + 1;
    for (let by = 0; by < BH; by++) {
      for (let bx = 0; bx < BW; bx++) {
        blockCoeffs(planes.y, planes.width, bx, by, coeffs, scratch);
        coeffs[raster] = qimEncode(coeffs[raster], symbols[by * BW + bx], M, delta);
        putCoeffs(planes.y, planes.width, bx, by, coeffs, scratch);
      }
    }
    const rgb = planesToRgb(planes);
    const back = rgbToPlanes(rgb);
    planes.y.set(back.y);
    planes.cb.set(back.cb);
    planes.cr.set(back.cr);

    let clean = true;
    outer: for (let by = 0; by < BH; by++) {
      for (let bx = 0; bx < BW; bx++) {
        blockCoeffs(planes.y, planes.width, bx, by, coeffs, scratch);
        if (qimDecode(coeffs[raster], M, delta) !== symbols[by * BW + bx]) {
          clean = false;
          break outer;
        }
      }
    }
    if (clean) break;
  }

  return { image: planesToRgb(planes), symbols, iterations };
}

function extract(
  img: StegaImageData,
  carrier: number,
  M: number,
  delta: number,
  expected: Uint8Array
): { ser: number; byRegion: Record<Region, number> } {
  const { BW, BH } = blockDims(img.width, img.height);
  const raster = ZIGZAG[carrier];
  const planes = rgbToPlanes(img);
  const coeffs = new Float64Array(BLOCK);
  const scratch = new Float64Array(BLOCK);

  let errors = 0;
  const errs: Record<string, number> = {};
  const totals: Record<string, number> = {};
  for (const k of REGION) { errs[k] = 0; totals[k] = 0; }

  for (let by = 0; by < BH; by++) {
    for (let bx = 0; bx < BW; bx++) {
      blockCoeffs(planes.y, planes.width, bx, by, coeffs, scratch);
      const got = qimDecode(coeffs[raster], M, delta);
      const reg = regionOf(bx, by, BW, BH);
      totals[reg]++;
      if (got !== expected[by * BW + bx]) { errors++; errs[reg]++; }
    }
  }
  const byRegion = {} as Record<Region, number>;
  for (const k of REGION) byRegion[k] = totals[k] ? errs[k] / totals[k] : 0;
  return { ser: errors / (BW * BH), byRegion };
}

/**
 * Embed into several carriers of the same block at once.
 *
 * Separate from `embed` on purpose: carriers are not independent. Writing one
 * coefficient, inverting, and rounding to 8-bit perturbs every *other*
 * coefficient in the block, so the convergence loop has to satisfy all of them
 * simultaneously rather than one at a time. Measuring carriers in isolation and
 * summing is the mistake this function exists to avoid.
 */
function embedMulti(
  cover: StegaImageData,
  carriers: number[],
  deltas: number[],
  M: number,
  maxIterations = 12
): { image: StegaImageData; symbols: Uint8Array; iterations: number } {
  const { BW, BH } = blockDims(cover.width, cover.height);
  const nBlocks = BW * BH;
  const perBlock = carriers.length;
  const r = rng(0xc0ffee);
  const symbols = new Uint8Array(nBlocks * perBlock);
  for (let i = 0; i < symbols.length; i++) symbols[i] = Math.floor(r() * M) % M;

  const raster = carriers.map((c) => ZIGZAG[c]);
  const planes = rgbToPlanes(cover);
  const coeffs = new Float64Array(BLOCK);
  const scratch = new Float64Array(BLOCK);
  let iterations = 0;

  for (let pass = 0; pass < maxIterations; pass++) {
    iterations = pass + 1;
    for (let by = 0; by < BH; by++) {
      for (let bx = 0; bx < BW; bx++) {
        const base = (by * BW + bx) * perBlock;
        blockCoeffs(planes.y, planes.width, bx, by, coeffs, scratch);
        for (let k = 0; k < perBlock; k++)
          coeffs[raster[k]] = qimEncode(coeffs[raster[k]], symbols[base + k], M, deltas[k]);
        putCoeffs(planes.y, planes.width, bx, by, coeffs, scratch);
      }
    }
    const back = rgbToPlanes(planesToRgb(planes));
    planes.y.set(back.y);
    planes.cb.set(back.cb);
    planes.cr.set(back.cr);

    let clean = true;
    outer: for (let by = 0; by < BH; by++) {
      for (let bx = 0; bx < BW; bx++) {
        const base = (by * BW + bx) * perBlock;
        blockCoeffs(planes.y, planes.width, bx, by, coeffs, scratch);
        for (let k = 0; k < perBlock; k++)
          if (qimDecode(coeffs[raster[k]], M, deltas[k]) !== symbols[base + k]) {
            clean = false;
            break outer;
          }
      }
    }
    if (clean) break;
  }
  return { image: planesToRgb(planes), symbols, iterations };
}

function extractMulti(
  img: StegaImageData,
  carriers: number[],
  deltas: number[],
  M: number,
  expected: Uint8Array
): number {
  const { BW, BH } = blockDims(img.width, img.height);
  const raster = carriers.map((c) => ZIGZAG[c]);
  const perBlock = carriers.length;
  const planes = rgbToPlanes(img);
  const coeffs = new Float64Array(BLOCK);
  const scratch = new Float64Array(BLOCK);
  let errors = 0;
  for (let by = 0; by < BH; by++) {
    for (let bx = 0; bx < BW; bx++) {
      const base = (by * BW + bx) * perBlock;
      blockCoeffs(planes.y, planes.width, bx, by, coeffs, scratch);
      for (let k = 0; k < perBlock; k++)
        if (qimDecode(coeffs[raster[k]], M, deltas[k]) !== expected[base + k]) errors++;
    }
  }
  return errors / (BW * BH * perBlock);
}

function psnr(a: StegaImageData, b: StegaImageData): number {
  let sum = 0, n = 0;
  for (let i = 0; i < a.data.length; i += 4)
    for (let c = 0; c < 3; c++) {
      const d = a.data[i + c] - b.data[i + c];
      sum += d * d;
      n++;
    }
  const mse = sum / n;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

// ---- runs ------------------------------------------------------

const W = 512, H = 512;
const QUALITIES = [95, 85, 75, 60, 50, 40];
const Q_FLOOR = 75;
const CARRIERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20];

function pct(v: number): string {
  if (v === 0) return "·";
  if (v < 0.0001) return "<.01%";
  return (v * 100).toFixed(2) + "%";
}
const pad = (s: string | number, n: number) => String(s).padStart(n);

function main() {
  const cover = testImage(W, H);
  const { BW, BH } = blockDims(W, H);
  console.log("# Stegaprint phase 0\n");
  console.log(`cover ${W}×${H}, ${BW}×${BH} = ${BW * BH} blocks, encoder: jpeg-js`);
  console.log(
    `cover as JPEG: ` +
      QUALITIES.map((q) => `Q${q} ${(jpegBytes(cover, q) / 1024).toFixed(0)}KB`).join("  ")
  );

  // ---- 1. ground truth: how far does the encoder actually move each coefficient?
  console.log("\n\n## 1. Coefficient perturbation |Δc| — cover → JPEG(q) → cover\n");
  console.log("p99 of |Δc| per zig-zag index. This is the only measured quantity;");
  console.log("everything below is derived from it.\n");
  const perturb: Record<number, Perturbation[]> = {};
  for (const q of QUALITIES) perturb[q] = measurePerturbation(cover, q);

  console.log(
    "car " + QUALITIES.map((q) => pad(`Q${q}`, 8)).join("") + "   (std q@Q75)"
  );
  console.log("-".repeat(4 + QUALITIES.length * 8 + 15));
  const stdSteps = stepsZigzag(Q_FLOOR, "luma");
  for (const c of CARRIERS) {
    console.log(
      pad(c, 3) +
        " " +
        QUALITIES.map((q) => pad(perturb[q][c].p99.toFixed(1), 8)).join("") +
        pad(stdSteps[c], 12)
    );
  }

  // ---- 2. Δ required, from the measurement
  console.log("\n\n## 2. Δ required for M=4, from measured p99 (Δ = 2·M·p99)\n");
  console.log("car " + QUALITIES.map((q) => pad(`Q${q}`, 8)).join("") + "   (std model)");
  console.log("-".repeat(4 + QUALITIES.length * 8 + 15));
  for (const c of CARRIERS) {
    console.log(
      pad(c, 3) +
        " " +
        QUALITIES.map((q) => pad(Math.ceil(2 * 4 * perturb[q][c].p99), 8)).join("") +
        pad(2 * 4 * stdSteps[c], 12)
    );
  }

  // ---- 3. does it actually survive at the measured Δ?
  for (const M of [2, 4]) {
    console.log(`\n\n## 3. Symbol error rate — M=${M}, Δ from measured p99 at Q${Q_FLOOR}\n`);
    const head =
      "car " + pad("Δ", 5) + pad("PSNR", 6) + pad("iter", 5) + pad("lossless", 10) +
      QUALITIES.map((q) => pad(`Q${q}`, 9)).join("");
    console.log(head);
    console.log("-".repeat(head.length));
    for (const c of CARRIERS) {
      const delta = Math.max(4, Math.ceil(2 * M * perturb[Q_FLOOR][c].p99));
      const { image, symbols, iterations } = embed(cover, c, M, delta);
      const row =
        pad(c, 3) + pad(delta, 6) + pad(psnr(cover, image).toFixed(1), 6) +
        pad(iterations, 5) +
        pad(pct(extract(image, c, M, delta, symbols).ser), 10);
      const cells = QUALITIES.map((q) =>
        pad(pct(extract(jpegRoundTrip(image, q), c, M, delta, symbols).ser), 9)
      );
      console.log(row + cells.join(""));
    }
  }

  // ---- 4. region breakdown at the proposed defaults
  console.log(`\n\n## 4. Region breakdown — M=4, Δ from Q${Q_FLOOR} p99, re-encoded at Q${Q_FLOOR}\n`);
  console.log("car " + REGION.map((r) => pad(r, 10)).join(""));
  console.log("-".repeat(4 + REGION.length * 10));
  for (const c of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const delta = Math.max(4, Math.ceil(8 * perturb[Q_FLOOR][c].p99));
    const { image, symbols } = embed(cover, c, 4, delta);
    const { byRegion } = extract(jpegRoundTrip(image, Q_FLOOR), c, 4, delta, symbols);
    console.log(pad(c, 3) + REGION.map((r) => pad(pct(byRegion[r]), 10)).join(""));
  }

  // ---- 5. how much Δ does zero actually cost?
  //
  // p99 leaves 1% of coefficients outside the tolerance by construction, so
  // "Δ = 2·M·p99" can never reach zero. This sweeps the safety factor to find
  // where it does, and what that costs in visibility.
  console.log(`\n\n## 5. Δ sweep — M=4, safety × p99(Q${Q_FLOOR}), SER at Q${Q_FLOOR}\n`);
  const CAND = [0, 2, 4, 7, 8, 12];
  const SAFETY = [2, 3, 4, 6, 8];
  console.log(
    "car " + SAFETY.map((s) => pad(`${s}×`, 16)).join("") + "     (Δ / SER / PSNR)"
  );
  console.log("-".repeat(4 + SAFETY.length * 16));
  for (const c of CAND) {
    const cells = SAFETY.map((s) => {
      const delta = Math.max(4, Math.ceil(s * 4 * perturb[Q_FLOOR][c].p99));
      const { image, symbols } = embed(cover, c, 4, delta);
      const ser = extract(jpegRoundTrip(image, Q_FLOOR), c, 4, delta, symbols).ser;
      return pad(`${delta}/${pct(ser)}/${psnr(cover, image).toFixed(0)}`, 16);
    });
    console.log(pad(c, 3) + cells.join(""));
  }

  // ---- 6. chained re-encode — the case a single round trip flatters
  const CHAINS: Array<number[]> = [[75], [75, 75], [75, 75, 75], [85, 75, 60], [60], [60, 60]];
  console.log(`\n\n## 6. Carrier selection — M=4, safety 4×, one carrier at a time\n`);
  console.log("car " + pad("Δ", 5) + CHAINS.map((c) => pad(c.join("→"), 12)).join(""));
  console.log("-".repeat(9 + CHAINS.length * 12));
  for (let c = 0; c <= 20; c++) {
    const delta = Math.max(4, Math.ceil(4 * 4 * perturb[Q_FLOOR][c].p99));
    const { image, symbols } = embed(cover, c, 4, delta);
    const cells = CHAINS.map((chain) => {
      let img = image;
      for (const q of chain) img = jpegRoundTrip(img, q);
      return pad(pct(extract(img, c, 4, delta, symbols).ser), 12);
    });
    console.log(pad(c, 3) + pad(delta, 5) + cells.join(""));
  }

  // ---- 7. all carriers at once — the actual format
  //
  // Every table above measures one carrier in isolation. The format runs them
  // together, and they are not independent: each one's inverse DCT perturbs
  // every other one's coefficient in the same block. This is the number that
  // decides phase 1, and the only one that includes the real visibility cost.
  console.log(`\n\n## 7. Full carrier set together — M=4, safety 4×\n`);
  for (const set of [
    [4, 7, 8, 12],
    [2, 4, 7, 8, 12],
    [2, 3, 4, 6, 7, 8, 12],
    [1, 2, 3, 4, 5, 6, 7, 8],
  ]) {
    const deltas = set.map((c) =>
      Math.max(4, Math.ceil(16 * perturb[Q_FLOOR][c].p99))
    );
    const { image, symbols, iterations } = embedMulti(cover, set, deltas, 4);
    const bits = set.length * 2;
    const bytesPerBlock = bits / 8;
    const kb = ((BW * BH * bytesPerBlock) / 1024).toFixed(1);
    console.log(
      `carriers [${set.join(",")}]  ${bits} bits/block  ` +
        `${kb}KB raw @${W}×${H}  PSNR ${psnr(cover, image).toFixed(1)}  ` +
        `iter ${iterations}  jpeg ${(jpegBytes(image, 75) / 1024).toFixed(0)}KB`
    );
    const cells = CHAINS.map((chain) => {
      let img = image;
      for (const q of chain) img = jpegRoundTrip(img, q);
      return `${chain.join("→")} ${pct(extractMulti(img, set, deltas, 4, symbols))}`;
    });
    console.log("   lossless " + pct(extractMulti(image, set, deltas, 4, symbols)) +
      "   " + cells.join("   "));
  }
}

main();
