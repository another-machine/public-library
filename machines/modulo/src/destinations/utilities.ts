import { MODES, ROOTS } from "../Notes";
import { Time as TimeUnit } from "tone/build/esm/core/type/Units";

const validateTime = (string: string) =>
  Boolean(string.match(/^((2|4|8|16|32)[dnt])|(\d+(\.\d+)?)$/));

const validateNumber = (min: number, max: number) => (value: string) => {
  const float = parseFloat(value);
  return float >= min && float <= max;
};

const validateOptions = (list: string[]) => (value: string) =>
  list.includes(value);

export const timeOptions = ["4n", "8n", "16n", "32n", "4t", "8t", "16t", "32t"];

export const validators = {
  adsrItem: validateNumber(0, 1),
  adsr: (args: string[]) => {
    if (args.length !== 4) return false;
    const validator = validateNumber(0, 1);
    return args.every(validator);
  },
  bits: validateNumber(1, 16),
  bpm: validateNumber(0, 360),
  chance: validateNumber(0, 1),
  colorL: validateNumber(0, 1),
  colorC: validateNumber(0, 0.5),
  colorH: validateNumber(0, 360),
  detune: validateNumber(-100, 100),
  feedback: validateNumber(0, 1),
  volume: validateNumber(0, 1),
  Q: validateNumber(0, 1),
  mode: validateOptions(MODES),
  octave: validateNumber(0, 7),
  oscillator: (string: string) =>
    Boolean(
      string.match(
        /^(((am|fm|fat)?(sine|square|sawtooth|triangle)(\d+)?)|pulse)$/
      )
    ),
  pan: validateNumber(-1, 1),
  portamento: validateTime,
  roomSize: validateNumber(0, 1),
  root: validateOptions(ROOTS),
  step: validateNumber(1, 64),
  swing: validateNumber(0, 1),
  time: validateTime,
  wet: validateNumber(0, 1),
};

export function numericAsString(time: TimeUnit | number) {
  if (typeof time === "number") {
    return (Math.round(time * 10000) / 10000).toString();
  } else if (typeof time === "string") {
    return time;
  }
  return time.valueOf().toString();
}

export function formatJSON(object: { [k: string]: any }, level = 3): string {
  return serializeJSON(object, level);

  function needsQuotes(s: string): boolean {
    const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s);
    if (!isValidIdentifier && !/^\d+$/.test(s)) {
      return true;
    }

    const reserved = new Set([
      "true",
      "false",
      "null",
      "if",
      "else",
      "for",
      "while",
      "break",
      "continue",
      "return",
      "typeof",
      "delete",
      "class",
      "const",
      "let",
      "var",
      "void",
      "yield",
    ]);

    return reserved.has(s.toLowerCase());
  }

  function serializeJSON(
    obj: any,
    maxDepth: number = Infinity,
    currentDepth: number = 0,
    indent: string = ""
  ): string {
    if (typeof obj === "object" && currentDepth > maxDepth) {
      return Array.isArray(obj) ? `Array(${obj.length})` : "Object";
    }

    if (obj === null) {
      return "null";
    }

    switch (typeof obj) {
      case "number":
      case "boolean":
        return String(obj);

      case "string":
        return `"${obj.replace(/"/g, '\\"')}"`;

      case "object": {
        const nextIndent = indent + "  ";

        if (Array.isArray(obj)) {
          if (obj.length === 0) return "[]";

          const items = obj.map((item) =>
            serializeJSON(item, maxDepth, currentDepth + 1, nextIndent)
          );

          const singleLine = items.join(", ");
          if (singleLine.length <= 40) {
            return `[${singleLine}]`;
          }
          // Splitting these into groups if values are short.
          // Primarily anticipating the case of single digit arrays for steps.
          if (singleLine.length < items.length * 3) {
            const groups: string[] = [];
            let length = 0;
            let nextGroup: string[] = [];
            items.forEach((item) => {
              if (length + item.length + 2 <= 36) {
                length += item.length + 2;
                nextGroup.push(item);
              } else {
                groups.push(nextGroup.join(", "));
                nextGroup = [item];
                length = item.length + 2;
              }
            });
            if (nextGroup.length) {
              groups.push(nextGroup.join(", "));
            }

            return `[\n${nextIndent}${groups.join(
              ",\n" + nextIndent
            )}\n${indent}]`;
          }
          return `[\n${nextIndent}${items.join(
            ",\n" + nextIndent
          )}\n${indent}]`;
        }

        if (Object.keys(obj).length === 0) return "{}";

        const pairs = Object.entries(obj).map(([key, value]) => {
          const keyStr = needsQuotes(key) ? `"${key}"` : key;
          const valueStr = serializeJSON(
            value,
            maxDepth,
            currentDepth + 1,
            nextIndent
          );
          return `${keyStr}: ${valueStr}`;
        });

        return pairs.join(",").length <= 40
          ? `{ ${pairs.join(", ")} }`
          : `{\n${nextIndent}${pairs.join(",\n" + nextIndent)}\n${indent}}`;
      }

      default:
        throw new Error(`Unsupported type: ${typeof obj}`);
    }
  }
}
