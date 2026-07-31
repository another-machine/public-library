import {
  Stegassette,
  loadAudioBuffersFromAudioUrl,
} from "../../../packages/amplib-steganography/src";
import { createForm } from "../createForm";

const ASPECT_OPTIONS = [
  "source",
  "1:1",
  "4:3",
  "3:2",
  "16:9",
  "2:3",
  "3:4",
  "9:16",
] as const;
type AspectOption = (typeof ASPECT_OPTIONS)[number];

function parseAspect(opt: AspectOption): number | null {
  if (opt === "source") return null;
  const [w, h] = opt.split(":").map(Number);
  return w / h;
}

type FormData = {
  combine: string;
  keymap: string;
  traversal: string;
  /** Which colour channels carry payload — the rest keep the cover. */
  channelPlan: "rgb" | "rg" | "r";
  bitsPerSample: "8" | "16" | "24";
  channels: "1" | "2";
  sampleRate: number;
  border: number;
  aspectRatio: AspectOption;
};

export default async function example() {
  const section = document.getElementById("example-stegassette-audio")!;
  const sourceImg = section.querySelector<HTMLImageElement>("figure img")!;
  const form = section.querySelector("form")!;
  const caption = section.querySelector<HTMLElement>("#stegassette-caption")!;
  const imgWrap = section.querySelector<HTMLElement>("#stegassette-img-wrap")!;
  const baseCanvas = section.querySelector<HTMLCanvasElement>(
    "#stegassette-recon-base",
  )!;
  const overlayCanvas = section.querySelector<HTMLCanvasElement>(
    "#stegassette-encoded-overlay",
  )!;
  // Use getAttribute so Parcel's hashed filename is resolved at runtime
  const audioUrl = section.querySelector("audio")!.getAttribute("src")!;
  const audioContext = new AudioContext();

  const baseCtx = baseCanvas.getContext("2d")!;
  const overlayCtx = overlayCanvas.getContext("2d")!;

  // ── Cached state ────────────────────────────────────────────────────────
  let cachedAudioKey = "";
  let cachedAudioBuffers: Float32Array[] | null = null;
  let cachedEncodeKey = "";
  let encodedCanvas: HTMLCanvasElement | null = null;

  // ── Playback / reveal state ─────────────────────────────────────────────
  interface RevealState {
    opts: Stegassette.StgcOpts;
    pathIdx: Uint32Array;
    revealOrder: Int32Array;
    audioStartPxIdx: number;
    audioEndPxIdx: number;
    dur: number;
    IW: number;
    IH: number;
    B: number;
  }

  let revealState: RevealState | null = null;
  let audioSrc: AudioBufferSourceNode | null = null;
  let rafId: number | null = null;
  let t0 = 0;
  let playing = false;
  /** Guard: true while the async click handler is in flight (before audio starts). */
  let decoding = false;

  function setCaption(text: string) {
    caption.textContent = text;
  }

  function clearOverlayAt(v: number) {
    if (!revealState) return;
    const { pathIdx, opts, IW, IH, B } = revealState;
    const lx = v % IW,
      ly = (v / IW) | 0;
    overlayCtx.clearRect(lx + B, ly + B, 1, 1);
    // A keyless encode has no paired key pixel: every interior pixel is a data
    // pixel, so there is no partner to clear alongside this one.
    if (Stegassette.isKeylessKeymap(opts.keymap)) return;
    const [klx, kly] = Stegassette.KEYMAP[
      opts.keymap as Stegassette.LocatingKeymapName
    ](lx, ly, IW, IH, opts.params ?? {});
    overlayCtx.clearRect(klx + B, kly + B, 1, 1);
  }

  function fillNonAudioPixels() {
    if (!revealState) return;
    const { pathIdx, audioStartPxIdx, audioEndPxIdx } = revealState;
    for (let i = 0; i < audioStartPxIdx; i++) clearOverlayAt(pathIdx[i]);
    for (let i = audioEndPxIdx; i < pathIdx.length; i++)
      clearOverlayAt(pathIdx[i]);
  }

  function drawEncodedOverlay() {
    if (!encodedCanvas || !revealState) return;
    const { B } = revealState;
    overlayCtx.drawImage(encodedCanvas, 0, 0);
    // Clear border so reconstruction shows through
    const W = overlayCanvas.width,
      H = overlayCanvas.height;
    overlayCtx.clearRect(0, 0, W, B);
    overlayCtx.clearRect(0, H - B, W, B);
    overlayCtx.clearRect(0, 0, B, H);
    overlayCtx.clearRect(W - B, 0, B, H);
  }

  function stopPlayback() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (audioSrc) {
      try {
        audioSrc.stop();
      } catch (_) {}
      audioSrc = null;
    }
    playing = false;
    if (encodedCanvas) {
      drawEncodedOverlay();
      setCaption("tap to play");
      imgWrap.style.cursor = "pointer";
    }
  }

  function revealFrame() {
    if (!revealState || !audioSrc) return;
    const { dur, audioStartPxIdx, revealOrder } = revealState;
    const elapsed =
      Math.max(0, audioContext.currentTime - t0) % Math.max(dur, 0.001);
    const pathLen = revealState.audioEndPxIdx - audioStartPxIdx;
    const revealIdx = Math.min(
      Math.floor((elapsed / dur) * pathLen),
      pathLen - 1,
    );

    // Detect loop: if elapsed wrapped back near 0, redraw overlay and reset
    if (elapsed < 0.1 && rafId != null) {
      drawEncodedOverlay();
      fillNonAudioPixels();
    }

    // Clear newly-revealed pixels up to current audio position
    for (let i = 0; i <= revealIdx; i++) {
      clearOverlayAt(revealState.pathIdx[audioStartPxIdx + revealOrder[i]]);
    }

    rafId = requestAnimationFrame(revealFrame);
  }

  // ── Click handler: play / stop ──────────────────────────────────────────
  imgWrap.addEventListener("click", async () => {
    if (!encodedCanvas || decoding) return;
    if (playing) {
      stopPlayback();
      return;
    }

    // Guard against double-clicks during async decode
    decoding = true;
    try {
      await audioContext.resume();

      const { entries, opts } = Stegassette.decode({ source: encodedCanvas });
      section
        .querySelectorAll<HTMLElement>(`[data-output="decode-opts"]`)
        .forEach(
          (el) =>
            (el.innerText = `// opts: ${JSON.stringify({ combine: opts.combine, keymap: opts.keymap, traversal: opts.traversal })}`),
        );

      if (!entries.length || !Stegassette.isAudioEntry(entries[0])) return;

      const parsed = Stegassette.parseAudioEntry(entries[0]);
      const { sampleRate, layout, blockSize, bitsPerSample } = parsed;
      const audioChannels = parsed.channels;
      const entry = entries[0];

      // Build reveal metadata
      const W = encodedCanvas.width,
        H = encodedCanvas.height;
      const B = opts.borderWidth;
      const IW = W - 2 * B,
        IH = H - 2 * B;
      // The keyless flag is load-bearing, not cosmetic: without it the path
      // covers only the checkerboard half of the interior, so every reveal
      // position after the first would point at the wrong pixel.
      const pathIdx = Stegassette.getPathIndices(
        IW,
        IH,
        opts.traversal,
        opts.params ?? {},
        Stegassette.isKeylessKeymap(opts.keymap),
      );
      const bpp = opts.plan?.bytesPerPixel ?? 3;
      const audioStartPxIdx = Math.floor(entry.dataOffset / bpp);
      const audioEndPxIdx = Math.ceil(
        (entry.dataOffset + entry.data.length) / bpp,
      );
      const pathLen = audioEndPxIdx - audioStartPxIdx;
      const revealOrder = Stegassette.computeRevealOrder({
        pathLen,
        channels: audioChannels.length,
        bits: bitsPerSample,
        layout,
        blockSize,
        bytesPerPixel: bpp,
      });
      const dur = audioChannels[0].length / sampleRate;

      revealState = {
        opts,
        pathIdx,
        revealOrder,
        audioStartPxIdx,
        audioEndPxIdx,
        dur,
        IW,
        IH,
        B,
      };
      fillNonAudioPixels();

      // Build AudioBuffer and start looping
      const buf = audioContext.createBuffer(
        audioChannels.length,
        audioChannels[0].length,
        sampleRate,
      );
      for (let ch = 0; ch < audioChannels.length; ch++)
        buf.getChannelData(ch).set(audioChannels[ch]);
      const node = audioContext.createBufferSource();
      node.buffer = buf;
      node.loop = true;
      node.connect(audioContext.destination);
      t0 = audioContext.currentTime + 0.02;
      node.start(t0);
      audioSrc = node;
      playing = true;
      setCaption(
        Stegassette.isKeylessKeymap(opts.keymap)
          ? "tap to stop — keyless: the data empties as it plays"
          : "tap to stop",
      );
      rafId = requestAnimationFrame(revealFrame);
    } finally {
      decoding = false;
    }
  });

  /**
   * The combine actually used, given the selected keymap.
   *
   * Both dropdowns are free, but the six combines that rewrite the key pixel
   * need a key pixel to rewrite — a keyless keymap has none, and the encode
   * would throw. Fall back to xor so every pairing of the two controls does
   * something, and say so in the code block rather than failing silently.
   */
  function resolveCombine(data: FormData): Stegassette.CombineName {
    const combine = data.combine as Stegassette.CombineName;
    if (
      Stegassette.isKeylessKeymap(data.keymap as Stegassette.KeymapName) &&
      Stegassette.KEY_MOD[combine]
    ) {
      return "xor";
    }
    return combine;
  }

  // ── Form ────────────────────────────────────────────────────────────────
  const { values } = createForm<FormData>({
    form,
    inputs: {
      combine: {
        type: "select",
        options: [
          "xor",
          "additive",
          "subtractive",
          "signed",
          "bitshift",
          "echo",
          "veil",
          "whisper",
          "midpoint",
          "difference",
          "noise",
        ],
        value: "xor",
        name: "combine",
      },
      // Which colour channels carry payload. Channels left out of the plan are
      // never written, so they keep the cover at full resolution — the one way
      // a keyless encode gets a real picture back.
      // Any subset of r/g/b in any order. The subset decides how many bytes a
      // pixel holds and which channels keep the cover; the order decides which
      // payload byte lands in which channel, which is what sets the colour cast.
      channelPlan: {
        type: "select",
        options: ["rgb", "bgr", "grb", "rg", "gb", "br", "r", "g", "b"],
        value: "rgb",
        name: "channelPlan",
      },
      keymap: {
        type: "select",
        // The last two are keyless — they generate the key from position
        // instead of reserving a pixel for it, which halves the image and
        // leaves no cover to develop. Taken from the package so the list
        // cannot drift from what the codec accepts.
        options: [...Stegassette.KEYMAP_NAMES],
        value: "adjacent",
        name: "keymap",
      },
      traversal: {
        type: "select",
        options: [
          "raster",
          "boustrophedon",
          "spiral",
          "center-out",
          "polar",
          "bayer",
          "hilbert",
          "angle",
          "fisher-yates",
        ],
        value: "raster",
        name: "traversal",
      },
      bitsPerSample: {
        type: "select",
        options: ["8", "16", "24"],
        value: "16",
        name: "bitsPerSample",
      },
      channels: {
        type: "select",
        options: ["1", "2"],
        value: "2",
        name: "channels",
      },
      sampleRate: {
        type: "range",
        min: 8000,
        max: 48000,
        value: audioContext.sampleRate,
        name: "sampleRate",
      },
      border: {
        name: "border",
        type: "number",
        value: 1,
        min: 1,
      },
      aspectRatio: {
        type: "select",
        options: [...ASPECT_OPTIONS],
        value: "source",
        name: "aspectRatio",
      },
    },
    onInput: run,
  });

  sourceImg.onload = () => run(values);

  /**
   * What the current settings actually cost, read back off the encoded image.
   *
   * The two levers trade against each other and the trade is not obvious from
   * the option names, so it is measured rather than described: a keyless keymap
   * halves the pixel count and takes the cover with it, while dropping a
   * channel from the plan hands the cover back at full resolution and costs
   * pixels. Reported together because that is the only way to see the exchange.
   */
  function reportEncodeShape(
    W: number,
    H: number,
    opts: Stegassette.StgcOpts,
  ) {
    const slots = opts.plan?.slots ?? [];
    const carrying = new Set(slots.map((s) => s.ch));
    const kept = (["r", "g", "b"] as const).filter((_, i) => !carrying.has(i as 0 | 1 | 2));
    const keyless = Stegassette.isKeylessKeymap(opts.keymap);
    const px = (W * H) / 1000;

    const lines = [
      `// ${W}×${H} = ${px.toFixed(0)}k px · ${opts.plan?.bytesPerPixel ?? 3} byte/px`,
      keyless
        ? `// keyless — no key pixels reserved, so every interior pixel carries payload`
        : `// keyed — half the interior is reserved for key pixels`,
      kept.length
        ? `// ${kept.join("+")} never written: cover survives there at full resolution`
        : `// every channel carries payload${keyless ? " — nothing of the cover survives" : ""}`,
    ];
    section
      .querySelectorAll<HTMLElement>(`[data-output="encode-shape"]`)
      .forEach((el) => (el.innerText = lines.join("\n")));
  }

  // ── Encode + reconstruct + display ──────────────────────────────────────
  async function run(data: FormData) {
    if (!sourceImg.naturalWidth || !sourceImg.naturalHeight) return;
    stopPlayback();
    revealState = null;

    // The resolved combine, not the raw selection — the code block has to show
    // what actually ran, or it reads as a lie whenever the fallback fires.
    section
      .querySelectorAll<HTMLElement>(`[data-value="combine"]`)
      .forEach((el) => (el.innerText = resolveCombine(data)));
    section
      .querySelectorAll<HTMLElement>(`[data-value="keymap"]`)
      .forEach((el) => (el.innerText = data.keymap));
    section
      .querySelectorAll<HTMLElement>(`[data-value="traversal"]`)
      .forEach((el) => (el.innerText = data.traversal));
    section
      .querySelectorAll<HTMLElement>(`[data-value="bitsPerSample"]`)
      .forEach((el) => (el.innerText = data.bitsPerSample));
    section
      .querySelectorAll<HTMLElement>(`[data-value="channels"]`)
      .forEach((el) => (el.innerText = data.channels));
    section
      .querySelectorAll<HTMLElement>(`[data-value="sampleRate"]`)
      .forEach((el) => (el.innerText = String(data.sampleRate)));
    section
      .querySelectorAll<HTMLElement>(`[data-value="border"]`)
      .forEach((el) => (el.innerText = String(data.border)));
    section
      .querySelectorAll<HTMLElement>(`[data-value="aspectRatio"]`)
      .forEach(
        (el) =>
          (el.innerText =
            data.aspectRatio === "source"
              ? "undefined"
              : String(parseAspect(data.aspectRatio)?.toFixed(4))),
      );

    const encodeKey = `${data.combine}|${data.keymap}|${data.traversal}|${data.channelPlan}|${data.bitsPerSample}|${data.channels}|${data.sampleRate}|${data.border}|${data.aspectRatio}`;
    if (encodeKey === cachedEncodeKey && encodedCanvas) {
      displayEncoded();
      return;
    }

    try {
      const channelCount = (data.channels === "2" ? 2 : 1) as 1 | 2;
      const bitsPerSample = Number(data.bitsPerSample) as 8 | 16 | 24;
      const sampleRate = data.sampleRate;

      const audioKey = `${channelCount}|${sampleRate}`;
      if (audioKey !== cachedAudioKey || !cachedAudioBuffers) {
        cachedAudioBuffers = await loadAudioBuffersFromAudioUrl({
          url: audioUrl,
          audioContext,
          channels: channelCount,
          sampleRate,
        });
        cachedAudioKey = audioKey;
      }

      encodedCanvas = Stegassette.encode({
        source: sourceImg,
        entries: [
          Stegassette.buildAudioEntry({
            channels: cachedAudioBuffers,
            sampleRate,
            bitsPerSample,
            name: "example.pcm",
          }),
        ],
        combine: resolveCombine(data),
        keymap: data.keymap as Stegassette.KeymapName,
        traversal: data.traversal as Stegassette.TraversalName,
        channels: data.channelPlan,
        border: data.border,
        aspectRatio: parseAspect(data.aspectRatio) ?? undefined,
      });
      cachedEncodeKey = encodeKey;

      displayEncoded();
    } catch (err) {
      encodedCanvas = null;
      cachedEncodeKey = "";
      // Preserve the figcaption node; clear canvases with a status message instead
      baseCanvas.width = 0;
      overlayCanvas.width = 0;
      setCaption(`Error: ${err}`);
      imgWrap.style.cursor = "";
    }
  }

  function displayEncoded() {
    if (!encodedCanvas) return;
    const W = encodedCanvas.width,
      H = encodedCanvas.height;

    // Size and draw the base + overlay canvases at 1:1 pixel scale
    baseCanvas.width = W;
    baseCanvas.height = H;
    overlayCanvas.width = W;
    overlayCanvas.height = H;

    // Decode and reconstruct the cover
    const { opts } = Stegassette.decode({ source: encodedCanvas });
    reportEncodeShape(W, H, opts);
    const encImg = Stegassette.imgFromSource(encodedCanvas);
    const recon = Stegassette.reconstructCover(encImg, opts);

    // Draw reconstruction (smoothly upscaled to W×H if half-res) into base layer
    const tmpRec = document.createElement("canvas");
    tmpRec.width = recon.width;
    tmpRec.height = recon.height;
    const tmpCtx = tmpRec.getContext("2d")!;
    const reconImageData = new ImageData(
      recon.data instanceof Uint8ClampedArray
        ? recon.data
        : new Uint8ClampedArray(recon.data.buffer),
      recon.width,
      recon.height,
    );
    tmpCtx.putImageData(reconImageData, 0, 0);
    baseCtx.imageSmoothingEnabled = true;
    baseCtx.drawImage(tmpRec, 0, 0, W, H);

    // Draw encoded image into overlay (clearing border so recon shows through).
    // Don't call drawEncodedOverlay() here — revealState isn't set yet.
    // Keyless keeps its ring opaque: the border is the only real picture such
    // an encode has, and clearing it would swap that for the blank interior.
    const B = opts.borderWidth;
    overlayCtx.drawImage(encodedCanvas, 0, 0);
    if (!Stegassette.isKeylessKeymap(opts.keymap)) {
      overlayCtx.clearRect(0, 0, W, B);
      overlayCtx.clearRect(0, H - B, W, B);
      overlayCtx.clearRect(0, 0, B, H);
      overlayCtx.clearRect(W - B, 0, B, H);
    }

    setCaption("tap to play");
    imgWrap.style.cursor = "pointer";
  }
}
