import { createForm } from "../createForm";
import { EffectChain } from "./chain";
import { bloom, crt, field, type Params } from "./passes";

type FormData = {
  source: string;
  hues: number;
  warp: number;
  softness: number;
  trail: number;
  bloom: number;
  bloomThreshold: number;
  curvature: number;
  scanLines: number;
  chromatic: number;
  grain: number;
  blur: number;
  degrade: number;
  ghosting: number;
  brightness: number;
};

/** oklch → linear sRGB. @amplib/color keeps its own colour maths private. */
function oklchToLinearRGB(L: number, C: number, H: number): [number, number, number] {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.6956202966 * s),
  ];
}

export function example(): void {
  const section = document.querySelector("section")!;
  const form = section.querySelector("form")!;
  const canvas = section.querySelector<HTMLCanvasElement>("[data-canvas]")!;
  const notes = section.querySelector('[data-output="notes"]')!;
  const chainOut = section.querySelector('[data-output="chain"]')!;
  const fileInput = section.querySelector<HTMLInputElement>("[data-file]")!;
  form.innerHTML = "";

  // External TexImageSource for the filter-only chains.
  const bars = document.createElement("canvas");
  bars.width = 640;
  bars.height = 360;
  const barsCtx = bars.getContext("2d")!;

  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;

  let hasVideo = false;
  fileInput.addEventListener("change", () => {
    const [file] = fileInput.files ?? [];
    if (!file) return;
    video.src = URL.createObjectURL(file);
    video.play().catch(() => {});
    hasVideo = true;
    setValue("source", "video");
  });

  const { values, setValue } = createForm<FormData>({
    form,
    inputs: {
      source: {
        name: "source",
        type: "select",
        value: "field",
        options: ["field", "bars", "video"],
      },
      hues: { name: "hues (recompiles)", type: "range", value: 5, min: 1, max: 12, step: 1 },
      warp: { name: "warp", type: "range", value: 0.25, min: 0, max: 1, step: 0.01 },
      softness: { name: "softness", type: "range", value: 0.18, min: 0.01, max: 0.5, step: 0.01 },
      trail: { name: "trail", type: "range", value: 0.9, min: 0, max: 0.99, step: 0.01 },
      bloom: { name: "bloom", type: "range", value: 0.6, min: 0, max: 2, step: 0.01 },
      bloomThreshold: { name: "bloom threshold", type: "range", value: 0.55, min: 0, max: 1, step: 0.01 },
      curvature: { name: "curvature", type: "range", value: 0.45, min: -1, max: 1, step: 0.01 },
      scanLines: { name: "scan lines", type: "range", value: 240, min: 0, max: 900, step: 1 },
      chromatic: { name: "chromatic", type: "range", value: 0.0025, min: 0, max: 0.01, step: 0.0001 },
      grain: { name: "grain", type: "range", value: 0.025, min: 0, max: 0.08, step: 0.001 },
      blur: { name: "blur", type: "range", value: 0.35, min: 0, max: 1, step: 0.01 },
      degrade: { name: "degraded color", type: "range", value: 0.3, min: 0, max: 1, step: 0.01 },
      ghosting: { name: "ghosting", type: "range", value: 0.25, min: 0, max: 1, step: 0.01 },
      brightness: { name: "brightness", type: "range", value: 1.05, min: 0.7, max: 1.4, step: 0.01 },
    },
    debounce: 0,
    onInput: (v, changed) => {
      if (changed.includes("source")) applyChain(v.source);
    },
  });

  let slotRGB = new Float32Array(0);
  let slotW = new Float32Array(0);
  let paletteN = -1;

  /**
   * Equal sectors of perceptual hue, straight to linear RGB. Rebuilt when the
   * slot count changes, which is also when `field` recompiles for its N_HUES.
   */
  function rebuildPalette(n: number): void {
    if (n === paletteN) return;
    paletteN = n;
    slotRGB = new Float32Array(n * 3);
    slotW = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [r, g, b] = oklchToLinearRGB(0.68, 0.3, ((i + 0.5) * 360) / n);
      slotRGB[i * 3] = r;
      slotRGB[i * 3 + 1] = g;
      slotRGB[i * 3 + 2] = b;
    }
  }

  const chain = new EffectChain<Params>(canvas, []);

  /** Only the front of the array changes; `field` is dropped, not reconfigured. */
  function applyChain(source: string): void {
    chain.setPasses(source === "field" ? [field, bloom, crt] : [bloom, crt]);
    chainOut.textContent =
      source === "field"
        ? "[field, bloom, crt]   render(null, params)"
        : `[bloom, crt]   render(${source === "video" ? "videoEl" : "barsCanvas"}, params)`;
  }
  applyChain(values.source);

  let impulse = 0;
  let lastBeat = -1;

  function drawBars(t: number): void {
    const w = bars.width;
    const h = bars.height;
    const cols = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
    for (let i = 0; i < cols.length; i++) {
      barsCtx.fillStyle = cols[i];
      barsCtx.fillRect((i / cols.length) * w, 0, w / cols.length + 1, h * 0.75);
    }
    barsCtx.fillStyle = "#101010";
    barsCtx.fillRect(0, h * 0.75, w, h * 0.25);
    barsCtx.fillStyle = "#f0f0f0";
    barsCtx.font = "bold 42px monospace";
    barsCtx.textBaseline = "middle";
    barsCtx.fillText(`${(t % 100).toFixed(2)}`, 24, h * 0.875);
    barsCtx.beginPath();
    barsCtx.arc(w * 0.5 + Math.sin(t * 1.1) * w * 0.3, h * 0.875, 22, 0, Math.PI * 2);
    barsCtx.fill();
  }

  function loop(): void {
    requestAnimationFrame(loop);
    const t = performance.now() / 1000;

    const n = Math.round(values.hues);
    rebuildPalette(n);

    // Stand-in for a domain signal.
    const beat = Math.floor(t * 0.5);
    if (beat !== lastBeat) {
      lastBeat = beat;
      impulse = 1;
    }
    impulse *= 0.94;

    for (let i = 0; i < n; i++) {
      const phase = t * 0.35 + (i / n) * Math.PI * 2;
      slotW[i] = Math.max(0, Math.sin(phase)) ** 2;
    }

    const params: Params = {
      hues: n,
      slotRGB,
      slotW,
      energy: 0.4 + 0.35 * Math.sin(t * 0.23),
      motion: 0.3 + 0.3 * Math.sin(t * 0.41 + 1.2),
      x: 0.5 + 0.35 * Math.sin(t * 0.17),
      y: 0.5 + 0.3 * Math.cos(t * 0.13),
      impulse,
      warp: values.warp,
      softness: values.softness,
      trail: values.trail,
      bloom: values.bloom,
      bloomThreshold: values.bloomThreshold,
      curvature: values.curvature,
      scanLines: values.scanLines,
      chromatic: values.chromatic,
      grain: values.grain,
      blur: values.blur,
      degrade: values.degrade,
      ghosting: values.ghosting,
      brightness: values.brightness,
    };

    let source: TexImageSource | null = null;
    if (values.source === "bars") {
      drawBars(t);
      source = bars;
    } else if (values.source === "video" && hasVideo && video.readyState >= 2) {
      source = video;
    }

    chain.render(source, params);

    const lines: string[] = [];
    if (chain.contextLost) lines.push("WebGL context lost.");
    for (const s of chain.skipped) lines.push(`skipped ${s.name}: ${s.reason}`);
    if (values.source === "video" && !hasVideo) {
      lines.push("No video chosen yet — choose a file above, or switch source.");
    }
    notes.textContent = lines.length ? lines.join("\n") : "All passes active.";
  }

  loop();
}
