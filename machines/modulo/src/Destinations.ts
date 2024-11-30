import { Clock } from "./Clock";
import { Prompt, PromptOutput } from "./prompt/Prompt";
import { SynthSettingsOscillatorType, Synths, oscillatorTypes } from "./Synths";
import { Machine } from "./Machine";
import { MODES, ROOTS } from "./Notes";
import { DrumSequencer, SynthSequencer } from "./Sequencer";
import { Keyboard } from "./Keyboard";
import { Time as TimeUnit } from "tone/build/esm/core/type/Units";
import { Time } from "tone/build/esm/core";
import {
  ConfigurableHat,
  ConfigurableKick,
  ConfigurableSnare,
  Drums,
} from "./Drums";
import { RendererThemeLCH } from "./Renderer";

export type DestinationInfo = { content: () => string; label?: string };

const timeOptions = ["4n", "8n", "16n", "32n", "4t", "8t", "16t", "32t"];

export type DestinationCommandArgs = {
  description: string;
  onCommand(command: string, args: string[], prompt: Prompt): PromptOutput;
};
export type DestinationPropertyInput =
  | {
      type: "number";
      initialValue: () => string;
      min: number;
      max: number;
      steps?: number[];
      label?: string;
    }
  | {
      type: "range";
      initialValue: () => string;
      min: number;
      max: number;
      step?: number;
      label?: string;
    }
  | {
      type: "select";
      initialValue: () => string;
      options: string[];
      label?: string;
    };

export type DestinationPropertyInputFormatter = (values: string[]) => any;

export type DestinationPropertyArgs = {
  inputs: DestinationPropertyInput[];
  inputsFormatter?: DestinationPropertyInputFormatter;
  onSet(command: string, args: string[], prompt: Prompt): PromptOutput;
};

const validateTime = (string: string) =>
  Boolean(string.match(/^((2|4|8|16|32)[dnt])|(\d+(\.\d+)?)$/));

const validateNumber = (min: number, max: number) => (value: string) => {
  const float = parseFloat(value);
  return float >= min && float <= max;
};

const validateOptions = (list: string[]) => (value: string) =>
  list.includes(value);

