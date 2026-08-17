import { createForm } from "../createForm";
import {
  Camera,
  DEVELOP_SCHEMA,
  Darkroom,
  EXPOSURE_SCHEMA,
  SCHEMA,
  defaultParams,
  inertReason,
  type PhotographyParams,
  type StackMode,
} from "../../../packages/amplib-photography/src";

/** Half the capture resolution while a control is moving. */
const PREVIEW_SCALE = 0.5;
/** No range input reports the end of a drag reliably, so idle stands in for it. */
const COMMIT_MS = 350;

type FormData = Record<string, number | string>;

export function example(): void {
  const section = document.querySelector("section")!;
  const form = section.querySelector("form")!;
  const video = section.querySelector<HTMLVideoElement>("[data-video]")!;
  const canvas = section.querySelector<HTMLCanvasElement>("[data-canvas]")!;
  const status = section.querySelector('[data-output="status"]')!;
  const inertOut = section.querySelector('[data-output="inert"]')!;
  form.innerHTML = "";

  // The page's own element, so the viewfinder and the frames being sampled are
  // the same thing rather than two copies of one stream.
  const camera = new Camera({ facingMode: "environment", video });

  let darkroom: Darkroom;
  try {
    darkroom = new Darkroom(canvas);
  } catch (error) {
    status.textContent = `// ${(error as Error).message}`;
    return;
  }

  // ── the form, built from the package's schema ──────────────────────────────
  //
  // createForm matches a field by its `name`, so these are the parameter keys
  // rather than prose — which suits a package page anyway, since the labels are
  // then the API.

  const inputs: Record<string, unknown> = {};
  const range = (def: (typeof SCHEMA)[number]) => ({
    name: def.key,
    type: "range" as const,
    value: def.value,
    min: def.min,
    max: def.max,
    step: def.step,
  });

  for (const def of EXPOSURE_SCHEMA) inputs[def.key] = range(def);
  inputs.stack = { name: "stack", type: "select", value: "mean", options: ["mean", "max"] };
  inputs.shutter = { name: "shutter", type: "select", value: "normal", options: ["normal", "slow"] };
  for (const def of DEVELOP_SCHEMA) inputs[def.key] = range(def);

  let params: PhotographyParams = defaultParams();
  let developed = false;
  let exposing = false;

  const developKeys = new Set<string>(DEVELOP_SCHEMA.map((d) => String(d.key)));

  const { values, setFieldHidden } = createForm<FormData>({
    form,
    inputs: inputs as never,
    // A slider that only lands half a second after release reads as broken when
    // it is driving something already on screen.
    debounce: 0,
    onInput: (v, changed) => {
      params = readParams(v);
      refreshValues();
      refreshInert();

      if (changed.includes("shutter")) {
        camera.setFrameRate(v.shutter === "slow" ? 15 : undefined).then(() => report());
      }
      if (changed.includes("frames") || changed.includes("stack")) report();
      if (developed && changed.some((k) => developKeys.has(String(k)))) {
        requestDevelop(PREVIEW_SCALE);
        scheduleCommit();
      }
    },
    actions: [
      { name: "enable camera", action: enable },
      { name: "take photo", action: takePhoto },
      { name: "flip", action: flip },
      { name: "shoot again", action: shootAgain },
      { name: "save", action: save },
    ],
  });

  const [enableBtn, shootBtn, flipBtn, againBtn, saveBtn] = [
    ...form.querySelectorAll("button"),
  ];

  function readParams(v: FormData): PhotographyParams {
    const next: PhotographyParams = { ...params, stack: v.stack as StackMode };
    for (const def of SCHEMA) {
      (next as unknown as Record<string, number>)[def.key] = Number(v[def.key]);
    }
    return next;
  }

  /**
   * The `data-value` spans in the code sample. Raw numbers rather than
   * `formatParam` — the sample is a JS object literal, and `frames: 8f` is not
   * one. `formatParam` is for a readout, where the unit is the point.
   */
  function refreshValues(): void {
    for (const def of SCHEMA) {
      const value = (params as unknown as Record<string, number>)[def.key];
      section
        .querySelectorAll<HTMLElement>(`[data-value="${def.key}"]`)
        .forEach((el) => (el.innerText = value.toFixed(def.precision ?? 2)));
    }
    section
      .querySelectorAll<HTMLElement>('[data-value="stack"]')
      .forEach((el) => (el.innerText = params.stack));
  }

  /**
   * The package decides what is inert; createForm already knows how to remove a
   * field row. Wiring those together is the whole integration.
   */
  function refreshInert(): void {
    const reasons: string[] = [];
    for (const def of SCHEMA) {
      const why = inertReason(def, params);
      setFieldHidden(def.key, !!why);
      if (why) reasons.push(`${String(def.key)} — ${why}`);
    }
    inertOut.textContent = reasons.length
      ? reasons.map((r) => `// ${r}`).join("\n")
      : "// Every parameter applies in this mode.";
  }

  // ── develop, coalesced ─────────────────────────────────────────────────────

  let raf = 0;
  let pendingScale: number | null = null;
  let commitTimer = 0;

  function requestDevelop(scale: number): void {
    pendingScale = scale; // latest request wins
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const s = pendingScale ?? 1;
      pendingScale = null;
      darkroom.develop(params, s);
      report(s);
    });
  }

  function scheduleCommit(): void {
    clearTimeout(commitTimer);
    commitTimer = window.setTimeout(() => requestDevelop(1), COMMIT_MS);
  }

  // ── actions ────────────────────────────────────────────────────────────────

  async function enable(): Promise<void> {
    enableBtn.disabled = true;
    try {
      await camera.start();
      video.dataset.mirrored = String(camera.mirrored);
      await camera.setFrameRate(values.shutter === "slow" ? 15 : undefined);
      shootBtn.disabled = false;
      flipBtn.disabled = false;
      report();
    } catch (error) {
      enableBtn.disabled = false;
      status.textContent = `// ${explain(error as Error)}`;
    }
  }

  async function takePhoto(): Promise<void> {
    if (!camera.running || exposing) return;
    exposing = true;
    shootBtn.disabled = true;
    try {
      await darkroom.expose(camera.video, {
        frames: params.frames,
        trail: params.trail,
        stack: params.stack,
        mirror: camera.mirrored,
        onProgress: (done, total) => {
          status.textContent = `// exposing ${done}/${total}`;
        },
      });
      developed = true;
      darkroom.develop(params, 1);
      showResult(true);
      report();
    } catch (error) {
      status.textContent = `// ${(error as Error).message}`;
      shootBtn.disabled = false;
    } finally {
      exposing = false;
    }
  }

  async function flip(): Promise<void> {
    if (!camera.running) return;
    await camera.flip();
    video.dataset.mirrored = String(camera.mirrored);
    report();
  }

  function shootAgain(): void {
    showResult(false);
    report();
  }

  async function save(): Promise<void> {
    if (!developed) return;
    // Re-develops at full resolution first if the last render was a preview.
    const blob = await darkroom.toBlob("image/jpeg", 0.94);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `photograph-${Date.now()}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showResult(on: boolean): void {
    canvas.toggleAttribute("hidden", !on);
    video.toggleAttribute("hidden", on);
    againBtn.disabled = !on;
    saveBtn.disabled = !on;
    shootBtn.disabled = on || !camera.running;
  }

  function report(scale = 1): void {
    const lines: string[] = [];
    if (!camera.running) {
      lines.push("Enable the camera to begin.");
    } else {
      lines.push(
        `shutter  ${camera.shutterMs(params.frames)} ms — ${params.frames} frames at ${Math.round(camera.fps)}fps`,
      );
      if (values.shutter === "slow" && camera.fps > 20) {
        lines.push("         a slower rate was requested and not granted");
      }
      const exposure = darkroom.exposure;
      if (exposure) {
        lines.push(
          `exposure ${exposure.width}×${exposure.height}, ${exposure.frames} frames, ${exposure.stack}`,
        );
        lines.push(`develop  ${canvas.width}×${canvas.height}${scale < 1 ? " (preview)" : ""}`);
      }
      if (!darkroom.floatTargets) {
        lines.push("note     no float render targets — highlights clip at 1.0");
      }
    }
    status.textContent = lines.map((l) => `// ${l}`).join("\n");
  }

  /**
   * The two ways a frame can hold a camera-capable page and still be refused are
   * worth naming, because both otherwise look like the camera being broken.
   */
  function explain(error: Error): string {
    if (error.name === "SecurityError") {
      return "Sandboxed frame with an opaque origin — the camera API refuses those.";
    }
    if (error.name === "NotAllowedError") {
      return "Camera access was blocked. Allow it, then reload.";
    }
    if (error.name === "NotFoundError") return "No camera on this device.";
    return error.message;
  }

  refreshValues();
  refreshInert();
  showResult(false);
  shootBtn.disabled = true;
  flipBtn.disabled = true;
  report();
}
