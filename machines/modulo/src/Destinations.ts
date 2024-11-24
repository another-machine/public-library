import { Clock } from "./Clock";
import { Prompt, PromptOutput } from "./prompt/Prompt";
import { SynthSettingsOscillatorType, Synths, oscillatorTypes } from "./Synths";
import { Machine } from "./Machine";
import { MODES, ROOTS } from "./Notes";
import { DrumSequencer, SynthSequencer } from "./Sequencer";
import { Keyboard } from "./Keyboard";
import { Time as TimeUnit } from "tone/build/esm/core/type/Units";
import { Time } from "tone/build/esm/core";

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
  bpm: validateNumber(0, 360),
  chance: validateNumber(0, 1),
  detune: validateNumber(-100, 100),
  feedback: validateNumber(0, 1),
  volume: validateNumber(0, 1),
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
    return time.toFixed(3);
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

const synthVolumeProperty = (synths: Synths) => ({
  volume: new DestinationProperty({
    inputs: [
      {
        type: "number",
        min: 0,
        max: 1,
        initialValue: () => numericAsString(synths.getGain()),
      },
    ],
    onSet: (_command, [value]) => {
      const valid = validators.volume(value);
      synths.updateGain(parseFloat(value));
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
        type: "number",
        min: 0,
        max: 1,
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
        type: "number",
        min: -100,
        max: 100,
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
        type: "number",
        min: -1,
        max: 1,
        initialValue: () =>
          numericAsString(synths.voices[0].nodeA.detune.value),
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
    onRandomize,
  }: {
    machine: Machine;
    onExport: () => void;
    onToggleMachine: () => boolean;
    onToggleRainbow: () => boolean;
    onStepChange: () => void;
    onModeChange: () => void;
    onRandomize: () => void;
  }): Destination {
    const { sequencers, keyboard, clock } = machine;
    const synthSequencers = sequencers.filter((sequencer) =>
      sequencer.isSynth()
    );
    const drumSequencers = sequencers.filter((sequencer) => sequencer.isDrum());
    const destinations = {
      ...Destinations.generateSynthsDestinations({
        sequencers: synthSequencers,
        onStepChange,
      }),
      ...Destinations.generateDrumsDestinations({
        sequencers: drumSequencers,
        onStepChange,
      }),
      ...Destinations.generateCoreDestination({
        machine,
        onExport,
        onToggleMachine,
        onToggleRainbow,
        onModeChange,
        onRandomize,
      }),
      ...Destinations.generateKeyboardDestinations({
        keyboard,
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
    onRandomize,
  }: {
    machine: Machine;
    onExport: () => void;
    onToggleRainbow: () => boolean;
    onToggleMachine: () => boolean;
    onModeChange: () => void;
    onRandomize: () => void;
  }): Destinations {
    const { clock, notes } = machine;
    const commands = {
      random: new DestinationCommand({
        description: "Randomize all steps and synths",
        onCommand: (_command, _args, _prompt) => {
          onRandomize();
          const output = ["Randomized all steps and synths!"];
          return { valid: true, output };
        },
      }),
      export: new DestinationCommand({
        description: "Export settings as a Steganographic image.",
        onCommand: (_command, _args, _prompt) => {
          onExport();
          const output = ["Exported settings!"];
          return { valid: true, output };
        },
      }),
    };

    return {
      core: new Destination({
        key: "core",
        info: {
          label: "Core configurations for the machine",
          content: () => Destinations.formatJSON(machine.exportParams()),
        },
        commands,
        properties: {},
        destinations: {
          clock: new Destination({
            info: {
              label: "Clock timing and state",
              content: () => Destinations.formatJSON(clock.exportParams()),
            },
            commands: {
              toggle: new DestinationCommand({
                description: "Toggle the clock state on or off",
                onCommand: (_command, _args, _prompt) => {
                  const output = [
                    `Turned clock ${onToggleMachine() ? "on" : "off"}`,
                  ];
                  return { valid: true, output };
                },
              }),
            },
            properties: {
              tempo: new DestinationProperty({
                inputs: [
                  {
                    type: "number",
                    min: 45,
                    max: 300,
                    initialValue: () => numericAsString(clock.getRate()),
                  },
                ],
                onSet: (_command, [value]) => {
                  const valid = validators.bpm(value);
                  if (valid) {
                    clock.setRate(parseInt(value));
                  }
                  return { valid };
                },
              }),
              swing: new DestinationProperty({
                inputs: [
                  {
                    type: "number",
                    min: 0,
                    max: 1,
                    initialValue: () => numericAsString(clock.getSwing()),
                  },
                ],
                onSet: (_command, [value]) => {
                  const valid = validators.swing(value);
                  if (valid) {
                    clock.setSwing(parseFloat(value));
                  }
                  return { valid };
                },
              }),
            },
          }),
          notes: new Destination({
            info: {
              label: "Musical key for the machine",
              content: () => Destinations.formatJSON(notes.exportParams()),
            },
            properties: {
              mode: new DestinationProperty({
                inputs: [
                  {
                    type: "select",
                    initialValue: () => notes.getMode().name,
                    options: MODES,
                  },
                ],
                onSet: (_command, [value]) => {
                  const valid = validators.mode(value);
                  if (valid) {
                    notes.setMode(value);
                    onModeChange();
                  }
                  return { valid };
                },
              }),
              root: new DestinationProperty({
                inputs: [
                  {
                    type: "select",
                    initialValue: () => notes.getRoot(),
                    options: ROOTS,
                  },
                ],
                onSet: (_command, [value]) => {
                  const valid = validators.root(value);
                  if (valid) {
                    notes.setRoot(value);
                    onModeChange();
                  }
                  return { valid };
                },
              }),
            },
          }),
          color: new Destination({
            info: {
              label: "Color settings for the machine",
              content: () => "",
            },
            commands: {
              rainbow: new DestinationCommand({
                description: "Toggle the rainbow mode",
                onCommand: (_command, _args, _prompt) => {
                  const output = [
                    `Turned rainbow ${onToggleRainbow() ? "on" : "off"}`,
                  ];
                  return { valid: true, output };
                },
              }),
            },
          }),
        },
      }),
    };
  }

  static generateDrumsDestinations({
    sequencers,
    onStepChange,
  }: {
    sequencers: DrumSequencer[];
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
        properties: {
          volume: new DestinationProperty({
            inputs: [
              {
                type: "number",
                min: 0,
                max: 1,
                initialValue: () => numericAsString(drum.getGain()),
              },
            ],
            onSet: (_command, [value]) => {
              const valid = validators.volume(value);
              drum.updateGain(parseFloat(value));
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
              random: new DestinationCommand({
                description:
                  'Randomize steps. Argument "chance" from 0 through 1.',
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
                    output: ["Could not randomize steps. Invalid arguments."],
                  };
                },
              }),
              double: new DestinationCommand({
                description:
                  'Double steps. Argument "chance" from 0 through 1.',
                onCommand: (_command, _args, _prompt) => {
                  sequencer.steps.double();
                  onStepChange();
                  return { valid: true, output: ["Randomized steps"] };
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
        },
      });
    });
    return destinations;
  }

  static generateKeyboardDestinations({
    keyboard,
    clock: _clock,
  }: {
    keyboard: Keyboard;
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
              Destinations.formatJSON(keyboard.main.exportParams()),
          },
          properties: { ...synthVolumeProperty(keyboard.main) },
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
              Destinations.formatJSON(keyboard.ghosts.exportParams()),
          },
          properties: { ...synthVolumeProperty(keyboard.ghosts) },
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
    onStepChange,
  }: {
    sequencers: SynthSequencer[];
    onStepChange: () => void;
  }): Destinations {
    const destinations: { [destination: string]: Destination } = {};
    sequencers.forEach((sequencer) => {
      const synth = sequencer.synths;
      const key = sequencer.key;
      destinations[key] = new Destination({
        key,
        info: {
          content: () => Destinations.formatJSON(sequencer.exportParams()),
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
              random: new DestinationCommand({
                description:
                  'Randomize steps. Argument "chance" from 0 through 1.',
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
                    output: ["Could not randomize steps. Invalid arguments."],
                  };
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
            properties: { ...synthVolumeProperty(synth) },
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
