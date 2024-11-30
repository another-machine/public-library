import { Machine } from "../Machine";
import { generateCoreDestination } from "./generateCoreDestination";
import { generateDrumsDestinations } from "./generateDrumsDestinations";
import { generateSynthsDestinations } from "./generateSynthsDestinations";
import { generateKeyboardDestinations } from "./generateKeyboardDestinations";
import { Destination } from "./Destination";

export class Destinations {
  static formatJSON(object: { [k: string]: any }, level = 3): string {
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

  static generateDestinations({
    machine,
    onExport,
    onToggleMachine,
    onToggleRainbow,
    onStepChange,
    onModeChange,
  }: {
    machine: Machine;
    onExport: () => void;
    onToggleMachine: () => boolean;
    onToggleRainbow: () => boolean;
    onStepChange: () => void;
    onModeChange: () => void;
  }): Destination {
    const { sequencers, keyboard, clock } = machine;
    const synthSequencers = sequencers.filter((sequencer) =>
      sequencer.isSynth()
    );
    const drumSequencers = sequencers.filter((sequencer) => sequencer.isDrum());
    const destinations = {
      ...generateCoreDestination({
        machine,
        onExport,
        onToggleMachine,
        onToggleRainbow,
        onModeChange,
      }),
      ...generateSynthsDestinations({
        sequencers: synthSequencers,
        machine,
        onStepChange,
      }),
      ...generateDrumsDestinations({
        sequencers: drumSequencers,
        machine,
        onStepChange,
      }),
      ...generateKeyboardDestinations({
        keyboard,
        machine,
        clock,
      }),
    };

    return new Destination({
      info: { content: () => "", label: "Modulo" },
      destinations,
      properties: {},
      commands: {},
    });
  }
}
