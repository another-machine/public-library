import { Machine } from "../Machine";
import { ROOTS, MODES } from "../Notes";
import { RendererThemeLCH } from "../Renderer";
import {
  Destination,
  DestinationCommand,
  DestinationProperty,
  DestinationPropertyInput,
} from "./Destination";
import { formatJSON, numericAsString, validators } from "./utilities";
import { themeSelectorProperty } from "./synthUtilities";

function propertyGeneratorLayoutRange(
  machine: Machine,
  type: "prompt" | "pads"
) {
  return function (
    key: string,
    min = 0,
    max = 1,
    step = 0.01
  ): DestinationPropertyInput {
    return {
      label: key,
      type: "range",
      min,
      max,
      step,
      initialValue: () =>
        numericAsString(machine.exportParams().theme.sizes[type][key]),
    };
  };
}

function lchProperty(
  initialValue: () => RendererThemeLCH,
  onSet: (color: RendererThemeLCH) => void
) {
  return new DestinationProperty({
    inputs: [
      {
        label: "l",
        type: "range",
        min: 0,
        max: 1,
        initialValue: () => numericAsString(initialValue().l),
      },
      {
        label: "c",
        type: "range",
        min: 0,
        max: 0.5,
        initialValue: () => numericAsString(initialValue().c),
      },
      {
        label: "h",
        type: "range",
        min: 0,
        max: 360,
        initialValue: () => numericAsString(initialValue().h),
      },
    ],
    inputsFormatter: (values) => values.join(" "),
    onSet: (_command, [l, c, h], _prompt) => {
      const valid =
        validators.colorL(l) && validators.colorC(c) && validators.colorH(h);
      if (valid) {
        onSet({ l: parseFloat(l), c: parseFloat(c), h: parseInt(h) });
      }
      return { valid };
    },
  });
}

