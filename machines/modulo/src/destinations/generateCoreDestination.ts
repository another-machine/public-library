import { Destinations } from "./Destinations";
import { Machine } from "../Machine";
import { ROOTS, MODES } from "../Notes";
import {
  RendererThemeLCH,
  RendererThemeLayoutInterface,
  RendererThemeLayoutPrompt,
} from "../Renderer";
import {
  Destination,
  DestinationCommand,
  DestinationProperty,
} from "./Destination";
import { numericAsString, validators } from "./utilities";

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
}): Destinations {
  const { clock, notes, sequencers } = machine;
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

  const sequencerColorDestinations = {};
  sequencers.forEach((sequencer) => {
    const key = sequencer.key;
    sequencerColorDestinations[key] = new Destination({
      key,
      info: {
        label: `Color settings for ${key}`,
        content: () =>
          Destinations.formatJSON(
            machine.exportParams().theme.color.sequencers[key]
          ),
      },
      properties: {
        on: lchProperty(
          () => machine.exportParams().theme.color.sequencers[key].on,
          (settings) =>
            machine.renderer.updateThemeColor(`sequencers.${key}.on`, settings)
        ),
        off: lchProperty(
          () => machine.exportParams().theme.color.sequencers[key].off,
          (settings) =>
            machine.renderer.updateThemeColor(`sequencers.${key}.off`, settings)
        ),
        disabled: lchProperty(
          () => machine.exportParams().theme.color.sequencers[key].disabled,
          (settings) =>
            machine.renderer.updateThemeColor(
              `sequencers.${key}.disabled`,
              settings
            )
        ),
      },
    });
  });

  return {
    core: new Destination({
      key: "core",
      info: {
        label: "Core configurations for the machine",
        content: () => Destinations.formatJSON(machine.exportParams()),
      },
      commands,
      destinations: {
        save: new Destination({
          info: {
            label: "Save current state of the machine",
            content: () => Destinations.formatJSON(machine.exportParams()),
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
          key: "core",
          info: {
            label: "Theme settings for the machine",
            content: () =>
              Destinations.formatJSON(machine.exportParams().theme),
          },
          destinations: {
            color: new Destination({
              key: "core",
              info: {
                content: () =>
                  Destinations.formatJSON(machine.exportParams().theme.color),
              },
              destinations: {
                ...sequencerColorDestinations,
                keyboard: new Destination({
                  key: "keyboard",
                  info: {
                    label: "Color settings for the keyboard",
                    content: () =>
                      Destinations.formatJSON(
                        machine.exportParams().theme.color.keyboard
                      ),
                  },
                  properties: {
                    on: lchProperty(
                      () => machine.exportParams().theme.color.keyboard.on,
                      (settings) =>
                        machine.renderer.updateThemeColor(
                          "keyboard.on",
                          settings
                        )
                    ),
                    off: lchProperty(
                      () => machine.exportParams().theme.color.keyboard.off,
                      (settings) =>
                        machine.renderer.updateThemeColor(
                          "keyboard.off",
                          settings
                        )
                    ),
                    disabled: lchProperty(
                      () =>
                        machine.exportParams().theme.color.keyboard.disabled,
                      (settings) =>
                        machine.renderer.updateThemeColor(
                          "keyboard.disabled",
                          settings
                        )
                    ),
                  },
                }),
                core: new Destination({
                  key: "core",
                  info: {
                    label: "Color settings for the core",
                    content: () =>
                      Destinations.formatJSON(
                        machine.exportParams().theme.color.core
                      ),
                  },
                  properties: {
                    on: lchProperty(
                      () => machine.exportParams().theme.color.core.on,
                      (settings) =>
                        machine.renderer.updateThemeColor("core.on", settings)
                    ),
                    off: lchProperty(
                      () => machine.exportParams().theme.color.core.off,
                      (settings) =>
                        machine.renderer.updateThemeColor("core.off", settings)
                    ),
                    disabled: lchProperty(
                      () => machine.exportParams().theme.color.core.disabled,
                      (settings) =>
                        machine.renderer.updateThemeColor(
                          "core.disabled",
                          settings
                        )
                    ),
                  },
                }),
              },
              properties: {
                background: lchProperty(
                  () => machine.exportParams().theme.color.background,
                  (settings) =>
                    machine.renderer.updateThemeColor("background", settings)
                ),
                text: lchProperty(
                  () => machine.exportParams().theme.color.text,
                  (settings) =>
                    machine.renderer.updateThemeColor("text", settings)
                ),
              },
            }),
            layout: new Destination({
              info: {
                label: "Layout theme settings",
                content: () =>
                  Destinations.formatJSON(machine.exportParams().theme.layout),
              },
              properties: {
                interface: new DestinationProperty({
                  inputs: ["border", "corner", "gapX", "gapY"].map((label) => ({
                    label,
                    type: "range",
                    min: 0,
                    max: 2,
                    step: 0.01,
                    initialValue: () =>
                      numericAsString(
                        machine.exportParams().theme.layout.interface[label]
                      ),
                  })),
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
                    "border",
                    "corner",
                    "font",
                    "gapX",
                    "gapY",
                    "paddingX",
                    "paddingY",
                  ].map((label) => ({
                    label,
                    type: "range",
                    min: 0,
                    max: 2,
                    step: 0.01,
                    initialValue: () =>
                      numericAsString(
                        machine.exportParams().theme.layout.prompt[label]
                      ),
                  })),
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
      properties: {
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
  };
}
