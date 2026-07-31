/**
 * Human-readable descriptions, opt-in.
 *
 * The old API attached a prose `description` to every single value, built with
 * template literals at construction time. The docs demo calls `generate()`
 * inside `requestAnimationFrame`, so that was several hundred throwaway
 * strings sixty times a second, none of which the audio path ever read.
 *
 * Descriptions are genuinely useful for debugging and for on-screen readouts,
 * so they are still here — just moved off the hot path. Call `describe()` when
 * you want text; pay nothing when you don't.
 */

import type { CosmosResult } from "./generate";
import type {
  BooleanValue,
  EventValue,
  NumberValue,
  StringValue,
  VectorValue,
} from "./values";

/** Units that read better with more or fewer decimal places. */
const PRECISION: Record<string, number> = {
  degrees: 2,
  arcseconds: 1,
  hours: 3,
  minutes: 1,
  days: 2,
  seconds: 0,
  km: 0,
  au: 4,
  "km/h": 1,
  "km/s": 3,
  percent: 1,
  magnitude: 2,
  ratio: 3,
  phase: 4,
  count: 0,
};

const UNIT_SUFFIX: Record<string, string> = {
  degrees: "°",
  arcseconds: "″",
  hours: " h",
  minutes: " min",
  days: " d",
  seconds: " s",
  km: " km",
  au: " AU",
  "km/h": " km/h",
  "km/s": " km/s",
  percent: "%",
  magnitude: " mag",
  ratio: "",
  phase: "",
  count: "",
};

function isNumberValue(value: unknown): value is NumberValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "unitRange" in value &&
    "unit" in value &&
    typeof (value as NumberValue).value === "number"
  );
}

function isStringValue(value: unknown): value is StringValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "options" in value &&
    typeof (value as StringValue).value === "string"
  );
}

function isBooleanValue(value: unknown): value is BooleanValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "unitRange" in value &&
    typeof (value as BooleanValue).value === "boolean"
  );
}

function isEventValue(value: unknown): value is EventValue {
  return (
    typeof value === "object" && value !== null && "secondsUntil" in value
  );
}

function isVectorValue(value: unknown): value is VectorValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "length" in value &&
    "x" in value &&
    "z" in value
  );
}

function formatNumber(value: NumberValue): string {
  const precision = PRECISION[value.unit] ?? 2;
  const suffix = UNIT_SUFFIX[value.unit] ?? "";
  return `${value.value.toFixed(precision)}${suffix} (${value.unitRange.toFixed(3)})`;
}

function formatDuration(seconds: number): string {
  const absolute = Math.abs(seconds);
  const direction = seconds < 0 ? "ago" : "from now";
  if (absolute < 90) return `${Math.round(absolute)} s ${direction}`;
  if (absolute < 5400) return `${(absolute / 60).toFixed(0)} min ${direction}`;
  if (absolute < 172800) return `${(absolute / 3600).toFixed(1)} h ${direction}`;
  return `${(absolute / 86400).toFixed(1)} d ${direction}`;
}

function formatEvent(value: EventValue): string {
  if (value.iso === null) return "does not occur";
  return `${value.iso} — ${formatDuration(value.secondsUntil!)}`;
}

/**
 * Walk a cosmos result and return a flat map of dotted path to description.
 *
 * ```ts
 * const text = describe(generate({ latitude: 40.7, longitude: -74 }));
 * text["moon.phase"];    // "0.5756 (0.576)"
 * text["moon.phaseName"]; // "Waning Gibbous (6 of 8)"
 * ```
 */
export function describe(result: CosmosResult): Record<string, string> {
  const output: Record<string, string> = {};

  const walk = (node: unknown, path: string) => {
    if (node === null || typeof node !== "object") return;

    if (isNumberValue(node)) {
      output[path] = formatNumber(node);
      return;
    }
    if (isStringValue(node)) {
      output[path] = `${node.value} (${node.index + 1} of ${node.options.length})`;
      return;
    }
    if (isBooleanValue(node)) {
      output[path] = node.value ? "yes" : "no";
      return;
    }
    if (isEventValue(node)) {
      output[path] = formatEvent(node);
      return;
    }
    if (isVectorValue(node)) {
      output[path] =
        `(${node.x.toFixed(3)}, ${node.y.toFixed(3)}, ${node.z.toFixed(3)}) ${node.unit}` +
        ` — length ${node.length.toFixed(3)}`;
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      walk(child, path ? `${path}.${key}` : key);
    }
  };

  // `timescales` holds the same objects as the rest of the tree, so walking it
  // would emit every signal twice under a second path.
  const { timescales: _timescales, ...rest } = result;
  walk(rest, "");

  return output;
}

/** The same thing as sorted lines, for dumping into a `<pre>` or a log. */
export function describeLines(result: CosmosResult): string {
  const described = describe(result);
  const width = Math.max(...Object.keys(described).map((key) => key.length));
  return Object.keys(described)
    .sort()
    .map((key) => `${key.padEnd(width)}  ${described[key]}`)
    .join("\n");
}
