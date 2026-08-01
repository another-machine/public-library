"use strict";
var Stegassette = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/stegassette.ts
  var stegassette_exports = {};
  __export(stegassette_exports, {
    CHANNEL_NAMES: () => CHANNEL_NAMES,
    CODEC_VERSION: () => CODEC_VERSION,
    COMBINE: () => COMBINE,
    COMBINE_NAMES: () => COMBINE_NAMES,
    ENCODE_OP: () => ENCODE_OP,
    Img: () => Img,
    KEYLESS_KEYMAPS: () => KEYLESS_KEYMAPS,
    KEYMAP: () => KEYMAP,
    KEYMAP_NAMES: () => KEYMAP_NAMES,
    KEY_FIELD: () => KEY_FIELD,
    KEY_MOD: () => KEY_MOD,
    KEY_PRESERVING: () => KEY_PRESERVING,
    LOSSLESS_COMBINES: () => LOSSLESS_COMBINES,
    NORMALIZE_DEFAULT_DB: () => NORMALIZE_DEFAULT_DB,
    PACK_NAMES: () => PACK_NAMES,
    RevealPlayer: () => RevealPlayer,
    RevealSurface: () => RevealSurface,
    STGC_MAGIC: () => STGC_MAGIC,
    STGC_VERSION: () => STGC_VERSION,
    SeekableReveal: () => SeekableReveal,
    TRAVERSAL_NAMES: () => TRAVERSAL_NAMES,
    animateReveal: () => animateReveal,
    applyAlphaHeader: () => applyAlphaHeader,
    autoScaleImg: () => autoScaleImg,
    borderPixelCount: () => borderPixelCount,
    buildAudioEntry: () => buildAudioEntry,
    buildAudioMime: () => buildAudioMime,
    buildDescriptor: () => buildDescriptor,
    buildInteriorStream: () => buildInteriorStream,
    canvasFromImageData: () => canvasFromImageData,
    computeRevealOrder: () => computeRevealOrder,
    containerInteriorBytes: () => containerInteriorBytes,
    createRevealPlayer: () => createRevealPlayer,
    createSeekableReveal: () => createSeekableReveal,
    cropImg: () => cropImg,
    dataPixelCount: () => dataPixelCount,
    decode: () => decode,
    decodeContainer: () => decodeContainer,
    decodeImageData: () => decodeImageData,
    deinterleave: () => deinterleave,
    encode: () => encode,
    encodeContainer: () => encodeContainer,
    encodeImageData: () => encodeImageData,
    entryTableSize: () => entryTableSize,
    float32ToPcm: () => float32ToPcm,
    getBorderPixels: () => getBorderPixels,
    getPath: () => getPath,
    getPathIndices: () => getPathIndices,
    imgFromSource: () => imgFromSource,
    interiorDims: () => interiorDims,
    isAudioEntry: () => isAudioEntry,
    isBorderPixel: () => isBorderPixel,
    isDataPixel: () => isDataPixel,
    isDefaultPlan: () => isDefaultPlan,
    isKeylessKeymap: () => isKeylessKeymap,
    layoutChannels: () => layoutChannels,
    normalizeChannelPlan: () => normalizeChannelPlan,
    packStgcHeader: () => packStgcHeader,
    parseAudioEntry: () => parseAudioEntry,
    parseAudioMime: () => parseAudioMime,
    parseChannelPlan: () => parseChannelPlan,
    parseDescriptor: () => parseDescriptor,
    parseEntryTable: () => parseEntryTable,
    peakNormalize: () => peakNormalize,
    prepareAudioEntry: () => prepareAudioEntry,
    reconstructCover: () => reconstructCover,
    resolveAudioRates: () => resolveAudioRates,
    resolveBorderWidth: () => resolveBorderWidth,
    resolveKeyField: () => resolveKeyField,
    resolveKeymapName: () => resolveKeymapName,
    resolveNormalize: () => resolveNormalize,
    revealSpanForEntry: () => revealSpanForEntry,
    scaleImg: () => scaleImg,
    serializeChannelPlan: () => serializeChannelPlan,
    stgcHeaderWidth: () => stgcHeaderWidth,
    toFloat32: () => toFloat32,
    unlayoutChannels: () => unlayoutChannels,
    unpackStgcHeaderAlpha: () => unpackStgcHeaderAlpha
  });

  // src/utilities.ts
  function getContext(canvas2) {
    return canvas2.getContext("2d", {
      colorSpace: "display-p3",
      willReadFrequently: true
    });
  }
  function createCanvasAndContext(width, height) {
    const canvas2 = document.createElement("canvas");
    canvas2.width = width || 0;
    canvas2.height = height || 0;
    const context = getContext(canvas2);
    context.imageSmoothingEnabled = false;
    return { canvas: canvas2, context };
  }

  // src/Stegassette/Img.ts
  var Img = class {
    width;
    height;
    data;
    constructor(width, height, data) {
      this.width = width;
      this.height = height;
      this.data = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
    }
    /** Returns [r, g, b] for pixel (x, y), clamped to image bounds. */
    get(x, y) {
      x = Math.max(0, Math.min(this.width - 1, x | 0));
      y = Math.max(0, Math.min(this.height - 1, y | 0));
      const o = (y * this.width + x) * 4;
      return [this.data[o], this.data[o + 1], this.data[o + 2]];
    }
    /** Writes [r, g, b] to pixel (x, y) and forces alpha = 255. */
    set(x, y, r, g, b) {
      const o = (y * this.width + x) * 4;
      this.data[o] = r;
      this.data[o + 1] = g;
      this.data[o + 2] = b;
      this.data[o + 3] = 255;
    }
    /** Returns the alpha of pixel (x, y), clamped to image bounds. */
    getAlpha(x, y) {
      x = Math.max(0, Math.min(this.width - 1, x | 0));
      y = Math.max(0, Math.min(this.height - 1, y | 0));
      return this.data[(y * this.width + x) * 4 + 3];
    }
    /** Writes alpha to pixel (x, y). */
    setAlpha(x, y, a) {
      this.data[(y * this.width + x) * 4 + 3] = a & 255;
    }
  };
  function isDataPixel(x, y) {
    return y % 2 === 0 ? x % 2 === 1 : x % 2 === 0;
  }
  function isBorderPixel(x, y, W, H, B) {
    return x < B || x >= W - B || y < B || y >= H - B;
  }
  function getBorderPixels(W, H, B) {
    const px = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (isBorderPixel(x, y, W, H, B)) px.push([x, y]);
    return px;
  }
  function dataPixelCount(W, H) {
    return Math.floor(W / 2) * Math.ceil(H / 2) + Math.ceil(W / 2) * Math.floor(H / 2);
  }
  function borderPixelCount(W, H, B) {
    return W * H - (W - 2 * B) * (H - 2 * B);
  }

  // src/Stegassette/combine.ts
  var COMBINE_NAMES = [
    "xor",
    "additive",
    "subtractive",
    "midpoint",
    "difference",
    "bitshift",
    "noise",
    "echo",
    "signed",
    "veil",
    "whisper"
  ];
  var COMBINE = {
    xor: (e, k) => e ^ k,
    additive: (e, k) => e - k & 255,
    subtractive: (e, k) => k - e + 256 & 255,
    midpoint: (e, k) => e * 2 - k & 255,
    // key pixel stores the circular midpoint; data = key − audio (mod 256)
    difference: (e, k) => k - e + 256 & 255,
    // key is unchanged; low 3 bits of key determined the rotation
    bitshift: (e, k) => {
      const s = k & 7;
      return (e >>> s | e << 8 - s) & 255;
    },
    // both pixels moved to flank audio value; midpoint of final pair = audio
    noise: (e, k) => Math.round(Math.abs(e - k) / 2 + Math.min(e, k)),
    // data pixel carries audio verbatim; key pixel = origKey ^ audio (see KEY_MOD)
    echo: (e, _k) => e,
    // silence (128) leaves the pixel untouched; amplitude displaces ±
    signed: (e, k) => e - k + 128 & 255,
    // blend is 25% audio / 75% key; key stashes audio's low 2 bits
    veil: (e, k) => 4 * e - 3 * k & 255,
    // audio high nibble in data pixel low nibble; high nibbles of both pixels untouched
    whisper: (e, k) => (e & 15) << 4 | k & 15
  };
  var ENCODE_OP = {
    xor: (a, k) => a ^ k,
    additive: (a, k) => a + k & 255,
    subtractive: (a, k) => k - a + 256 & 255,
    midpoint: (a, k) => a + k >> 1,
    // mk = modified key (from KEY_MOD.difference); data = mk − audio (mod 256)
    difference: (a, mk) => mk - a + 256 & 255,
    // rotate audio left by (key & 7); key pixel untouched so shift is recoverable on decode
    bitshift: (a, k) => {
      const s = k & 7;
      return (a << s | a >>> 8 - s) & 255;
    },
    // mk = audio + floor(usedSpace/2); data mirrors same distance below audio
    noise: (a, mk) => 2 * a - mk + 256 & 255,
    // data pixel carries audio verbatim (key is set to origKey^audio by KEY_MOD)
    echo: (a, _mk) => a,
    // data shifts by (audio − 128) so silence (128) is invisible
    signed: (a, k) => a + k + 128 & 255,
    // key stashes low 2 bits; blend is 25% audio, 75% key
    veil: (a, mk) => a + 3 * mk >> 2,
    // audio high nibble → data low nibble; keep data high nibble from original data pixel
    whisper: (a, _mk, e = 0) => e & 240 | a >> 4
  };
  var KEY_MOD = {
    midpoint: (a, k) => k & 254 | a & 1,
    // key becomes origKey XOR audio — a high-contrast, perfectly reversible ghost
    echo: (a, k) => k ^ a,
    // spread the two pixels symmetrically around their midpoint by `a` steps
    difference: (a, k, e = 0) => {
      let ks = k;
      if (ks < e) ks += 256;
      const mid = Math.round((ks - e) / 2 + e);
      return (mid + (a >> 1)) % 256;
    },
    // use existing pixel contrast as carrier amplitude; key moves to audio + half of usable space
    noise: (a, k, e = 0) => {
      const space = Math.abs(e - k);
      const usedSpace = Math.min(space, 2 * Math.min(a, 255 - a));
      return (a + Math.floor(usedSpace * 0.5)) % 256;
    },
    // key stashes audio's low 2 bits; blend is 25% audio (quarter-strength ghost)
    veil: (a, k) => k & 252 | a & 3,
    // key stashes audio's low nibble; data keeps its high nibble (max delta 15)
    whisper: (a, k) => k & 240 | a & 15
  };
  var LOSSLESS_COMBINES = [
    "xor",
    "additive",
    "subtractive",
    "bitshift",
    "signed",
    "echo",
    "veil",
    "whisper",
    "midpoint"
  ];

  // src/Stegassette/entries.ts
  function toU8(data) {
    if (!data) return new Uint8Array(0);
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (typeof data === "string") return new TextEncoder().encode(data);
    return new Uint8Array(data);
  }
  function entryTableSize(entries) {
    const enc = new TextEncoder();
    let n = 0;
    for (const e of entries)
      n += 2 + enc.encode(e.mimetype || "application/octet-stream").length + 2 + enc.encode(e.name || "").length + 4;
    return n;
  }
  function containerInteriorBytes(entries) {
    const enc = new TextEncoder();
    let total = 0;
    for (const e of entries) {
      total += 2 + enc.encode(e.mimetype || "application/octet-stream").length;
      total += 2 + enc.encode(e.name || "").length;
      total += 4;
      total += e.data ? toU8(e.data).length : 0;
    }
    return total;
  }
  function buildInteriorStream(entries, pad = 0) {
    const enc = new TextEncoder();
    const norm = entries.map((e) => ({
      mt: enc.encode(e.mimetype || "application/octet-stream"),
      nm: enc.encode(e.name || ""),
      data: toU8(e.data)
    }));
    let tableSize = 0;
    for (const r of norm) tableSize += 2 + r.mt.length + 2 + r.nm.length + 4;
    const totalPayload = norm.reduce((s, r) => s + r.data.length, 0);
    const stream = new Uint8Array(tableSize + pad + totalPayload);
    let off = 0;
    for (const r of norm) {
      stream[off++] = r.mt.length & 255;
      stream[off++] = r.mt.length >> 8 & 255;
      stream.set(r.mt, off);
      off += r.mt.length;
      stream[off++] = r.nm.length & 255;
      stream[off++] = r.nm.length >> 8 & 255;
      stream.set(r.nm, off);
      off += r.nm.length;
      const dl = r.data.length;
      stream[off++] = dl & 255;
      stream[off++] = dl >> 8 & 255;
      stream[off++] = dl >> 16 & 255;
      stream[off++] = dl >> 24 & 255;
    }
    off += pad;
    for (const r of norm) {
      stream.set(r.data, off);
      off += r.data.length;
    }
    return stream;
  }
  function parseEntryTable(stream, entryCount, pad = 0) {
    const dec = new TextDecoder();
    const meta = [];
    let off = 0;
    for (let i = 0; i < entryCount; i++) {
      const mtLen = stream[off] | stream[off + 1] << 8;
      off += 2;
      const mimetype = dec.decode(stream.slice(off, off + mtLen));
      off += mtLen;
      const nmLen = stream[off] | stream[off + 1] << 8;
      off += 2;
      const name = dec.decode(stream.slice(off, off + nmLen));
      off += nmLen;
      const payloadLen = (stream[off] | stream[off + 1] << 8 | stream[off + 2] << 16 | stream[off + 3] << 24) >>> 0;
      off += 4;
      meta.push({ mimetype, name, payloadLen, dataOffset: 0 });
    }
    let payloadOff = off + pad;
    for (const m of meta) {
      m.dataOffset = payloadOff;
      payloadOff += m.payloadLen;
    }
    return meta.map((m) => ({
      mimetype: m.mimetype,
      name: m.name,
      data: stream.slice(m.dataOffset, m.dataOffset + m.payloadLen),
      dataOffset: m.dataOffset
    }));
  }
  function buildAudioMime(params) {
    let s = `audio/L${params.bits}; rate=${params.rate}; channels=${params.channels}`;
    if (params.layout && params.layout !== "planar") s += `; layout=${params.layout}`;
    if (params.layout === "block" && params.blockSize) s += `; block=${params.blockSize}`;
    return s;
  }
  function parseAudioMime(s) {
    const bits = parseInt(
      (s.match(/audio\/L(\d+)/i) || [])[1] || "16"
    );
    const rate = parseInt((s.match(/rate=(\d+)/i) || [])[1] || "44100");
    const channels = parseInt((s.match(/channels=(\d+)/i) || [])[1] || "1");
    const layout = (s.match(/layout=([\w-]+)/i) || [])[1] || "planar";
    const blockSize = parseInt((s.match(/block=(\d+)/i) || [])[1]) || 0;
    return { bits, rate, channels, layout, blockSize };
  }

  // src/Stegassette/channelPlan.ts
  var CHANNEL_NAMES = ["r", "g", "b"];
  var PACK_NAMES = ["packed", "aligned", "mono"];
  var CH = { r: 0, g: 1, b: 2 };
  function serializeChannelPlan(slots) {
    return slots.map((s) => `${CHANNEL_NAMES[s.ch]}.${s.combine}`).join("+");
  }
  function parseChannelPlan(token) {
    return String(token).split("+").map((t) => t.trim()).filter(Boolean).map((t) => {
      const [c, comb] = t.split(".");
      return { ch: CH[c], combine: comb || "xor" };
    }).filter((s) => s.ch === 0 || s.ch === 1 || s.ch === 2);
  }
  function slotsFromChannels(channels, fallbackCombine) {
    if (typeof channels === "string") {
      if (channels.includes(".") || channels.includes("+"))
        return parseChannelPlan(channels);
      return channels.toLowerCase().split("").filter((c) => c in CH).map((c) => ({ ch: CH[c], combine: fallbackCombine }));
    }
    return (channels || []).map((s) => {
      if (typeof s === "string")
        return { ch: CH[s.toLowerCase()], combine: fallbackCombine };
      const key = s.ch ?? s.channel;
      const ch = typeof key === "number" ? key : CH[String(key).toLowerCase()];
      return { ch, combine: s.combine || fallbackCombine };
    }).filter((s) => s.ch === 0 || s.ch === 1 || s.ch === 2);
  }
  function normalizeChannelPlan(opts = {}, bytesPerSample = 3, tableSize = 0) {
    const combine = opts.combine || "xor";
    if (opts.pack === "mono") {
      const slots2 = CHANNEL_NAMES.map((c) => ({
        ch: CH[c],
        combine
      }));
      return { slots: slots2, pad: 0, pack: "mono", bytesPerPixel: 1, broadcast: true };
    }
    const pack = opts.pack === "aligned" ? "aligned" : "packed";
    let slots;
    if (opts.channels) {
      slots = slotsFromChannels(opts.channels, combine);
    } else if (pack === "aligned") {
      const n = Math.min(Math.max(1, bytesPerSample | 0), 3);
      slots = CHANNEL_NAMES.slice(0, n).map((c) => ({
        ch: CH[c],
        combine
      }));
    } else {
      slots = CHANNEL_NAMES.map((c) => ({ ch: CH[c], combine }));
    }
    if (!slots.length) slots = [{ ch: 0, combine }];
    const bpp = slots.length;
    const pad = pack === "aligned" ? (bpp - tableSize % bpp) % bpp : 0;
    return { slots, pad, pack, bytesPerPixel: bpp };
  }
  function isDefaultPlan(plan) {
    return plan.pack === "packed" && plan.slots.length === 3 && plan.slots.every((s, i) => s.ch === i) && plan.slots[0].combine === plan.slots[1].combine && plan.slots[1].combine === plan.slots[2].combine;
  }

  // src/Stegassette/header.ts
  var STGC_MAGIC = [83, 84, 71, 67];
  var STGC_VERSION = 1;
  var CODEC_VERSION = "2026.07.31";
  function buildDescriptor(opts) {
    const { combine, keymap, traversal, params = {}, ch, pad, pack } = opts;
    let s = `combine=${combine}keymap=${keymap}traversal=${traversal}`;
    if (traversal === "fisher-yates")
      s += `seed=${(params.seed ?? 0) >>> 0}`;
    if (traversal === "angle")
      s += `a=${params.a ?? 1}b=${params.b ?? 1}`;
    if (keymap === "offset")
      s += `kx=${(params.kx ?? 0) | 0}ky=${(params.ky ?? 0) | 0}`;
    if (ch) s += `ch=${ch}`;
    if (pad) s += `pad=${pad >>> 0}`;
    if (pack && pack !== "packed") s += `pack=${pack}`;
    return new TextEncoder().encode(s);
  }
  function parseDescriptor(bytes) {
    const out = {};
    for (const chunk of new TextDecoder().decode(bytes).split("")) {
      const eq = chunk.indexOf("=");
      if (eq > 0) out[chunk.slice(0, eq)] = chunk.slice(eq + 1);
    }
    if (out.seed != null) out.seed = parseInt(out.seed, 10) >>> 0;
    if (out.a != null) out.a = parseInt(out.a, 10);
    if (out.b != null) out.b = parseInt(out.b, 10);
    if (out.kx != null) out.kx = parseInt(out.kx, 10) | 0;
    if (out.ky != null) out.ky = parseInt(out.ky, 10) | 0;
    if (out.pad != null) out.pad = parseInt(out.pad, 10) >>> 0;
    return out;
  }
  function packStgcHeader(opts) {
    const desc = buildDescriptor(opts);
    const b = new Uint8Array(12 + desc.length + 1);
    STGC_MAGIC.forEach((c, i) => b[i] = c);
    b[4] = STGC_VERSION;
    const ibl = opts.interiorByteLength >>> 0;
    b[5] = ibl & 255;
    b[6] = ibl >>> 8 & 255;
    b[7] = ibl >>> 16 & 255;
    b[8] = ibl >>> 24 & 255;
    b[9] = opts.entryCount & 255;
    b[10] = desc.length & 255;
    b[11] = 0;
    b.set(desc, 12);
    let xor = 0;
    for (let i = 0; i < b.length - 1; i++) xor ^= b[i];
    b[b.length - 1] = xor;
    return b;
  }
  function recoverZeros(hdr) {
    const n = hdr.length;
    const ones = [];
    for (let i = 0; i < n - 1; i++) if (hdr[i] === 1) ones.push(i);
    const m = Math.min(ones.length, 20);
    for (const chk of [hdr[n - 1], ...hdr[n - 1] === 1 ? [0] : []]) {
      for (let mask = 0; mask < 1 << m; mask++) {
        const cand = new Uint8Array(hdr);
        cand[n - 1] = chk;
        for (let j = 0; j < m; j++) if (mask & 1 << j) cand[ones[j]] = 0;
        let xor = 0;
        for (let i = 0; i < n - 1; i++) xor ^= cand[i];
        if (xor === cand[n - 1]) return cand;
      }
    }
    throw new Error("STGC header checksum mismatch");
  }
  function nibbleByte(alphaHi, alphaLo) {
    return (255 - alphaHi & 15) << 4 | 255 - alphaLo & 15;
  }
  function unpackStgcHeaderAlpha(img) {
    try {
      return unpackNibbles(img);
    } catch (e) {
      try {
        return unpackWholeBytes(img, (alpha) => 255 - alpha);
      } catch (e2) {
        return unpackWholeBytes(img, (alpha) => alpha);
      }
    }
  }
  function unpackNibbles(img) {
    const tmpBpx = getBorderPixels(img.width, img.height, 1);
    if (tmpBpx.length < 6) throw new Error("not a STGC image");
    const alphaAt = (i) => img.getAlpha(tmpBpx[i][0], tmpBpx[i][1]);
    let B = nibbleByte(alphaAt(0), alphaAt(1));
    if (B === 0) {
      B = nibbleByte(alphaAt(2), alphaAt(3)) | nibbleByte(alphaAt(4), alphaAt(5)) << 8;
      if (B === 0) throw new Error("not a STGC image");
    }
    const bpx = getBorderPixels(img.width, img.height, B);
    const bytes = new Uint8Array(bpx.length >> 1);
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = nibbleByte(
        img.getAlpha(bpx[i * 2][0], bpx[i * 2][1]),
        img.getAlpha(bpx[i * 2 + 1][0], bpx[i * 2 + 1][1])
      );
    return parseRingBytes(bytes, B);
  }
  function unpackWholeBytes(img, read) {
    let B = read(img.getAlpha(0, 0));
    if (B === 0) {
      const tmpBpx = getBorderPixels(img.width, img.height, 1);
      if (tmpBpx.length < 3) throw new Error("not a STGC image");
      B = read(img.getAlpha(tmpBpx[1][0], tmpBpx[1][1])) | read(img.getAlpha(tmpBpx[2][0], tmpBpx[2][1])) << 8;
      if (B === 0) throw new Error("not a STGC image");
    }
    const bpx = getBorderPixels(img.width, img.height, B);
    const alphas = new Uint8Array(bpx.length);
    for (let i = 0; i < bpx.length; i++)
      alphas[i] = read(img.getAlpha(bpx[i][0], bpx[i][1]));
    return parseRingBytes(alphas, B);
  }
  function parseRingBytes(alphas, B) {
    const bpx = { length: alphas.length };
    let magicOff = -1;
    for (let i = 0; i <= bpx.length - 4; i++) {
      if (alphas[i] === 83 && alphas[i + 1] === 84 && alphas[i + 2] === 71 && alphas[i + 3] === 67) {
        magicOff = i;
        break;
      }
    }
    if (magicOff === -1) throw new Error("not a STGC image");
    if (alphas[magicOff + 4] !== STGC_VERSION)
      throw new Error(`unsupported STGC version: ${alphas[magicOff + 4]}`);
    const descLen = alphas[magicOff + 10];
    const hdrLen = 12 + descLen + 1;
    if (magicOff + hdrLen > bpx.length)
      throw new Error("STGC header extends beyond border");
    const hdr = alphas.slice(magicOff, magicOff + hdrLen);
    const recovered = recoverZeros(hdr);
    const ibl = (recovered[5] | recovered[6] << 8 | recovered[7] << 16 | recovered[8] << 24) >>> 0;
    const entryCount = recovered[9];
    const d = parseDescriptor(recovered.slice(12, 12 + descLen));
    const combine = d.combine || "xor";
    const keymap = d.keymap || "adjacent";
    const traversal = d.traversal || "raster";
    const pack = d.pack || "packed";
    const ch = d.ch || null;
    const pad = d.pad || 0;
    let plan;
    if (pack === "mono") {
      plan = normalizeChannelPlan({ combine, pack: "mono" });
    } else if (ch) {
      const slots = parseChannelPlan(ch);
      plan = { slots, pad, pack, bytesPerPixel: slots.length };
    } else {
      plan = normalizeChannelPlan({ combine });
    }
    plan.pad = pad;
    const params = {
      seed: d.seed,
      a: d.a,
      b: d.b,
      kx: d.kx,
      ky: d.ky
    };
    return {
      B,
      version: recovered[4],
      borderWidth: B,
      combine,
      keymap,
      traversal,
      params,
      plan,
      pack,
      interiorByteLength: ibl,
      entryCount
    };
  }
  function applyAlphaHeader(outImg, B, hdrBytes, offset) {
    const bpx = getBorderPixels(outImg.width, outImg.height, B);
    const putByte = (index, byte) => {
      outImg.setAlpha(bpx[index][0], bpx[index][1], 255 - (byte >> 4 & 15));
      outImg.setAlpha(bpx[index + 1][0], bpx[index + 1][1], 255 - (byte & 15));
    };
    let minOffset;
    if (B > 255) {
      putByte(0, 0);
      putByte(2, B & 255);
      putByte(4, B >> 8 & 255);
      minOffset = 6;
    } else {
      putByte(0, B);
      minOffset = 2;
    }
    const headerPx = hdrBytes.length * 2;
    if (minOffset + headerPx > bpx.length)
      throw new Error("STGC header does not fit the border ring");
    if (offset == null) {
      const H = outImg.height;
      const bottomStart = bpx.findIndex(([, py]) => py === H - 1);
      const bottomLen = outImg.width;
      offset = bottomStart + (bottomLen - headerPx >> 1);
    }
    offset = Math.min(offset, bpx.length - headerPx);
    offset = Math.max(minOffset, offset) & ~1;
    for (let i = 0; i < hdrBytes.length; i++) {
      putByte(offset + i * 2, hdrBytes[i]);
    }
  }

  // src/Stegassette/keymap.ts
  var KEYMAP_NAMES = [
    "adjacent",
    "poles",
    "mirror-x",
    "mirror-y",
    "offset",
    "rotate",
    // Keyless: there is no key pixel at all.
    "none"
  ];
  var KEYLESS_KEYMAPS = /* @__PURE__ */ new Set(["none"]);
  function isKeylessKeymap(name) {
    return name != null && KEYLESS_KEYMAPS.has(name);
  }
  var KEY_FIELD = {
    none: () => 0
  };
  function resolveKeyField(name) {
    const f = KEY_FIELD[name];
    if (!f) throw new Error(`keymap "${name}" does not generate a key field`);
    return f;
  }
  function snapToKey(px, py, IW, IH) {
    if (!isDataPixel(px, py)) return [px, py];
    const inRow = py % 2 === 0 ? px - 1 : px + 1;
    if (inRow >= 0 && inRow < IW) return [inRow, py];
    return [px, py > 0 ? py - 1 : Math.min(py + 1, IH - 1)];
  }
  function resolveKeymapName(opts) {
    const loose = opts;
    if (loose.keyMap !== void 0 && loose.keymap === void 0) {
      throw new Error(
        'Stegassette options use `keymap` (lowercase "m"), not `keyMap`. The lab\'s steg-core.js spells it `keyMap`; passing that here would silently fall back to "adjacent".'
      );
    }
    const name = opts.keymap || "adjacent";
    if (!KEYMAP[name] && !isKeylessKeymap(name))
      throw new Error(`unknown keymap: ${name}`);
    return name;
  }
  function resolveKeymap(opts) {
    const name = resolveKeymapName(opts);
    if (isKeylessKeymap(name))
      throw new Error(
        `keymap "${name}" generates its key from position and has no key pixel; use resolveKeyField(name) instead`
      );
    return KEYMAP[name];
  }
  var KEYMAP = {
    // one pixel left on even rows, one right on odd rows, reflected back inside
    // the interior at the edges (always lands on an in-bounds key pixel)
    adjacent: (dx, dy, IW, IH) => snapToKey(dx, dy, IW, IH),
    // diagonally opposite corner (180° rotation), then snap to nearest key pixel
    poles: (dx, dy, IW, IH) => snapToKey(IW - 1 - dx, IH - 1 - dy, IW, IH),
    // horizontally flipped, then snap to nearest key pixel
    "mirror-x": (dx, dy, IW, IH) => snapToKey(IW - 1 - dx, dy, IW, IH),
    // vertically flipped, then snap to nearest key pixel
    "mirror-y": (dx, dy, IW, IH) => snapToKey(dx, IH - 1 - dy, IW, IH),
    // data position + (kx, ky) wrapped torus-style, snap to nearest key pixel
    offset: (dx, dy, IW, IH, p = {}) => {
      const ox = ((dx + (p.kx ?? 0)) % IW + IW) % IW;
      const oy = ((dy + (p.ky ?? 0)) % IH + IH) % IH;
      return snapToKey(ox, oy, IW, IH);
    },
    // 90° clockwise rotation (aspect-normalized), snap to nearest key pixel
    rotate: (dx, dy, IW, IH) => {
      const px = Math.round((1 - (IH > 1 ? dy / (IH - 1) : 0)) * (IW - 1));
      const py = Math.round((IW > 1 ? dx / (IW - 1) : 0) * (IH - 1));
      return snapToKey(px, py, IW, IH);
    }
  };

  // src/Stegassette/traversal.ts
  var allPixels = () => true;
  function countFiltered(W, H, filter) {
    if (filter === isDataPixel) return dataPixelCount(W, H);
    if (filter === allPixels) return W * H;
    let n = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if (filter(x, y)) n++;
    return n;
  }
  function rasterPath(W, H, filter = isDataPixel) {
    const out = new Uint32Array(countFiltered(W, H, filter));
    let n = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if (filter(x, y)) out[n++] = y * W + x;
    return out;
  }
  function boustrophedonPath(W, H, filter = isDataPixel) {
    const out = new Uint32Array(countFiltered(W, H, filter));
    let n = 0;
    for (let y = 0; y < H; y++) {
      if (y % 2 === 0) {
        for (let x = 0; x < W; x++) if (filter(x, y)) out[n++] = y * W + x;
      } else {
        for (let x = W - 1; x >= 0; x--) if (filter(x, y)) out[n++] = y * W + x;
      }
    }
    return out;
  }
  function spiralPath(W, H, filter = isDataPixel) {
    const seen = new Uint8Array(W * H);
    const out = new Uint32Array(countFiltered(W, H, filter));
    let n = 0;
    const ddx = [1, 0, -1, 0];
    const ddy = [0, 1, 0, -1];
    let x = 0, y = 0, dir = 0;
    for (let i = 0; i < W * H; i++) {
      if (filter(x, y)) out[n++] = y * W + x;
      seen[y * W + x] = 1;
      let nx = x + ddx[dir], ny = y + ddy[dir];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H || seen[ny * W + nx]) {
        dir = (dir + 1) % 4;
        nx = x + ddx[dir];
        ny = y + ddy[dir];
      }
      x = nx;
      y = ny;
    }
    return out;
  }
  function anglePath(W, H, filter = isDataPixel, a = 1, b = 1) {
    const arr = Array.from(rasterPath(W, H, filter));
    arr.sort((p, q) => {
      const dk = a * (p % W) + b * (p / W | 0) - (a * (q % W) + b * (q / W | 0));
      return dk || p - q;
    });
    return Uint32Array.from(arr);
  }
  function fisherYatesPath(W, H, filter = isDataPixel, seed) {
    const p = rasterPath(W, H, filter);
    let s = seed != null ? seed >>> 0 : W * 1664525 + H * 1013904223 >>> 0;
    for (let i = p.length - 1; i > 0; i--) {
      s = s * 1664525 + 1013904223 >>> 0;
      const j = s % (i + 1);
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    return p;
  }
  function centerOutPath(W, H, filter = isDataPixel) {
    const cx = (W - 1) / 2, cy = (H - 1) / 2;
    const arr = Array.from(rasterPath(W, H, filter));
    arr.sort((a, b) => {
      const ax = a % W, ay = a / W | 0;
      const bx = b % W, by = b / W | 0;
      return (ax - cx) ** 2 + (ay - cy) ** 2 - ((bx - cx) ** 2 + (by - cy) ** 2) || a - b;
    });
    return Uint32Array.from(arr);
  }
  function hilbertPath(W, H, filter = isDataPixel) {
    const size = 1 << Math.ceil(Math.log2(Math.max(W, H, 2)));
    const out = new Uint32Array(countFiltered(W, H, filter));
    let n = 0;
    for (let t = 0; t < size * size; t++) {
      let x = 0, y = 0, tt = t;
      for (let s = 1; s < size; s <<= 1) {
        const rx = tt >> 1 & 1, ry = (tt ^ rx) & 1;
        if (ry === 0) {
          if (rx === 1) {
            x = s - 1 - x;
            y = s - 1 - y;
          }
          const tmp = x;
          x = y;
          y = tmp;
        }
        x += s * rx;
        y += s * ry;
        tt >>= 2;
      }
      if (x < W && y < H && filter(x, y)) out[n++] = y * W + x;
    }
    return out;
  }
  function polarPath(W, H, filter = isDataPixel) {
    const arr = Array.from(rasterPath(W, H, filter));
    const RX = (v) => 2 * (v % W) - (W - 1);
    const RY = (v) => 2 * (v / W | 0) - (H - 1);
    const half = (rx, ry) => rx > 0 || rx === 0 && ry <= 0 ? 0 : 1;
    arr.sort((p, q) => {
      const ax = RX(p), ay = RY(p), bx = RX(q), by = RY(q);
      const ha = half(ax, ay), hb = half(bx, by);
      if (ha !== hb) return ha - hb;
      const cross = ax * by - ay * bx;
      if (cross !== 0) return cross > 0 ? -1 : 1;
      return ax * ax + ay * ay - (bx * bx + by * by) || p - q;
    });
    return Uint32Array.from(arr);
  }
  function bayerPath(W, H, filter = isDataPixel) {
    const bits = Math.max(1, Math.ceil(Math.log2(Math.max(W, H, 2))));
    const arr = Array.from(rasterPath(W, H, filter));
    const bv = (x, y) => {
      let v = 0;
      for (let i = 0; i < bits; i++) {
        const xb = x >> i & 1, yb = y >> i & 1;
        v = v * 4 + ((xb ^ yb) << 1 | yb);
      }
      return v;
    };
    arr.sort(
      (p, q) => bv(p % W, p / W | 0) - bv(q % W, q / W | 0) || p - q
    );
    return Uint32Array.from(arr);
  }
  var TRAVERSAL_NAMES = [
    "raster",
    "boustrophedon",
    "spiral",
    "angle",
    "fisher-yates",
    "center-out",
    "hilbert",
    "polar",
    "bayer"
  ];
  function getPathIndices(W, H, traversal, params = {}, keyless = false) {
    const f = keyless ? allPixels : isDataPixel;
    switch (traversal) {
      case "raster":
        return rasterPath(W, H, f);
      case "boustrophedon":
        return boustrophedonPath(W, H, f);
      case "spiral":
        return spiralPath(W, H, f);
      case "angle":
        return anglePath(W, H, f, params.a ?? 1, params.b ?? 1);
      case "fisher-yates":
        return fisherYatesPath(W, H, f, params.seed);
      case "center-out":
        return centerOutPath(W, H, f);
      case "hilbert":
        return hilbertPath(W, H, f);
      case "polar":
        return polarPath(W, H, f);
      case "bayer":
        return bayerPath(W, H, f);
      default:
        return rasterPath(W, H, f);
    }
  }
  function getPath(W, H, traversal, params = {}) {
    const idx = getPathIndices(W, H, traversal, params);
    const out = new Array(idx.length);
    for (let i = 0; i < idx.length; i++)
      out[i] = [idx[i] % W, idx[i] / W | 0];
    return out;
  }

  // src/Stegassette/container.ts
  function assertCombinesAllowed(keymap, slots) {
    if (!isKeylessKeymap(keymap)) return;
    const bad = [...new Set(slots.filter((s) => KEY_MOD[s.combine]).map((s) => s.combine))];
    if (bad.length)
      throw new Error(
        `combine ${bad.map((c) => `"${c}"`).join(", ")} cannot be used with keymap "${keymap}": it rewrites the key pixel, and a keyless encode has none. Use xor, additive, subtractive, bitshift or signed.`
      );
  }
  function writeInterior(img, keyImg, stream, opts) {
    const B = opts.borderWidth;
    const IW = img.width - 2 * B, IH = img.height - 2 * B;
    const keyless = isKeylessKeymap(opts.keymap);
    const path = getPathIndices(IW, IH, opts.traversal || "raster", opts.params, keyless);
    const { slots, broadcast } = opts.plan;
    const km = keyless ? null : resolveKeymap(opts);
    const field = keyless ? resolveKeyField(opts.keymap) : null;
    const params = opts.params;
    let ai = 0;
    for (let pi = 0; pi < path.length; pi++) {
      if (ai >= stream.length) break;
      const v = path[pi];
      const lx = v % IW, ly = v / IW | 0;
      const dx = lx + B, dy = ly + B;
      const [klx, kly] = km ? km(lx, ly, IW, IH, params) : [lx, ly];
      const kx = klx + B, ky = kly + B;
      const k = field ? [field(lx, ly, 0, IW, IH, params), field(lx, ly, 1, IW, IH, params), field(lx, ly, 2, IW, IH, params)] : keyImg.get(kx, ky);
      const cur = img.get(dx, dy);
      const outD = [cur[0], cur[1], cur[2]];
      const outK = [k[0], k[1], k[2]];
      let keyTouched = false;
      const broadcastByte = broadcast ? ai < stream.length ? stream[ai++] : 0 : null;
      for (const slot of slots) {
        const a = broadcastByte !== null ? broadcastByte : ai < stream.length ? stream[ai++] : 0;
        const c = slot.ch;
        const op = ENCODE_OP[slot.combine];
        const keyModFn = KEY_MOD[slot.combine];
        if (keyModFn) {
          const mk = keyModFn(a, k[c], cur[c]);
          outK[c] = mk;
          outD[c] = op(a, mk, cur[c]);
          keyTouched = true;
        } else {
          outD[c] = op(a, k[c], cur[c]);
        }
      }
      img.set(dx, dy, outD[0], outD[1], outD[2]);
      if (keyTouched && !keyless) img.set(kx, ky, outK[0], outK[1], outK[2]);
    }
  }
  function readInterior(img, keyImg, byteLength, opts) {
    const B = opts.borderWidth;
    const IW = img.width - 2 * B, IH = img.height - 2 * B;
    const keyless = isKeylessKeymap(opts.keymap);
    const path = getPathIndices(IW, IH, opts.traversal || "raster", opts.params, keyless);
    const { slots, broadcast } = opts.plan;
    const km = keyless ? null : resolveKeymap(opts);
    const field = keyless ? resolveKeyField(opts.keymap) : null;
    const params = opts.params;
    const out = new Uint8Array(byteLength);
    let ai = 0;
    for (let pi = 0; pi < path.length; pi++) {
      if (ai >= byteLength) break;
      const v = path[pi];
      const lx = v % IW, ly = v / IW | 0;
      const [klx, kly] = km ? km(lx, ly, IW, IH, params) : [lx, ly];
      const dx = lx + B, dy = ly + B;
      const kx = klx + B, ky = kly + B;
      const e_ = img.get(dx, dy);
      const k = field ? [field(lx, ly, 0, IW, IH, params), field(lx, ly, 1, IW, IH, params), field(lx, ly, 2, IW, IH, params)] : keyImg.get(kx, ky);
      if (broadcast) {
        if (ai >= byteLength) break;
        const s0 = slots[0];
        out[ai++] = COMBINE[s0.combine](e_[s0.ch], k[s0.ch]);
      } else {
        for (const slot of slots) {
          if (ai >= byteLength) break;
          out[ai++] = COMBINE[slot.combine](e_[slot.ch], k[slot.ch]);
        }
      }
    }
    return out;
  }
  function mergeParams(opts) {
    return {
      ...opts.params || {},
      ...opts.seed != null ? { seed: opts.seed } : {},
      ...opts.a != null ? { a: opts.a } : {},
      ...opts.b != null ? { b: opts.b } : {},
      ...opts.kx != null ? { kx: opts.kx } : {},
      ...opts.ky != null ? { ky: opts.ky } : {}
    };
  }
  function encodeContainer(entries, srcImg, opts, keyImg) {
    const key = keyImg ?? srcImg;
    const B = opts.borderWidth;
    const outImg = new Img(srcImg.width, srcImg.height, new Uint8Array(srcImg.data));
    const plan = opts.plan ?? normalizeChannelPlan(
      { combine: opts.combine, pack: opts.pack, channels: opts.channels },
      opts.bytesPerSample ?? 3,
      entryTableSize(entries)
    );
    const stream = buildInteriorStream(entries, plan.pad);
    const params = mergeParams(opts);
    if ((opts.traversal || "raster") === "fisher-yates" && params.seed == null) {
      params.seed = Math.random() * 4294967296 >>> 0;
    }
    const keymap = resolveKeymapName(opts);
    const traversal = opts.traversal || "raster";
    const combine = opts.combine || "xor";
    assertCombinesAllowed(keymap, plan.slots);
    const hdrBytes = packStgcHeader({
      combine,
      keymap,
      traversal,
      interiorByteLength: stream.length,
      entryCount: entries.length,
      params,
      // omit channel-plan fields for the legacy default or mono (pack=mono in header suffices)
      ch: isDefaultPlan(plan) || plan.broadcast ? void 0 : serializeChannelPlan(plan.slots),
      pad: plan.pad,
      pack: plan.pack
    });
    const ringPx = srcImg.width * srcImg.height - Math.max(0, srcImg.width - 2 * B) * Math.max(0, srcImg.height - 2 * B);
    if (hdrBytes.length * 2 + 6 > ringPx)
      throw new Error(
        `border ring too small for STGC header (need ${hdrBytes.length * 2 + 6}px, ring is ${ringPx})`
      );
    writeInterior(outImg, key, stream, { borderWidth: B, combine, keymap, traversal, params, plan });
    applyAlphaHeader(outImg, B, hdrBytes);
    return outImg;
  }
  function decodeContainer(encImg, keyImg) {
    const key = keyImg ?? encImg;
    const hdr = unpackStgcHeaderAlpha(encImg);
    const internalOpts = {
      borderWidth: hdr.B,
      combine: hdr.combine,
      keymap: hdr.keymap,
      traversal: hdr.traversal,
      params: hdr.params,
      plan: hdr.plan
    };
    const stream = readInterior(
      encImg,
      key,
      hdr.interiorByteLength,
      internalOpts
    );
    const entries = parseEntryTable(stream, hdr.entryCount, hdr.plan.pad);
    const stgcOpts = {
      borderWidth: hdr.B,
      combine: hdr.combine,
      keymap: hdr.keymap,
      traversal: hdr.traversal,
      params: hdr.params,
      plan: hdr.plan,
      pack: hdr.pack,
      interiorByteLength: hdr.interiorByteLength
    };
    return { entries, opts: stgcOpts };
  }

  // src/Stegassette/geometry.ts
  function scaleImg(img, newW, newH) {
    const out = new Img(newW, newH, new Uint8Array(newW * newH * 4));
    const sx = img.width / newW, sy = img.height / newH;
    for (let y = 0; y < newH; y++) {
      for (let x = 0; x < newW; x++) {
        const qx = x * sx, qy = y * sy;
        const x0 = Math.floor(qx), x1 = Math.min(img.width - 1, x0 + 1);
        const y0 = Math.floor(qy), y1 = Math.min(img.height - 1, y0 + 1);
        const fx = qx - x0, fy = qy - y0;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy, w11 = fx * fy;
        const [r00, g00, b00] = img.get(x0, y0), [r10, g10, b10] = img.get(x1, y0);
        const [r01, g01, b01] = img.get(x0, y1), [r11, g11, b11] = img.get(x1, y1);
        out.set(
          x,
          y,
          Math.round(r00 * w00 + r10 * w10 + r01 * w01 + r11 * w11),
          Math.round(g00 * w00 + g10 * w10 + g01 * w01 + g11 * w11),
          Math.round(b00 * w00 + b10 * w10 + b01 * w01 + b11 * w11)
        );
      }
    }
    return out;
  }
  function cropImg(img, sx, sy, sw, sh) {
    const out = new Img(sw, sh, new Uint8Array(sw * sh * 4));
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        const [r, g, b] = img.get(sx + x, sy + y);
        out.set(x, y, r, g, b);
      }
    return out;
  }
  function interiorDims(dataPx, aspect, B = 0, keyless = false) {
    const density = keyless ? 1 : 2;
    const capacity = keyless ? (W, H) => W * H : dataPixelCount;
    const qb = -2 * B * (aspect + 1);
    const qc = 4 * B * B - density * dataPx;
    const disc = Math.max(0, qb * qb - 4 * aspect * qc);
    const h = (-qb + Math.sqrt(disc)) / (2 * aspect);
    let IH = Math.max(2, Math.round(h - 2 * B));
    let IW = Math.max(2, Math.round(aspect * (IH + 2 * B) - 2 * B));
    while (capacity(IW, IH) < dataPx) {
      const dW = Math.abs((IW + 1 + 2 * B) / (IH + 2 * B) - aspect);
      const dH = Math.abs((IW + 2 * B) / (IH + 1 + 2 * B) - aspect);
      if (dW <= dH) IW++;
      else IH++;
    }
    return { IW, IH };
  }
  function resolveBorderWidth(spec, dataPx, aspect, keyless = false) {
    const f = Number(spec) || 0;
    if (f > 0 && f < 1) {
      const ff = Math.min(f, 0.45, 0.45 / aspect);
      const fullW = Math.sqrt(
        (keyless ? 1 : 2) * dataPx / ((1 - 2 * ff) * (1 / aspect - 2 * ff))
      );
      return Math.max(1, Math.round(ff * fullW));
    }
    return 1 + Math.max(0, Math.floor(f));
  }
  function autoScaleImg(img, totalBytes, B = 1, aspectOverride = null, bytesPerPixel = 3, minFullWidth = 1, keyless = false) {
    const dataPx = Math.ceil(totalBytes / bytesPerPixel);
    const aspect = aspectOverride != null ? aspectOverride : img.width / img.height;
    let { IW, IH } = interiorDims(dataPx, aspect, B, keyless);
    const minIW = Math.max(2, minFullWidth - 2 * B);
    if (IW < minIW) IW = minIW;
    const newW = IW + 2 * B, newH = IH + 2 * B;
    if (aspectOverride == null && newW === img.width && newH === img.height)
      return img;
    let src = img;
    const srcAspect = img.width / img.height;
    if (Math.abs(srcAspect - aspect) > 5e-4) {
      let cropW, cropH;
      if (srcAspect > aspect) {
        cropH = img.height;
        cropW = Math.max(1, Math.round(img.height * aspect));
      } else {
        cropW = img.width;
        cropH = Math.max(1, Math.round(img.width / aspect));
      }
      const ox = Math.floor((img.width - cropW) / 2);
      const oy = Math.floor((img.height - cropH) / 2);
      src = cropImg(img, ox, oy, cropW, cropH);
    }
    return scaleImg(src, newW, newH);
  }

  // src/Stegassette/pcm.ts
  function toFloat32(pcm, bps) {
    const n = pcm.length / (bps >> 3) | 0;
    const f = new Float32Array(n);
    if (bps === 8) {
      for (let i = 0; i < n; i++) f[i] = (pcm[i] - 128) / 128;
    } else if (bps === 16) {
      for (let i = 0; i < n; i++)
        f[i] = (pcm[i * 2] * 256 + pcm[i * 2 + 1]) / 32767.5 - 1;
    } else {
      for (let i = 0; i < n; i++)
        f[i] = (pcm[i * 3] * 65536 + pcm[i * 3 + 1] * 256 + pcm[i * 3 + 2]) / 83886075e-1 - 1;
    }
    return f;
  }
  function float32ToPcm(samples, bps) {
    const out = new Uint8Array(samples.length * (bps >> 3));
    if (bps === 8) {
      for (let i = 0; i < samples.length; i++)
        out[i] = Math.max(0, Math.min(255, Math.round((samples[i] + 1) * 127.5)));
    } else if (bps === 16) {
      for (let i = 0; i < samples.length; i++) {
        const v = Math.max(0, Math.min(65535, Math.floor((samples[i] + 1) * 32767.5)));
        out[i * 2] = v >>> 8;
        out[i * 2 + 1] = v & 255;
      }
    } else {
      for (let i = 0; i < samples.length; i++) {
        const v = Math.max(0, Math.min(16777215, Math.floor((samples[i] + 1) * 83886075e-1)));
        out[i * 3] = v >>> 16;
        out[i * 3 + 1] = v >>> 8 & 255;
        out[i * 3 + 2] = v & 255;
      }
    }
    return out;
  }
  function peakNormalize(mixed, { targetDb = -1 } = {}) {
    if (!mixed || !mixed.length) return mixed;
    let peak = 0;
    for (const ch of mixed)
      for (let i = 0; i < ch.length; i++) {
        const a = Math.abs(ch[i]);
        if (a > peak) peak = a;
      }
    if (peak === 0) return mixed;
    const gain = Math.pow(10, targetDb / 20) / peak;
    for (const ch of mixed)
      for (let i = 0; i < ch.length; i++) ch[i] *= gain;
    return mixed;
  }
  function blockPos(s, c, K, M, full, tail) {
    return s < full ? Math.floor(s / K) * K * M + c * K + s % K : full * M + c * tail + (s - full);
  }
  function layoutChannels({ mixed, layout, blockSize }) {
    const M = mixed.length, N = mixed[0].length;
    const out = new Float32Array(N * M);
    if (M === 1 || !layout || layout === "planar") {
      for (let c = 0; c < M; c++) out.set(mixed[c], c * N);
      return out;
    }
    const K = layout === "interleaved" ? 1 : blockSize || 1;
    const full = Math.floor(N / K) * K, tail = N - full;
    for (let c = 0; c < M; c++)
      for (let s = 0; s < N; s++)
        out[blockPos(s, c, K, M, full, tail)] = mixed[c][s];
    return out;
  }
  function unlayoutChannels({
    f32,
    channels,
    layout,
    blockSize
  }) {
    const M = channels, N = f32.length / M | 0;
    if (M === 1 || !layout || layout === "planar") return f32;
    const K = layout === "interleaved" ? 1 : blockSize || 1;
    const full = Math.floor(N / K) * K, tail = N - full;
    const out = new Float32Array(N * M);
    for (let c = 0; c < M; c++)
      for (let s = 0; s < N; s++)
        out[c * N + s] = f32[blockPos(s, c, K, M, full, tail)];
    return out;
  }
  function computeRevealOrder({
    pathLen,
    channels,
    bits,
    layout,
    blockSize,
    bytesPerPixel = 3
  }) {
    const M = channels;
    const B = bits >> 3;
    const BPP = bytesPerPixel || 3;
    const N = Math.floor(pathLen * BPP / B / M);
    const pixelRevealFrame = new Int32Array(pathLen).fill(N);
    function markRange(i, byteStart, byteEnd) {
      const px0 = Math.floor(byteStart / BPP);
      const px1 = Math.min(Math.floor(byteEnd / BPP), pathLen - 1);
      for (let px = px0; px <= px1; px++) {
        if (i < pixelRevealFrame[px]) pixelRevealFrame[px] = i;
      }
    }
    if (M === 1 || !layout || layout === "planar") {
      if (M === 1 && BPP === B)
        return Int32Array.from({ length: pathLen }, (_, i) => i);
      for (let i = 0; i < N; i++)
        for (let c = 0; c < M; c++) {
          const byteStart = (c * N + i) * B;
          markRange(i, byteStart, byteStart + B - 1);
        }
    } else {
      const K = layout === "interleaved" ? 1 : blockSize || 1;
      const full = Math.floor(N / K) * K, tail = N - full;
      for (let i = 0; i < N; i++)
        for (let c = 0; c < M; c++) {
          const byteStart = blockPos(i, c, K, M, full, tail) * B;
          markRange(i, byteStart, byteStart + B - 1);
        }
    }
    const sorted = Array.from({ length: pathLen }, (_, i) => i);
    sorted.sort((a, b) => pixelRevealFrame[a] - pixelRevealFrame[b] || a - b);
    return new Int32Array(sorted);
  }

  // src/Stegassette/audio.ts
  function buildAudioEntry({
    channels,
    sampleRate,
    bitsPerSample = 16,
    layout = "planar",
    blockSize,
    name
  }) {
    const nChannels = channels.length;
    const mimeParams = {
      bits: bitsPerSample,
      rate: sampleRate,
      channels: nChannels,
      layout,
      blockSize
    };
    const mixed = layoutChannels({ mixed: channels, layout, blockSize });
    const data = float32ToPcm(mixed, bitsPerSample);
    return {
      mimetype: buildAudioMime(mimeParams),
      name,
      data
    };
  }
  function parseAudioEntry(entry) {
    const mime = parseAudioMime(entry.mimetype);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const flat = toFloat32(data, mime.bits);
    const N = flat.length / mime.channels | 0;
    const planar = unlayoutChannels({
      f32: flat,
      channels: mime.channels,
      layout: mime.layout,
      blockSize: mime.blockSize
    });
    const channelArrays = [];
    for (let c = 0; c < mime.channels; c++) {
      channelArrays.push(planar.subarray(c * N, (c + 1) * N));
    }
    return {
      channels: channelArrays,
      sampleRate: mime.rate,
      bitsPerSample: mime.bits,
      layout: mime.layout,
      blockSize: mime.blockSize
    };
  }
  function isAudioEntry(entry) {
    return /^audio\//i.test(entry.mimetype);
  }

  // src/Stegassette/audioPrep.ts
  var NORMALIZE_DEFAULT_DB = -1;
  function deinterleave(interleaved, channels) {
    if (channels < 1) throw new Error(`channels must be >= 1, got ${channels}`);
    const frames = interleaved.length / channels | 0;
    const out = [];
    for (let c = 0; c < channels; c++) {
      const ch = new Float32Array(frames);
      for (let i = 0; i < frames; i++) ch[i] = interleaved[i * channels + c];
      out.push(ch);
    }
    return out;
  }
  function resolveNormalize(spec) {
    if (spec == null || spec === false) return null;
    if (spec === true) return NORMALIZE_DEFAULT_DB;
    if (typeof spec === "string") {
      const s = spec.trim().toLowerCase();
      if (s === "" || s === "off" || s === "none" || s === "false") return null;
      if (s === "on" || s === "yes" || s === "true") return NORMALIZE_DEFAULT_DB;
      const n = parseFloat(s);
      return Number.isFinite(n) ? Math.min(0, n) : NORMALIZE_DEFAULT_DB;
    }
    if (typeof spec === "number")
      return Number.isFinite(spec) ? Math.min(0, spec) : null;
    return null;
  }
  function resolveAudioRates({
    mode,
    sourceSampleRate,
    targetSampleRate
  }) {
    return {
      decodeSampleRate: mode === "resample" ? targetSampleRate : sourceSampleRate,
      mimeSampleRate: targetSampleRate
    };
  }
  function prepareAudioEntry({
    samples,
    channels,
    sampleRate,
    bitsPerSample = 16,
    direction = "fwd",
    normalize = null,
    layout = "planar",
    blockSize,
    name
  }) {
    let planar;
    if (Array.isArray(samples)) {
      planar = samples;
    } else {
      if (!channels)
        throw new Error("prepareAudioEntry: `channels` is required for interleaved samples");
      planar = deinterleave(samples, channels);
    }
    if (!planar.length) throw new Error("prepareAudioEntry: no audio channels");
    if (direction === "rev") for (const ch of planar) ch.reverse();
    const normalizeDb = resolveNormalize(normalize);
    if (normalizeDb != null) peakNormalize(planar, { targetDb: normalizeDb });
    const effectiveLayout = planar.length > 1 ? layout : "planar";
    return buildAudioEntry({
      channels: planar,
      sampleRate,
      bitsPerSample,
      layout: effectiveLayout,
      blockSize: effectiveLayout === "block" ? Math.max(1, blockSize ?? 64) : 0,
      name
    });
  }

  // src/Stegassette/reconstruct.ts
  var KEY_PRESERVING = /* @__PURE__ */ new Set([
    "xor",
    "additive",
    "subtractive",
    "bitshift",
    "midpoint",
    "signed",
    "veil",
    "whisper"
  ]);
  var KEY_MASK = {
    midpoint: 254,
    veil: 252,
    whisper: 240
  };
  function reconstructCover(image, opts) {
    const W = image.width, H = image.height;
    const B = opts.borderWidth;
    const IW = W - 2 * B, IH = H - 2 * B;
    const px = image.data instanceof Uint8Array ? image.data : new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
    const chCombine = [null, null, null];
    const slots = opts.plan?.slots ?? [0, 1, 2].map((c) => ({ ch: c, combine: opts.combine }));
    for (const s of slots) chCombine[s.ch] = s.combine;
    if (isKeylessKeymap(opts.keymap)) {
      const out = new Uint8ClampedArray(px.length);
      out.set(px);
      const carries = chCombine.map((c) => c != null);
      if (carries.some(Boolean)) {
        for (let y = B; y < H - B; y++)
          for (let x = B; x < W - B; x++) {
            const o = (y * W + x) * 4;
            for (let c = 0; c < 3; c++) if (carries[c]) out[o + c] = 0;
            out[o + 3] = 255;
          }
      }
      return { data: out, width: W, height: H };
    }
    const realOnly = chCombine.every((c) => c == null || KEY_PRESERVING.has(c));
    const hasKeyPreserving = chCombine.some(
      (c) => c != null && KEY_PRESERVING.has(c)
    );
    if (realOnly) {
      const reconW = W + 1 >> 1;
      const reconH = H + 1 >> 1;
      const reconData2 = new Uint8ClampedArray(reconW * reconH * 4);
      for (let by = 0; by < reconH; by++) {
        for (let bx = 0; bx < reconW; bx++) {
          const x0 = bx << 1, y0 = by << 1;
          const x1 = x0 + 1, y1 = y0 + 1;
          const tl = (y0 * W + x0) * 4;
          const hasBR = x1 < W && y1 < H;
          const br = hasBR ? (y1 * W + x1) * 4 : tl;
          const o = (by * reconW + bx) * 4;
          for (let c = 0; c < 3; c++) {
            const combine = chCombine[c];
            const m = combine != null ? KEY_MASK[combine] ?? 255 : 255;
            reconData2[o + c] = hasBR ? (px[tl + c] & m) + (px[br + c] & m) + 1 >> 1 : px[tl + c] & m;
          }
          reconData2[o + 3] = 255;
        }
      }
      return { data: reconData2, width: reconW, height: reconH };
    }
    const pathIdx = getPathIndices(IW, IH, opts.traversal, opts.params);
    const bpp = opts.plan?.bytesPerPixel ?? 3;
    const nEnc = Math.min(
      pathIdx.length,
      Math.ceil((opts.interiorByteLength || 0) / bpp)
    );
    function dataXY(pi) {
      const v = pathIdx[pi];
      return [v % IW + B, (v / IW | 0) + B];
    }
    function keyXY(pi) {
      const v = pathIdx[pi];
      const lx = v % IW, ly = v / IW | 0;
      const [klx, kly] = KEYMAP[opts.keymap](lx, ly, IW, IH, opts.params ?? {});
      return [klx + B, kly + B];
    }
    const reconData = new Uint8ClampedArray(px.length);
    reconData.set(px);
    for (let pi = 0; pi < nEnc; pi++) {
      const [dx, dy] = dataXY(pi);
      const eo = (dy * W + dx) * 4;
      for (let c = 0; c < 3; c++) {
        const op = chCombine[c];
        if (op == null) continue;
        const m = op === "midpoint" ? 254 : 255;
        let acc = 0, n = 0;
        for (const [nx, ny] of [
          [dx - 1, dy],
          [dx + 1, dy],
          [dx, dy - 1],
          [dx, dy + 1]
        ]) {
          if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
            acc += px[(ny * W + nx) * 4 + c] & m;
            n++;
          }
        }
        reconData[eo + c] = n ? Math.round(acc / n) : 0;
      }
    }
    for (let i = 0; i < nEnc; i++) {
      const [dx, dy] = dataXY(i);
      const [kx, ky] = keyXY(i);
      const doff = (dy * W + dx) * 4;
      const koff = (ky * W + kx) * 4;
      for (let c = 0; c < 3; c++) {
        const op = chCombine[c];
        if (op === "midpoint") {
          reconData[koff + c] &= 254;
        } else if (op === "difference") {
          let sp = px[koff + c], dp = px[doff + c];
          if (sp < dp) sp += 256;
          const mid = Math.round((sp - dp) / 2 + dp) & 255;
          reconData[doff + c] = mid;
          reconData[koff + c] = mid;
        } else if (op === "echo") {
          reconData[koff + c] = px[koff + c] ^ px[doff + c];
        }
      }
    }
    if (chCombine.some((c) => c === "echo")) {
      for (let pi = 0; pi < nEnc; pi++) {
        const [dx, dy] = dataXY(pi);
        const eo = (dy * W + dx) * 4;
        for (let c = 0; c < 3; c++) {
          if (chCombine[c] !== "echo") continue;
          let acc = 0, n = 0;
          for (const [nx, ny] of [
            [dx - 1, dy],
            [dx + 1, dy],
            [dx, dy - 1],
            [dx, dy + 1]
          ]) {
            if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
              acc += reconData[(ny * W + nx) * 4 + c];
              n++;
            }
          }
          if (n) reconData[eo + c] = Math.round(acc / n);
        }
      }
    }
    if (hasKeyPreserving) {
      const rw = W + 1 >> 1, rh = H + 1 >> 1;
      const half = new Uint8ClampedArray(rw * rh * 4);
      for (let by = 0; by < rh; by++) {
        for (let bx = 0; bx < rw; bx++) {
          const x0 = bx << 1, y0 = by << 1;
          const x1 = x0 + 1, y1 = y0 + 1;
          const tl = (y0 * W + x0) * 4;
          const hasBR = x1 < W && y1 < H;
          const br = hasBR ? (y1 * W + x1) * 4 : tl;
          const o = (by * rw + bx) * 4;
          for (let c = 0; c < 3; c++)
            half[o + c] = hasBR ? reconData[tl + c] + reconData[br + c] + 1 >> 1 : reconData[tl + c];
          half[o + 3] = 255;
        }
      }
      return { data: half, width: rw, height: rh };
    }
    return { data: reconData, width: W, height: H };
  }

  // src/Stegassette/index.ts
  function stgcHeaderWidth(opts = {}) {
    const plan = opts.plan ?? normalizeChannelPlan(
      { combine: opts.combine, pack: opts.pack, channels: opts.channels },
      opts.bytesPerSample ?? 3,
      0
    );
    const params = { ...opts.params || {} };
    if ((opts.traversal || "raster") === "fisher-yates" && params.seed == null) {
      params.seed = 4294967295;
    }
    return estimatedHeaderPixels(opts, plan, params, 0);
  }
  function estimatedHeaderPixels(opts, plan, params, entryCount) {
    return packStgcHeader({
      combine: opts.combine || "xor",
      keymap: resolveKeymapName(opts),
      traversal: opts.traversal || "raster",
      interiorByteLength: 0,
      // doesn't affect length
      entryCount,
      params,
      ch: isDefaultPlan(plan) || plan.broadcast ? void 0 : serializeChannelPlan(plan.slots),
      pad: plan.pad,
      pack: plan.pack
      // nibble pairs: two border pixels per header byte, plus the ring-start
      // B bootstrap and even-offset alignment
    }).length * 2 + 8;
  }
  function ringPixelCount(W, H, B) {
    return W * H - Math.max(0, W - 2 * B) * Math.max(0, H - 2 * B);
  }
  function encodeImageData({
    source,
    entries,
    border = 0,
    aspectRatio,
    ...opts
  }) {
    const src = new Img(source.width, source.height, source.data);
    const plan = opts.plan ?? normalizeChannelPlan(
      { combine: opts.combine, pack: opts.pack, channels: opts.channels },
      opts.bytesPerSample ?? 3,
      entryTableSize(entries)
    );
    const keyless = isKeylessKeymap(resolveKeymapName(opts));
    const aspect = aspectRatio ?? src.width / src.height;
    const totalBytes = containerInteriorBytes(entries) + plan.pad;
    const dataPx = Math.ceil(totalBytes / plan.bytesPerPixel);
    let B = resolveBorderWidth(border, dataPx, aspect, keyless);
    const params = {
      ...opts.params || {},
      ...opts.seed != null ? { seed: opts.seed } : {},
      ...opts.a != null ? { a: opts.a } : {},
      ...opts.b != null ? { b: opts.b } : {},
      ...opts.kx != null ? { kx: opts.kx } : {},
      ...opts.ky != null ? { ky: opts.ky } : {}
    };
    const headerPx = estimatedHeaderPixels(opts, plan, params, entries.length);
    let scaled = autoScaleImg(src, totalBytes, B, aspectRatio ?? null, plan.bytesPerPixel, 1, keyless);
    while (ringPixelCount(scaled.width, scaled.height, B) < headerPx) {
      if (B > 255) throw new Error("STGC header does not fit any border");
      B += 1;
      scaled = autoScaleImg(src, totalBytes, B, aspectRatio ?? null, plan.bytesPerPixel, 1, keyless);
    }
    return encodeContainer(entries, scaled, { ...opts, borderWidth: B, plan }, scaled);
  }
  function decodeImageData({
    source
  }) {
    const img = new Img(source.width, source.height, source.data);
    return decodeContainer(img);
  }

  // src/Stegassette/revealSurface.ts
  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  function asClamped(data) {
    return data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  }
  var RevealSurface = class {
    /** Wrapper div holding the stacked base and overlay canvases. */
    element;
    baseCanvas;
    overlayCanvas;
    width;
    height;
    /** Interior-local linear indices, in traversal order. */
    pathIdx;
    bytesPerPixel;
    opts;
    overlayCtx;
    encoded;
    overlayData;
    px;
    B;
    IW;
    IH;
    /** True when the encode generates its key from position (no key pixels). */
    keyless;
    // Bounding box of pixels touched since the last flush, so a frame only
    // re-uploads the region that actually changed.
    dx0 = 0;
    dy0 = 0;
    dx1 = -1;
    dy1 = -1;
    constructor(img, opts, { className = "stegassette-player" } = {}) {
      const W = this.width = img.width;
      const H = this.height = img.height;
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
      const baseCtx = this.baseCanvas.getContext("2d");
      const recon = reconstructCover(img, opts);
      const small = canvas(recon.width, recon.height);
      small.getContext("2d").putImageData(new ImageData(asClamped(recon.data), recon.width, recon.height), 0, 0);
      baseCtx.imageSmoothingEnabled = true;
      baseCtx.drawImage(small, 0, 0, W, H);
      this.overlayCtx = this.overlayCanvas.getContext("2d");
      this.encoded = new Uint8ClampedArray(img.data);
      this.overlayData = new ImageData(new Uint8ClampedArray(this.encoded), W, H);
      this.px = this.overlayData.data;
      this.reset();
    }
    /** Restore the fully-encoded overlay, with the border ring cleared so the reconstruction rings it. */
    reset() {
      this.px.set(this.encoded);
      const { width: W, height: H, B } = this;
      if (B > 0 && !this.keyless) {
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
    touch(x, y) {
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
    clearAt(pathIndex) {
      const { IW, IH, B, width: W, opts } = this;
      const v = this.pathIdx[pathIndex];
      const lx = v % IW;
      const ly = v / IW | 0;
      const x = lx + B;
      const y = ly + B;
      this.px[(y * W + x) * 4 + 3] = 0;
      this.touch(x, y);
      if (this.keyless) return;
      const [klx, kly] = KEYMAP[opts.keymap](
        lx,
        ly,
        IW,
        IH,
        opts.params ?? {}
      );
      const kx = klx + B;
      const ky = kly + B;
      this.px[(ky * W + kx) * 4 + 3] = 0;
      this.touch(kx, ky);
    }
    /** Erase a half-open range of traversal positions. */
    clearRange(from, to) {
      const end = Math.min(to, this.pathIdx.length);
      for (let i = Math.max(0, from); i < end; i++) this.clearAt(i);
    }
    /** Upload the touched region. Cheap when nothing changed. */
    flush() {
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
  };
  function revealSpanForEntry(entry, bytesPerPixel, pathLen) {
    if (!entry) return { startPxIdx: 0, endPxIdx: pathLen, revealOrder: null };
    const len = entry.data.length;
    const startPxIdx = Math.floor(entry.dataOffset / bytesPerPixel);
    const endPxIdx = Math.min(
      Math.ceil((entry.dataOffset + len) / bytesPerPixel),
      pathLen
    );
    let revealOrder = null;
    if (isAudioEntry(entry) && /^audio\/l/i.test(entry.mimetype)) {
      const parsed = parseAudioEntry(entry);
      revealOrder = computeRevealOrder({
        pathLen: Math.max(1, endPxIdx - startPxIdx),
        channels: parsed.channels.length,
        bits: parsed.bitsPerSample,
        layout: parsed.layout,
        blockSize: parsed.blockSize,
        bytesPerPixel
      });
    }
    return { startPxIdx, endPxIdx, revealOrder };
  }
  var SeekableReveal = class {
    surface;
    span;
    /** Convenience passthrough to `surface.element`. */
    element;
    filled = -1;
    constructor(img, opts, entry = null, options = {}) {
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
    reset() {
      this.surface.reset();
      const { startPxIdx, endPxIdx } = this.span;
      this.surface.clearRange(0, startPxIdx);
      this.surface.clearRange(endPxIdx, this.surface.pathIdx.length);
      this.surface.flush();
      this.filled = -1;
    }
    /** Reveal up to `fraction` (0–1) of the span. */
    seek(fraction) {
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
  };
  function animateReveal(target, ms, onDone) {
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

  // src/Stegassette/player.ts
  async function rawImg(source) {
    if ("naturalWidth" in source && (!source.complete || source.naturalWidth === 0)) {
      const fresh = new Image();
      fresh.crossOrigin = source.crossOrigin;
      fresh.src = source.currentSrc || source.src;
      try {
        await fresh.decode();
      } catch (_) {
        if (!fresh.complete) {
          await new Promise((resolve, reject) => {
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
    let drawable = source;
    if (typeof createImageBitmap === "function") {
      try {
        drawable = await createImageBitmap(source, {
          colorSpaceConversion: "none"
        });
      } catch (_) {
      }
    }
    const canvas2 = document.createElement("canvas");
    canvas2.width = w;
    canvas2.height = h;
    const context = canvas2.getContext("2d", { willReadFrequently: true });
    context.drawImage(drawable, 0, 0);
    return new Img(w, h, context.getImageData(0, 0, w, h).data);
  }
  var RevealPlayer = class {
    surface;
    element;
    baseCanvas;
    overlayCanvas;
    opts;
    entries;
    width;
    height;
    /** Duration in seconds of the primary (first) audio track. */
    duration;
    audioContext;
    tracks;
    sources = [];
    rafId = null;
    t0 = 0;
    loopCount = 0;
    playing = false;
    constructor(img, decoded, { audioContext, className = "stegassette-player" }) {
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
          buffer: null
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
    restart() {
      this.surface.reset();
      const minStart = Math.min(...this.tracks.map((t) => t.span.startPxIdx));
      const maxEnd = Math.max(...this.tracks.map((t) => t.span.endPxIdx));
      this.surface.clearRange(0, minStart);
      this.surface.clearRange(maxEnd, this.surface.pathIdx.length);
      this.surface.flush();
      for (const t of this.tracks) t.fillIdx = 0;
    }
    frame = () => {
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
            Math.floor(elapsed / t.dur * pathLen),
            pathLen - 1
          );
          for (let i = t.fillIdx; i <= revealIdx; i++) {
            this.surface.clearAt(startPxIdx + (revealOrder ? revealOrder[i] : i));
          }
          t.fillIdx = Math.max(t.fillIdx, revealIdx + 1);
        }
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
        } catch (_) {
        }
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
  };
  async function createRevealPlayer(params) {
    const img = await rawImg(params.source);
    const decoded = decodeContainer(img);
    return new RevealPlayer(img, decoded, params);
  }
  async function createSeekableReveal({
    source,
    entry = null,
    className
  }) {
    const img = await rawImg(source);
    const decoded = decodeContainer(img);
    return {
      reveal: new SeekableReveal(img, decoded.opts, entry, { className }),
      entries: decoded.entries,
      opts: decoded.opts
    };
  }

  // src/Stegassette/browser.ts
  function estimatedHeaderPixels2(opts, plan, params, entryCount) {
    return packStgcHeader({
      combine: opts.combine || "xor",
      keymap: resolveKeymapName(opts),
      traversal: opts.traversal || "raster",
      interiorByteLength: 0,
      entryCount,
      params,
      ch: isDefaultPlan(plan) || plan.broadcast ? void 0 : serializeChannelPlan(plan.slots),
      pad: plan.pad,
      pack: plan.pack
      // nibble pairs: two border pixels per header byte, plus the ring-start
      // B bootstrap and even-offset alignment
    }).length * 2 + 8;
  }
  function ringPixelCount2(W, H, B) {
    return W * H - Math.max(0, W - 2 * B) * Math.max(0, H - 2 * B);
  }
  function imgFromSource(source) {
    const w = "naturalWidth" in source ? source.naturalWidth : source.width;
    const h = "naturalHeight" in source ? source.naturalHeight : source.height;
    const { canvas: canvas2, context } = createCanvasAndContext(w, h);
    context.drawImage(source, 0, 0);
    const id = context.getImageData(0, 0, w, h);
    return new Img(w, h, id.data);
  }
  function canvasFromImageData(imgData) {
    const { canvas: canvas2, context } = createCanvasAndContext(imgData.width, imgData.height);
    const id = context.createImageData(imgData.width, imgData.height);
    id.data.set(imgData.data instanceof Uint8Array ? imgData.data : new Uint8Array(imgData.data));
    context.putImageData(id, 0, 0);
    return canvas2;
  }
  function encode({
    source,
    entries,
    border = 0,
    aspectRatio,
    ...opts
  }) {
    const src = source instanceof Img ? source : "data" in source ? new Img(source.width, source.height, source.data) : imgFromSource(source);
    const plan = opts.plan ?? normalizeChannelPlan(
      { combine: opts.combine, pack: opts.pack, channels: opts.channels },
      opts.bytesPerSample ?? 3,
      entryTableSize(entries)
    );
    const keyless = isKeylessKeymap(resolveKeymapName(opts));
    const aspect = aspectRatio ?? src.width / src.height;
    const totalBytes = containerInteriorBytes(entries) + plan.pad;
    const dataPx = Math.ceil(totalBytes / plan.bytesPerPixel);
    let B = resolveBorderWidth(border, dataPx, aspect, keyless);
    const params = {
      ...opts.params || {},
      ...opts.seed != null ? { seed: opts.seed } : {},
      ...opts.a != null ? { a: opts.a } : {},
      ...opts.b != null ? { b: opts.b } : {},
      ...opts.kx != null ? { kx: opts.kx } : {},
      ...opts.ky != null ? { ky: opts.ky } : {}
    };
    const headerPx = estimatedHeaderPixels2(opts, plan, params, entries.length);
    let scaled = autoScaleImg(
      src,
      totalBytes,
      B,
      aspectRatio ?? null,
      plan.bytesPerPixel,
      1,
      keyless
    );
    while (ringPixelCount2(scaled.width, scaled.height, B) < headerPx) {
      if (B > 255) throw new Error("STGC header does not fit any border");
      B += 1;
      scaled = autoScaleImg(
        src,
        totalBytes,
        B,
        aspectRatio ?? null,
        plan.bytesPerPixel,
        1,
        keyless
      );
    }
    const outImg = encodeContainer(
      entries,
      scaled,
      { ...opts, borderWidth: B, plan },
      scaled
    );
    return canvasFromImageData(outImg);
  }
  function decode({
    source
  }) {
    const img = source instanceof Img ? source : "data" in source ? new Img(source.width, source.height, source.data) : imgFromSource(source);
    return decodeContainer(img);
  }
  return __toCommonJS(stegassette_exports);
})();
//# sourceMappingURL=stegassette.global.js.map