const validators = {
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

const numericAsString = (time: TimeUnit | number): string => {
  if (typeof time === "number") {
    return (Math.round(time * 10000) / 10000).toString();
  } else if (typeof time === "string") {
    return time;
  }
  return time.valueOf().toString();
};

class DestinationCommand {
  description: string;
  onCommand: (command: string, args: string[], prompt: Prompt) => PromptOutput;

  constructor({ description, onCommand }: DestinationCommandArgs) {
    this.description = description;
    this.onCommand = onCommand;
  }
}

class DestinationProperty {
  inputs: DestinationPropertyInput[];
  inputsFormatter: DestinationPropertyInputFormatter;
  onSet: (command: string, args: string[], prompt: Prompt) => PromptOutput;

  constructor({
    inputs,
    inputsFormatter = (values) => values.join(" "),
    onSet,
  }: DestinationPropertyArgs) {
    this.inputs = inputs;
    this.inputsFormatter = inputsFormatter;
    this.onSet = onSet;
  }
}

export class Destination {
  key?: string;
  info: DestinationInfo;
  destinations: { [destination: string]: Destination };
  properties: { [property: string]: DestinationProperty };
  commands: { [command: string]: DestinationCommand };

  constructor({
    key,
    info,
    destinations,
    properties,
    commands,
  }: {
    key?: string;
    info: DestinationInfo;
    destinations?: { [destination: string]: Destination };
    properties?: { [property: string]: DestinationProperty };
    commands?: { [command: string]: DestinationCommand };
  }) {
    this.key = key;
    this.info = info;
    this.destinations = destinations || {};
    this.properties = properties || {};
    this.commands = commands || {};
  }

  get suggestions() {
    const destinations = Object.keys(this.destinations);
    const destinationKeys = destinations.reduce<{
      [k: string]: string | undefined;
    }>((into, key) => {
      into[key] = this.destinations[key].key;
      return into;
    }, {});
    const destinationInfos = destinations.reduce<{
      [k: string]: DestinationInfo;
    }>((into, key) => {
      into[key] = this.destinations[key].info;
      return into;
    }, {});
    const properties = Object.keys(this.properties);
    const propertyInputs = properties.reduce<{
      [k: string]: DestinationPropertyInput[];
    }>((into, key) => {
      into[key] = this.properties[key].inputs;
      return into;
    }, {});
    const propertyInputsFormatters = properties.reduce<{
      [k: string]: DestinationPropertyInputFormatter;
    }>((into, key) => {
      into[key] = this.properties[key].inputsFormatter;
      return into;
    }, {});
    const commands = Object.keys(this.commands);
    const commandDescriptions = commands.reduce<{
      [k: string]: string;
    }>((into, key) => {
      into[key] = this.commands[key].description;
      return into;
    }, {});
    return {
      key: this.key,
      destinations,
      destinationKeys,
      destinationInfos,
      properties,
      propertyInputs,
      propertyInputsFormatters,
      commands,
      commandDescriptions,
    };
  }
}

const synthEffectsDestinations = (
  loader: () => ConfigurableHat | ConfigurableKick | ConfigurableSnare
) => ({
  highpass: new Destination({
    info: {
      content: () =>
        Destinations.formatJSON(loader().exportParams().settings.highpass),
    },
    properties: {
      Q: new DestinationProperty({
        inputs: [
          {
            type: "number",
            min: 0,
            max: 1,
            initialValue: () =>
              numericAsString(loader().exportParams().settings.highpass.Q || 0),
          },
        ],
        onSet: (_command, [value]) => {
          const valid = validators.Q(value);
          const { volume, settings } = loader().exportParams();
          loader().updateSettings({
            volume,
            settings: {
              ...settings,
              highpass: { ...settings.highpass, Q: parseFloat(value) },
            },
          });
          return { valid };
        },
      }),
      frequency: new DestinationProperty({
        inputs: [
          {
            type: "number",
            min: 0,
            max: 12000,
            initialValue: () =>
              numericAsString(
                loader().exportParams().settings.highpass.frequency || 0
              ),
          },
        ],
        onSet: (_command, [value]) => {
          const valid = validators.Q(value);
          const { volume, settings } = loader().exportParams();
          loader().updateSettings({
            volume,
            settings: {
              ...settings,
              highpass: { ...settings.highpass, frequency: parseFloat(value) },
            },
          });
          return { valid };
        },
      }),
    },
  }),
  lowpass: new Destination({
    info: {
      content: () =>
        Destinations.formatJSON(loader().exportParams().settings.lowpass),
    },
    properties: {
      Q: new DestinationProperty({
        inputs: [
          {
            type: "number",
            min: 0,
            max: 1,
            initialValue: () =>
              numericAsString(loader().exportParams().settings.lowpass.Q || 0),
          },
        ],
        onSet: (_command, [value]) => {
          const valid = validators.Q(value);
          const { volume, settings } = loader().exportParams();
          loader().updateSettings({
            volume,
            settings: {
              ...settings,
              lowpass: { ...settings.lowpass, Q: parseFloat(value) },
            },
          });
          return { valid };
        },
      }),
      frequency: new DestinationProperty({
        inputs: [
          {
            type: "number",
            min: 0,
            max: 12000,
            initialValue: () =>
              numericAsString(
                loader().exportParams().settings.lowpass.frequency || 0
              ),
          },
        ],
        onSet: (_command, [value]) => {
          const valid = validators.Q(value);
          const { volume, settings } = loader().exportParams();
          loader().updateSettings({
            volume,
            settings: {
              ...settings,
              lowpass: { ...settings.lowpass, frequency: parseFloat(value) },
            },
          });
          return { valid };
        },
      }),
    },
  }),
  crush: new Destination({
    info: {
      content: () =>
        Destinations.formatJSON(loader().exportParams().settings.crush),
    },
    properties: {
      wet: new DestinationProperty({
        inputs: [
          {
            type: "number",
            min: 0,
            max: 1,
            initialValue: () =>
              numericAsString(loader().exportParams().settings.crush.wet || 0),
          },
        ],
        onSet: (_command, [value]) => {
          const valid = validators.wet(value);
          const { volume, settings } = loader().exportParams();
          loader().updateSettings({
            volume,
            settings: {
              ...settings,
              crush: { ...settings.crush, wet: parseFloat(value) },
            },
          });
          return { valid };
        },
      }),
      bits: new DestinationProperty({
        inputs: [
          {
            type: "number",
            min: 1,
            max: 16,
            initialValue: () =>
              numericAsString(loader().exportParams().settings.crush.bits || 1),
          },
        ],
        onSet: (_command, [value]) => {
          const valid = validators.bits(value);
          const { volume, settings } = loader().exportParams();
          loader().updateSettings({
            volume,
            settings: {
              ...settings,
              crush: { ...settings.crush, bits: parseFloat(value) },
            },
          });
          return { valid };
        },
      }),
    },
  }),
  delay: new Destination({
    info: {
      content: () =>
        Destinations.formatJSON(loader().exportParams().settings.delay),
    },
    properties: {
      feedback: new DestinationProperty({
        inputs: [
          {
            type: "number",
            min: 0,
            max: 1,
            initialValue: () => numericAsString(loader().delay.feedback.value),
          },
        ],
        onSet: (_command, [value]) => {
          const valid = validators.feedback(value);
          const { volume, settings } = loader().exportParams();
          loader().updateSettings({
            volume,
            settings: {
              ...settings,
              delay: { ...settings.delay, feedback: parseFloat(value) },
            },
          });
          return { valid };
        },
      }),
      time: new DestinationProperty({
        inputs: [
          {
            type: "select",
            options: timeOptions,
            initialValue: () =>
              Time(loader().delay.delayTime.value).toNotation(),
          },
        ],
        onSet: (_command, [value]) => {
          const valid = validators.time(value);
          const { volume, settings } = loader().exportParams();
          loader().updateSettings({
            volume,
            settings: {
              ...settings,
              delay: { ...settings.delay, delayTime: value },
            },
          });
          return { valid };
        },
      }),
      wet: new DestinationProperty({
        inputs: [
          {
            type: "number",
            min: 0,
            max: 1,
            initialValue: () =>
              numericAsString(loader().exportParams().settings.delay.wet || 0),
          },
        ],
        onSet: (_command, [value]) => {
          const valid = validators.wet(value);
          const { volume, settings } = loader().exportParams();
          loader().updateSettings({
            volume,
            settings: {
              ...settings,
              delay: { ...settings.delay, wet: parseFloat(value) },
            },
          });
          return { valid };
        },
      }),
    },
  }),
});

const synthDestinations = (synths: Synths, a: boolean, b: boolean) => ({
  envelope: new Destination({
    info: {
      content: () =>
        Destinations.formatJSON(
          synths.voices[0].exportParams()[a ? "a" : "b"].options.envelope
        ),
    },
    properties: {
      attack: new DestinationProperty({
        inputs: [
          {
            type: "number",
            min: 0.001,
            max: 1,
            initialValue: () =>
              numericAsString(
                synths.voices[0][a ? "nodeA" : "nodeB"].envelope.attack
              ),
            label: "Attack",
          },
        ],
        onSet: (_command, args, _prompt) => {
          const valid = validators.adsrItem(args[0]);
          if (valid) {
            const current =
              synths.voices[0].exportParams()[a ? "a" : "b"].options.envelope;
            synths.updateSynth(
              { envelope: { ...current, attack: parseFloat(args[0]) } },
              a,
              b
            );
          }
          return { valid };
        },
      }),
      decay: new DestinationProperty({
        inputs: [
          {
            type: "number",
            min: 0.001,
            max: 1,
            initialValue: () =>
              numericAsString(
                synths.voices[0][a ? "nodeA" : "nodeB"].envelope.decay
              ),
            label: "Decay",
          },
        ],
        onSet: (_command, args, _prompt) => {
          const valid = validators.adsrItem(args[0]);
          if (valid) {
            const current =
              synths.voices[0].exportParams()[a ? "a" : "b"].options.envelope;
            synths.updateSynth(
              { envelope: { ...current, decay: parseFloat(args[0]) } },
              a,
              b
            );
          }
          return { valid };
        },
      }),
      sustain: new DestinationProperty({
        inputs: [
          {
            type: "number",
            min: 0.001,
            max: 1,
            initialValue: () =>
              numericAsString(
                synths.voices[0][a ? "nodeA" : "nodeB"].envelope.sustain
              ),
            label: "Sustain",
          },
        ],
        onSet: (_command, args, _prompt) => {
          const valid = validators.adsrItem(args[0]);
          if (valid) {
            const current =
              synths.voices[0].exportParams()[a ? "a" : "b"].options.envelope;
            synths.updateSynth(
              { envelope: { ...current, sustain: parseFloat(args[0]) } },
              a,
              b
            );
          }
          return { valid };
        },
      }),
      release: new DestinationProperty({
        inputs: [
          {
            type: "number",
            min: 0.001,
            max: 1,
            initialValue: () =>
              numericAsString(
                synths.voices[0][a ? "nodeA" : "nodeB"].envelope.release
              ),
            label: "Release",
          },
        ],
        onSet: (_command, args, _prompt) => {
          const valid = validators.adsrItem(args[0]);
          if (valid) {
            const current =
              synths.voices[0].exportParams()[a ? "a" : "b"].options.envelope;
            synths.updateSynth(
              { envelope: { ...current, release: parseFloat(args[0]) } },
              a,
              b
            );
          }
          return { valid };
        },
      }),
    },
  }),
});

const synthVolumeProperty = (
  loader: () =>
    | Synths
    | Drums
    | ConfigurableHat
    | ConfigurableKick
    | ConfigurableSnare
) => ({
  volume: new DestinationProperty({
    inputs: [
      {
        type: "number",
        min: 0,
        max: 1,
        initialValue: () => numericAsString(loader().getGain()),
      },
    ],
    onSet: (_command, [value]) => {
      const valid = validators.volume(value);
      console.log(value, valid, loader());
      loader().updateGain(parseFloat(value));
      return { valid };
    },
  }),
});

const synthProperties = (synths: Synths, a: boolean, b: boolean) => ({
  type: new DestinationProperty({
    inputs: [
      {
        type: "select",
        options: oscillatorTypes,
        initialValue: () =>
          (a ? synths.voices[0].nodeA : synths.voices[0].nodeB).oscillator.type
            .replace(/(\d+)/, " $1")
            .split(" ")[0],
        label: "Type",
      },
      {
        type: "select",
        options: ["", "4", "8", "12", "16", "24", "32", "48", "64"],
        initialValue: () =>
          (a ? synths.voices[0].nodeA : synths.voices[0].nodeB).oscillator.type
            .replace(/(\d+)/, " $1")
            .split(" ")[1] || "",
        label: "Partials",
      },
    ],
    inputsFormatter: (values: string[]) => values.join(""),
    onSet: (_command, [value], _prompt) => {
      const valid = validators.oscillator(value);
      if (valid) {
        synths.updateSynth(
          { oscillator: { type: value as SynthSettingsOscillatorType } },
          a,
          b
        );
      }
      return { valid };
    },
  }),
  portamento: new DestinationProperty({
    inputs: [
      {
        type: "range",
        min: 0,
        max: 1,
        step: 0.001,
        initialValue: () => numericAsString(synths.voices[0].nodeA.portamento),
      },
    ],
    onSet: (_command, [value], _prompt) => {
      const valid = validators.portamento(value);
      if (valid) {
        synths.updateSynth({ portamento: parseFloat(value) }, a, b);
      }
      return { valid };
    },
  }),
  detune: new DestinationProperty({
    inputs: [
      {
        type: "range",
        min: -100,
        max: 100,
        step: 1,
        initialValue: () =>
          numericAsString(synths.voices[0].nodeA.detune.value),
      },
    ],
    onSet: (_command, [value], _prompt) => {
      const valid = validators.detune(value);
      if (valid) {
        synths.updateSynth({ detune: parseInt(value) }, a, b);
      }
      return { valid };
    },
  }),
  pan: new DestinationProperty({
    inputs: [
      {
        type: "range",
        min: -1,
        max: 1,
        step: 0.01,
        initialValue: () =>
          numericAsString(synths.voices[0][a ? "panA" : "panB"].pan.value),
      },
    ],
    onSet: (_command, [value], _prompt) => {
      const valid = validators.pan(value);
      if (valid) {
        synths.updatePan(parseFloat(value), a, b);
      }
      return { valid };
    },
  }),
});

const lchProperty = (
  initialValue: () => RendererThemeLCH,
  onSet: (color: RendererThemeLCH) => void
) => {
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
};

const synthsCommands = (synths: Synths, a: boolean, b: boolean) => ({
  sync: new DestinationCommand({
    description: "Sync synths to this setting",
    onCommand: (_command, _args, _prompt) => {
      const settings = synths.voices[0].exportParams()[a ? "a" : "b"].options;
      synths.updateSynth(settings, !a, !b);
      return {
        valid: true,
        output: ["Synced synth settings"],
      };
    },
  }),
  random: new DestinationCommand({
    description: "Randomize synth settings",
    onCommand: (_command, _args, _prompt) => {
      synths.randomizeNodes(a, b);
      return {
        valid: true,
        output: ["Randomized synth settings"],
      };
    },
  }),
});

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
      ...Destinations.generateCoreDestination({
        machine,
        onExport,
        onToggleMachine,
        onToggleRainbow,
        onModeChange,
      }),
      ...Destinations.generateSynthsDestinations({
        sequencers: synthSequencers,
        machine,
        onStepChange,
      }),
      ...Destinations.generateDrumsDestinations({
        sequencers: drumSequencers,
        machine,
        onStepChange,
      }),
      ...Destinations.generateKeyboardDestinations({
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

  static generateCoreDestination({
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
              machine.renderer.updateThemeColor(
                `sequencers.${key}.on`,
                settings
              )
          ),
          off: lchProperty(
            () => machine.exportParams().theme.color.sequencers[key].off,
            (settings) =>
              machine.renderer.updateThemeColor(
                `sequencers.${key}.off`,
                settings
              )
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
                      machine.renderer.updateThemeColor("keyboard.on", settings)
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
                    () => machine.exportParams().theme.color.keyboard.disabled,
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
              interface: new Destination({
                info: {
                  label: "Settings for the interface",
                  content: () =>
                    Destinations.formatJSON(
                      machine.exportParams().theme.interface
                    ),
                },
              }),
              prompt: new Destination({
                info: {
                  label: "Settings for the prompt",
                  content: () =>
                    Destinations.formatJSON(
                      machine.exportParams().theme.prompt
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

  static generateDrumsDestinations({
    sequencers,
    machine,
    onStepChange,
  }: {
    sequencers: DrumSequencer[];
    machine: Machine;
    onStepChange: () => void;
  }): Destinations {
    const destinations: { [destination: string]: Destination } = {};
    sequencers.forEach((sequencer) => {
      const drum = sequencer.drums;
      const key = sequencer.key;
      destinations[key] = new Destination({
        key,
        info: {
          content: () => Destinations.formatJSON(sequencer.exportParams()),
        },
        properties: {},

        destinations: {
          steps: new Destination({
            info: {
              content: () =>
                Destinations.formatJSON(sequencer.steps.exportParams()),
            },
            commands: {
              halve: new DestinationCommand({
                description: "Halve steps",
                onCommand: (_command, _args, _prompt) => {
                  sequencer.steps.halve();
                  onStepChange();
                  return { valid: true, output: ["Halved steps"] };
                },
              }),
              double: new DestinationCommand({
                description: "Double steps",
                onCommand: (_command, _args, _prompt) => {
                  sequencer.steps.double();
                  onStepChange();
                  return { valid: true, output: ["Doubled steps"] };
                },
              }),
            },
            destinations: {
              random: new Destination({
                info: {
                  content: () =>
                    Destinations.formatJSON(sequencer.steps.exportParams()),
                },
                commands: {
                  sparse: new DestinationCommand({
                    description: "Randomize steps",
                    onCommand: (_command, args, _prompt) => {
                      if (
                        args.length <= 1 &&
                        (!args[0] || validators.chance(args[0]))
                      ) {
                        sequencer.steps.randomize(
                          args[0] ? parseFloat(args[0]) : undefined
                        );
                        onStepChange();
                        return { valid: true, output: ["Randomized steps"] };
                      }
                      return {
                        valid: false,
                        output: [
                          "Could not randomize steps. Invalid arguments.",
                        ],
                      };
                    },
                  }),
                  dense: new DestinationCommand({
                    description: "Randomize steps",
                    onCommand: (_command, _args, _prompt) => {
                      sequencer.steps.randomize(0.8);
                      onStepChange();
                      return { valid: true, output: ["Randomized steps"] };
                    },
                  }),
                },
              }),
            },
            properties: {
              size: new DestinationProperty({
                inputs: [
                  {
                    type: "number",
                    min: 1,
                    max: 64,
                    steps: [1, 4],
                    initialValue: () => sequencer.steps.size.toString(),
                  },
                ],
                onSet: (_command, [value]) => {
                  const valid = validators.step(value);
                  if (valid) sequencer.steps.set(parseInt(value));
                  onStepChange();
                  return { valid };
                },
              }),
            },
          }),
          synths: new Destination({
            info: {
              content: () =>
                Destinations.formatJSON(sequencer.drums.exportParams()),
            },
            properties: {
              ...synthVolumeProperty(() => drum),
            },
            destinations: {
              kick: new Destination({
                info: {
                  content: () =>
                    Destinations.formatJSON(
                      sequencer.drums.kit.kick.exportParams()
                    ),
                },
                properties: {
                  ...synthVolumeProperty(() => sequencer.drums.kit.kick),
                },
                destinations: {
                  ...synthEffectsDestinations(() => sequencer.drums.kit.kick),
                },
              }),
              snare: new Destination({
                info: {
                  content: () =>
                    Destinations.formatJSON(
                      sequencer.drums.kit.snare.exportParams()
                    ),
                },
                properties: {
                  ...synthVolumeProperty(() => sequencer.drums.kit.snare),
                },
                destinations: {
                  ...synthEffectsDestinations(() => sequencer.drums.kit.snare),
                },
              }),
              closed: new Destination({
                info: {
                  content: () =>
                    Destinations.formatJSON(
                      sequencer.drums.kit.closed.exportParams()
                    ),
                },
                properties: {
                  ...synthVolumeProperty(() => sequencer.drums.kit.closed),
                },
                destinations: {
                  ...synthEffectsDestinations(() => sequencer.drums.kit.closed),
                },
              }),
              open: new Destination({
                info: {
                  content: () =>
                    Destinations.formatJSON(
                      sequencer.drums.kit.open.exportParams()
                    ),
                },
                properties: {
                  ...synthVolumeProperty(() => sequencer.drums.kit.open),
                },
                destinations: {
                  ...synthEffectsDestinations(() => sequencer.drums.kit.open),
                },
              }),
            },
          }),
        },
      });
    });
    return destinations;
  }

  static generateKeyboardDestinations({
    keyboard,
    machine,
    clock: _clock,
  }: {
    keyboard: Keyboard;
    machine: Machine;
    clock: Clock;
  }): Destinations {
    const destinations: { [destination: string]: Destination } = {};
    destinations.keyboard = new Destination({
      key: "keyboard",
      info: {
        content: () => Destinations.formatJSON(keyboard.exportParams()),
      },
      destinations: {
        main: new Destination({
          info: {
            content: () =>
              Destinations.formatJSON(keyboard.main.exportParams(), 4),
          },
          properties: { ...synthVolumeProperty(() => keyboard.main) },
          destinations: {
            a: new Destination({
              info: {
                content: () =>
                  Destinations.formatJSON(
                    keyboard.main.exportParams().settings.a
                  ),
              },
              commands: synthsCommands(keyboard.main, true, false),
              properties: synthProperties(keyboard.main, true, false),
              destinations: synthDestinations(keyboard.main, true, false),
            }),
            b: new Destination({
              info: {
                content: () =>
                  Destinations.formatJSON(
                    keyboard.main.exportParams().settings.b
                  ),
              },
              commands: synthsCommands(keyboard.main, false, true),
              properties: synthProperties(keyboard.main, false, true),
              destinations: synthDestinations(keyboard.main, false, true),
            }),
          },
        }),
        ghosts: new Destination({
          info: {
            content: () =>
              Destinations.formatJSON(keyboard.ghosts.exportParams(), 4),
          },
          properties: { ...synthVolumeProperty(() => keyboard.ghosts) },
          destinations: {
            a: new Destination({
              info: {
                content: () =>
                  Destinations.formatJSON(
                    keyboard.ghosts.exportParams().settings.a
                  ),
              },
              commands: synthsCommands(keyboard.ghosts, true, false),
              properties: synthProperties(keyboard.ghosts, true, false),
              destinations: synthDestinations(keyboard.ghosts, true, false),
            }),
            b: new Destination({
              info: {
                content: () =>
                  Destinations.formatJSON(
                    keyboard.ghosts.exportParams().settings.b
                  ),
              },
              commands: synthsCommands(keyboard.ghosts, false, true),
              properties: synthProperties(keyboard.ghosts, false, true),
              destinations: synthDestinations(keyboard.ghosts, false, true),
            }),
          },
        }),
      },
      properties: {
        octave: new DestinationProperty({
          inputs: [
            {
              type: "number",
              min: 0,
              max: 7,
              initialValue: () => keyboard.octave.toString(),
            },
          ],
          onSet: (_command, [value]) => {
            const valid = validators.octave(value);
            if (valid) {
              keyboard.octave = parseInt(value);
            }
            return { valid };
          },
        }),
      },
    });
    return destinations;
  }

  static generateSynthsDestinations({
    sequencers,
    machine,
    onStepChange,
  }: {
    sequencers: SynthSequencer[];
    machine: Machine;
    onStepChange: () => void;
  }): Destinations {
    const destinations: { [destination: string]: Destination } = {};
    sequencers.forEach((sequencer) => {
      const synth = sequencer.synths;
      const key = sequencer.key;
      destinations[key] = new Destination({
        key,
        info: {
          content: () => Destinations.formatJSON(sequencer.exportParams(), 4),
        },
        properties: {
          octave: new DestinationProperty({
            inputs: [
              {
                type: "number",
                min: 0,
                max: 7,
                initialValue: () => sequencer.octave.toString(),
              },
            ],
            onSet: (_command, [value]) => {
              const valid = validators.octave(value);
              if (valid) {
                sequencer.octave = parseInt(value);
              }
              return { valid };
            },
          }),
        },

        destinations: {
          steps: new Destination({
            info: {
              content: () =>
                Destinations.formatJSON(sequencer.steps.exportParams()),
            },
            commands: {
              halve: new DestinationCommand({
                description: "Halve steps",
                onCommand: (_command, _args, _prompt) => {
                  sequencer.steps.halve();
                  onStepChange();
                  return { valid: true, output: ["Halved steps"] };
                },
              }),
              double: new DestinationCommand({
                description: "Double steps",
                onCommand: (_command, _args, _prompt) => {
                  sequencer.steps.double();
                  onStepChange();
                  return { valid: true, output: ["Doubled steps"] };
                },
              }),
            },
            destinations: {
              random: new Destination({
                info: {
                  content: () =>
                    Destinations.formatJSON(sequencer.steps.exportParams()),
                },
                commands: {
                  sparse: new DestinationCommand({
                    description: "Randomize steps",
                    onCommand: (_command, args, _prompt) => {
                      if (
                        args.length <= 1 &&
                        (!args[0] || validators.chance(args[0]))
                      ) {
                        sequencer.steps.randomize(
                          args[0] ? parseFloat(args[0]) : undefined
                        );
                        onStepChange();
                        return { valid: true, output: ["Randomized steps"] };
                      }
                      return {
                        valid: false,
                        output: [
                          "Could not randomize steps. Invalid arguments.",
                        ],
                      };
                    },
                  }),
                  dense: new DestinationCommand({
                    description: "Randomize steps",
                    onCommand: (_command, _args, _prompt) => {
                      sequencer.steps.randomize(0.8);
                      onStepChange();
                      return { valid: true, output: ["Randomized steps"] };
                    },
                  }),
                },
              }),
            },
            properties: {
              size: new DestinationProperty({
                inputs: [
                  {
                    type: "number",
                    min: 1,
                    max: 64,
                    steps: [1, 4],
                    initialValue: () => sequencer.steps.size.toString(),
                  },
                ],
                onSet: (_command, [value]) => {
                  const valid = validators.step(value);
                  if (valid) sequencer.steps.set(parseInt(value));
                  onStepChange();
                  return { valid };
                },
              }),
            },
          }),
          synths: new Destination({
            info: {
              content: () => {
                const settings = synth.exportParams();
                return Destinations.formatJSON(settings);
              },
            },
            properties: { ...synthVolumeProperty(() => synth) },
            destinations: {
              a: new Destination({
                info: {
                  content: () =>
                    Destinations.formatJSON(synth.exportParams().settings.a),
                },
                commands: synthsCommands(synth, true, false),
                properties: synthProperties(synth, true, false),
                destinations: synthDestinations(synth, true, false),
              }),
              b: new Destination({
                info: {
                  content: () =>
                    Destinations.formatJSON(synth.exportParams().settings.b),
                },
                commands: synthsCommands(synth, false, true),
                properties: synthProperties(synth, false, true),
                destinations: synthDestinations(synth, false, true),
              }),
            },
          }),
          delay: new Destination({
            info: {
              content: () =>
                Destinations.formatJSON(synth.exportParams().settings.delay),
            },
            properties: {
              feedback: new DestinationProperty({
                inputs: [
                  {
                    type: "number",
                    min: 0,
                    max: 1,
                    initialValue: () =>
                      numericAsString(synth.voices[0].delay.feedback.value),
                  },
                ],
                onSet: (_command, [value]) => {
                  const valid = validators.feedback(value);
                  synth.updateDelay({ feedback: parseFloat(value) });
                  return { valid };
                },
              }),
              time: new DestinationProperty({
                inputs: [
                  // {
                  //   type: "number",
                  //   min: 0,
                  //   max: 1,
                  //   initialValue: () =>
                  //     numericAsString(synth.voices[0].delay.delayTime.value),
                  // },
                  {
                    type: "select",
                    options: timeOptions,
                    initialValue: () =>
                      Time(synth.voices[0].delay.delayTime.value).toNotation(),
                  },
                ],
                onSet: (_command, [value]) => {
                  const valid = validators.time(value);
                  synth.updateDelay({ delayTime: value });
                  return { valid };
                },
              }),
              wet: new DestinationProperty({
                inputs: [
                  {
                    type: "number",
                    min: 0,
                    max: 1,
                    initialValue: () =>
                      numericAsString(synth.voices[0].delay.wet.value),
                  },
                ],
                onSet: (_command, [value]) => {
                  const valid = validators.wet(value);
                  synth.updateDelay({ wet: parseFloat(value) });
                  return { valid };
                },
              }),
            },
          }),
          // reverb: new Destination({
          //   description: "Reverb effect",
          //   properties: {
          //     size: new DestinationProperty({
          //       description: "Size is 0 - 1",
          //       onSet: (_command, [value]) => {
          //         const valid = validators.roomSize(value);
          //         synth.updateReverb({ roomSize: parseFloat(value) });
          //         if (valid) {
          //           return { valid, output: [`Set size to ${value}`] };
          //         } else {
          //           return {
          //             valid,
          //             output: [`Could not set size to ${value}`],
          //           };
          //         }
          //       },
          //       onGet: () => ({
          //         valid: true,
          //         output: [`Size is ${synth.voices[0].reverb.roomSize.value}`],
          //       }),
          //     }),
          //     wet: new DestinationProperty({
          //       description: "Wet is 0 - 1",
          //       onSet: (_command, [value]) => {
          //         const valid = validators.wet(value);
          //         synth.updateReverb({ wet: parseFloat(value) });
          //         if (valid) {
          //           return { valid, output: [`Set wet to ${value}`] };
          //         } else {
          //           return {
          //             valid,
          //             output: [`Could not set wet to ${value}`],
          //           };
          //         }
          //       },
          //       onGet: () => ({
          //         valid: true,
          //         output: [`Wet is ${synth.voices[0].reverb.wet.value}`],
          //       }),
          //     }),
          //   },
          // }),
        },
      });
    });
    return destinations;
  }
}
