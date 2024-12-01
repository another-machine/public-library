import { Destinations } from "./Destinations";
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
  type: "prompt" | "interface"
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
        numericAsString(machine.exportParams().theme.layout[type][key]),
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
        type: "range",
        min: 0,
        max: 1,
        initialValue: () => numericAsString(initialValue().l),
      },
      {
        type: "range",
        min: 0,
        max: 0.5,
        initialValue: () => numericAsString(initialValue().c),
      },
      {
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
  onExport: () => void;
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

  const layoutInterfaceProperty = propertyGeneratorLayoutRange(
    machine,
    "interface"
  );
  const layoutPromptProperty = propertyGeneratorLayoutRange(machine, "prompt");

  return {
    machine: new Destination({
      key: machine.theme.toString(),
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
              (value) => (machine.theme = value),
              () => machine.theme.toString()
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
                  type: "range",
                  min: 45,
                  max: 300,
                  step: 1,
                  initialValue: () => numericAsString(clock.getRate()),
                },
                {
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
                onExport();
                const output = ["Exported settings!"];
                return { valid: true, output };
              },
            }),
            json: new DestinationCommand({
              description: "Export as JSON.",
              onCommand: (_command, _args, _prompt) => {
                onExport();
                const output = ["Exported settings!"];
                return { valid: true, output };
              },
            }),
            url: new DestinationCommand({
              description: "Export as a url.",
              onCommand: (_command, _args, _prompt) => {
                onExport();
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
              key: machine.theme.toString(),
              info: {
                content: () => formatJSON(machine.exportParams().theme.colors),
              },
              destinations: colorDestinations,
            }),
            layout: new Destination({
              info: {
                label: "Layout theme settings",
                content: () => formatJSON(machine.exportParams().theme.layout),
              },
              properties: {
                interface: new DestinationProperty({
                  inputs: [
                    layoutInterfaceProperty("border", 0, 0.5),
                    layoutInterfaceProperty("corner", 0, 1),
                    layoutInterfaceProperty("gapX", 0, 2),
                    layoutInterfaceProperty("gapY", 0, 2),
                  ],
                  onSet: (_command, [border, corner, gapX, gapY], _prompt) => {
                    const valid = true;
                    if (valid) {
                      machine.renderer.updateThemeLayoutInterface({
                        border: parseFloat(border),
                        corner: parseFloat(corner),
                        gapX: parseFloat(gapX),
                        gapY: parseFloat(gapY),
                      });
                    }
                    return { valid };
                  },
                }),
                prompt: new DestinationProperty({
                  inputs: [
                    layoutPromptProperty("border", 0, 0.5),
                    layoutPromptProperty("corner", 0, 1),
                    layoutPromptProperty("font", 0.2, 2),
                    layoutPromptProperty("gapX", 0, 2),
                    layoutPromptProperty("gapY", 0, 2),
                    layoutPromptProperty("paddingX", 0, 2),
                    layoutPromptProperty("paddingY", 0, 2),
                  ],
                  onSet: (
                    _command,
                    [border, corner, font, gapX, gapY, paddingX, paddingY],
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
