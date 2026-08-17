/**
 * The parameters, described rather than merely typed.
 *
 * A camera has settings that only mean something in some modes — a per-frame
 * weight is meaningless when the stack takes the brightest value each pixel
 * ever reached, because there is no weight for it to bias. Left to a plain
 * object those controls stay live and do nothing, which reads as a bug in the
 * renderer. `inert` puts that knowledge next to the parameter it constrains, so
 * a UI can grey the control and say why, and a headless caller can check the
 * same rule.
 */

/**
 * How overlapping frames combine. "mean" sums the frames by weight, so a
 * moving subject spreads its light across everywhere it went and dims
 * accordingly. "max" keeps the brightest value each pixel ever reached, so a
 * moving light holds full intensity along its whole path — the difference
 * between a blurred lamp and a light trail.
 */
export type StackMode = "mean" | "max";

/**
 * Capture-time parameters. These are burned into the accumulation as it is
 * exposed — changing them means a new exposure, or a `restack` when the
 * negative was kept.
 */
export interface ExposureParams {
  /** Frames to stack. Shutter time is this over the camera's frame rate. */
  frames: number;
  /** How overlapping frames combine. */
  stack: StackMode;
}

/**
 * Post-processing parameters. `develop()` re-renders the held exposure with
 * these on every call — no recapture, so they are free to drive live.
 */
export interface DevelopParams {
  /**
   * Trail weighting, develop-time despite acting on the burst: the
   * accumulator keeps the sum and the position-weighted sum, and a linear
   * weight is a mix of the two. 0 weights every frame alike; 1 weights the
   * last frame 7x the first, so trails follow; -1 the reverse, so trails
   * lead. Nothing to weight under the "max" stack.
   */
  trail: number;
  /** Stops, applied before the shoulder. */
  exposure: number;
  /** How much of the filmic shoulder to travel toward. */
  rolloff: number;
  /** Strength of light bleeding past its own edges. */
  halation: number;
  /** Re-expansion of near-clipped values before the bloom is taken. */
  headroom: number;
  /** 0 crushes halation to film red-orange, 1 keeps the source's own hue. */
  halationHue: number;
  /** Black point, applied after the split tone. */
  black: number;
  /** How far toward the blurred copy the image travels. */
  softness: number;
  grain: number;
  /** Sub-degree rotation plus radial chromatic aberration. */
  drift: number;
  /** Strength of the shadow/highlight tone split. */
  split: number;
  /** Degrees. */
  shadowHue: number;
  /** Degrees. */
  highlightHue: number;
  vignette: number;
}

export type PhotographyParams = ExposureParams & DevelopParams;

export interface ParamDef {
  key: keyof PhotographyParams;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Appended when formatting. */
  unit?: string;
  /** Decimal places when formatting. Defaults to 2. */
  precision?: number;
  group?: string;
  /**
   * Why this parameter is being ignored given the rest of the state, or null
   * when it applies. The string is meant to be shown.
   */
  inert?: (state: PhotographyParams) => string | null;
}

export const EXPOSURE_SCHEMA: ParamDef[] = [
  {
    key: "frames",
    label: "Motion",
    min: 1,
    // 32 at the slow 15fps rate is a two-second exposure. The accumulator is
    // indifferent to the count — weights normalize at resolve — so the cap is
    // capture time, not precision.
    max: 32,
    step: 1,
    value: 8,
    unit: "f",
    precision: 0,
  },
];

export const DEVELOP_SCHEMA: ParamDef[] = [
  {
    key: "trail",
    label: "Trail",
    min: -1,
    max: 1,
    step: 0.01,
    value: 0.55,
    group: "Motion",
    inert: (s) =>
      s.stack === "max"
        ? "Light trails keeps the brightest value each pixel reached, so there is no per-frame weight for this to bias."
        : null,
  },
  // ±3 stops, not ±1: a mean stack dims anything that moves — a subject
  // crossing N frames keeps 1/N of its light — and one stop cannot buy that
  // back. The shoulder is what keeps +3 from clipping.
  { key: "exposure", label: "Exposure", min: -3, max: 3, step: 0.01, value: 0, group: "Light" },
  { key: "rolloff", label: "Rolloff", min: 0, max: 1, step: 0.01, value: 0.55, group: "Light" },
  { key: "halation", label: "Halation", min: 0, max: 1, step: 0.01, value: 0.3, group: "Light" },
  {
    key: "headroom",
    label: "Headroom",
    min: 0,
    max: 1,
    step: 0.01,
    value: 0.35,
    group: "Light",
    inert: (s) =>
      s.halation > 0 ? null : "Headroom only feeds the halation bloom, which is off.",
  },
  {
    key: "halationHue",
    label: "Bloom hue",
    min: 0,
    max: 1,
    step: 0.01,
    value: 0.5,
    group: "Light",
    inert: (s) => (s.halation > 0 ? null : "Tints the halation bloom, which is off."),
  },
  { key: "black", label: "Black", min: 0, max: 1, step: 0.01, value: 0.15, group: "Light" },

  { key: "softness", label: "Softness", min: 0, max: 1, step: 0.01, value: 0.38, group: "Texture" },
  { key: "grain", label: "Grain", min: 0, max: 1, step: 0.01, value: 0.35, group: "Texture" },
  { key: "drift", label: "Drift", min: 0, max: 1, step: 0.01, value: 0.3, group: "Texture" },

  { key: "split", label: "Split", min: 0, max: 1, step: 0.01, value: 0.4, group: "Colour" },
  {
    key: "shadowHue",
    label: "Shadows",
    min: 0,
    max: 360,
    step: 1,
    value: 196,
    unit: "°",
    precision: 0,
    group: "Colour",
    inert: (s) => (s.split > 0 ? null : "Split is at zero — no tone to push."),
  },
  {
    key: "highlightHue",
    label: "Highlights",
    min: 0,
    max: 360,
    step: 1,
    value: 38,
    unit: "°",
    precision: 0,
    group: "Colour",
    inert: (s) => (s.split > 0 ? null : "Split is at zero — no tone to push."),
  },
  { key: "vignette", label: "Falloff", min: 0, max: 1, step: 0.01, value: 0.12, group: "Colour" },
];

export const SCHEMA: ParamDef[] = [...EXPOSURE_SCHEMA, ...DEVELOP_SCHEMA];

/** Every parameter at its documented default, plus the default stack mode. */
export function defaultParams(): PhotographyParams {
  const out: Record<string, number | string> = { stack: "mean" };
  for (const def of SCHEMA) out[def.key] = def.value;
  return out as unknown as PhotographyParams;
}

export function formatParam(def: ParamDef, value: number): string {
  return value.toFixed(def.precision ?? 2) + (def.unit ?? "");
}

/** Null when the parameter applies, otherwise the reason it does not. */
export function inertReason(def: ParamDef, state: PhotographyParams): string | null {
  return def.inert?.(state) ?? null;
}