export function generateCoreDestination({
  machine,
  onExport,
  onToggleMachine,
  onToggleRainbow,
  onModeChange,
}: {
  machine: Machine;
  onExport: (type: "image" | "json" | "url") => void;
  onToggleRainbow: () => boolean;
  onToggleMachine: () => boolean;
  onModeChange: () => void;
}): { [destination: string]: Destination } {
  const { clock, notes, sequencers, renderer } = machine;
  const commands = {
    toggle: new DestinationCommand({
      description: "Toggle the clock state on or off",
      onCommand: (_command, _args, _prompt) => {
        const output = [`Turned clock ${onToggleMachine() ? "on" : "off"}`];
        return { valid: true, output };
      },
    }),
    rainbow: new DestinationCommand({
      description: "Toggle the rainbow mode",
      onCommand: (_command, _args, _prompt) => {
        const output = [`Turned rainbow ${onToggleRainbow() ? "on" : "off"}`];
        return { valid: true, output };
      },
    }),
  };

  const colorDestinations = renderer.theme.colors.reduce<{
    [k: string]: Destination;
  }>((into, color, i) => {
    into[i] = new Destination({
      key: i.toString(),
      info: {
        content: () => formatJSON(machine.exportParams().theme.colors[i]),
      },
      commands: {
        dupe: new DestinationCommand({
          description: "Duplicate the color",
          onCommand: (_command, _args, _prompt) => {
            machine.renderer.duplicateThemeColors(i);
            machine.promptInterface.handleBack();
            machine.destinations.refresh();
            return { valid: true };
          },
        }),
        ...(i > 0
          ? {
              delete: new DestinationCommand({
                description: "Delete the color",
                onCommand: (_command, _args, _prompt) => {
                  machine.renderer.removeThemeColors(i);
                  machine.promptInterface.handleBack();
                  machine.destinations.refresh();
                  return { valid: true };
                },
              }),
            }
          : {}),
      },

      properties: {
        a: lchProperty(
          () => machine.exportParams().theme.colors[i].a,
          (settings) => machine.renderer.updateThemeColors(i, "a", settings)
        ),
        b: lchProperty(
          () => machine.exportParams().theme.colors[i].b,
          (settings) => machine.renderer.updateThemeColors(i, "b", settings)
        ),
        c: lchProperty(
          () => machine.exportParams().theme.colors[i].c,
          (settings) => machine.renderer.updateThemeColors(i, "c", settings)
        ),
      },
    });
    return into;
  }, {});

  const sizesInterfaceProperty = propertyGeneratorLayoutRange(machine, "pads");
  const sizesPromptProperty = propertyGeneratorLayoutRange(machine, "prompt");

  return {
    machine: new Destination({
      key: machine.renderer.core.theme.toString(),
      info: {
        label: "Core configurations for the machine",
        content: () => formatJSON(machine.exportParams()),
      },
      commands,
      destinations: {
        core: new Destination({
          info: {
            label: "Core properties",
            content: () => formatJSON(machine.exportParams().core),
          },
          properties: {
            ...themeSelectorProperty(
              machine,
              (value) => (machine.renderer.core.theme = value),
              () => machine.renderer.core.theme.toString()
            ),
            key: new DestinationProperty({
              inputs: [
                {
                  type: "select",
                  initialValue: () => notes.getRoot(),
                  options: ROOTS,
                },
                {
                  type: "select",
                  initialValue: () => notes.getMode().type,
                  options: MODES,
                },
              ],
              onSet: (_command, [root, mode]) => {
                const valid = validators.mode(mode) && validators.root(root);
                if (valid) {
                  notes.setMode(mode);
                  notes.setRoot(root);
                  onModeChange();
                }
                return { valid };
              },
            }),
            tempo: new DestinationProperty({
              inputs: [
                {
                  label: "bpm",
                  type: "range",
                  min: 45,
                  max: 300,
                  step: 1,
                  initialValue: () => numericAsString(clock.getRate()),
                },
                {
                  label: "swing",
                  type: "range",
                  min: 0,
                  max: 1,
                  initialValue: () => numericAsString(clock.getSwing()),
                },
              ],
              onSet: (_command, [rate, swing]) => {
                const valid = validators.bpm(rate) && validators.swing(swing);
                if (valid) {
                  clock.setRate(parseInt(rate));
                  clock.setSwing(parseFloat(swing));
                }
                return { valid };
              },
            }),
          },
        }),
        save: new Destination({
          info: {
            label: "Save current state of the machine",
            content: () => formatJSON(machine.exportParams()),
          },
          commands: {
            image: new DestinationCommand({
              description: "Export as a Steganographic image.",
              onCommand: (_command, _args, _prompt) => {
                onExport("image");
                const output = ["Exported settings!"];
                return { valid: true, output };
              },
            }),
            json: new DestinationCommand({
              description: "Export as JSON.",
              onCommand: (_command, _args, _prompt) => {
                onExport("json");
                const output = ["Exported settings!"];
                return { valid: true, output };
              },
            }),
            url: new DestinationCommand({
              description: "Export as a url.",
              onCommand: (_command, _args, _prompt) => {
                onExport("url");
                const output = ["Exported settings!"];
                return { valid: true, output };
              },
            }),
          },
        }),
        theme: new Destination({
          info: {
            label: "Theme settings for the machine",
            content: () => formatJSON(machine.exportParams().theme),
          },
          destinations: {
            colors: new Destination({
              key: machine.renderer.core.theme.toString(),
              info: {
                content: () => formatJSON(machine.exportParams().theme.colors),
              },
              destinations: colorDestinations,
            }),
            sizes: new Destination({
              info: {
                content: () => formatJSON(machine.exportParams().theme.sizes),
              },
              properties: {
                pads: new DestinationProperty({
                  inputs: [
                    sizesInterfaceProperty("border", 0, 0.5),
                    sizesInterfaceProperty("corner", 0, 1),
                    sizesInterfaceProperty("gapX", 0, 2),
                    sizesInterfaceProperty("gapY", 0, 2),
                    sizesInterfaceProperty("glow", 0, 1),
                    sizesPromptProperty("paddingX", 0, 2),
                    sizesPromptProperty("paddingY", 0, 2),
                  ],
                  onSet: (
                    _command,
                    [border, corner, gapX, gapY, glow, paddingX, paddingY],
                    _prompt
                  ) => {
                    const valid = true;
                    if (valid) {
                      machine.renderer.updateThemeLayoutPads({
                        border: parseFloat(border),
                        corner: parseFloat(corner),
                        gapX: parseFloat(gapX),
                        gapY: parseFloat(gapY),
                        glow: parseFloat(glow),
                        paddingX: parseFloat(paddingX),
                        paddingY: parseFloat(paddingY),
                      });
                    }
                    return { valid };
                  },
                }),
                prompt: new DestinationProperty({
                  inputs: [
                    sizesPromptProperty("border", 0, 0.5),
                    sizesPromptProperty("corner", 0, 1),
                    sizesPromptProperty("font", 0.5, 2),
                    sizesPromptProperty("gapX", 0, 2),
                    sizesPromptProperty("gapY", 0, 2),
                    sizesPromptProperty("paddingX", 0, 2),
                    sizesPromptProperty("paddingY", 0, 2),
                    sizesPromptProperty("width", 20, 80),
                  ],
                  onSet: (
                    _command,
                    [
                      border,
                      corner,
                      font,
                      gapX,
                      gapY,
                      paddingX,
                      paddingY,
                      width,
                    ],
                    _prompt
                  ) => {
                    const valid = true;
                    if (valid) {
                      machine.renderer.updateThemeLayoutPrompt({
                        border: parseFloat(border),
                        corner: parseFloat(corner),
                        font: parseFloat(font),
                        gapX: parseFloat(gapX),
                        gapY: parseFloat(gapY),
                        paddingX: parseFloat(paddingX),
                        paddingY: parseFloat(paddingY),
                        width: parseFloat(width),
                      });
                    }
                    return { valid };
                  },
                }),
              },
            }),
          },
        }),
      },
    }),
  };
}
