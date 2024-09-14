import { Clock } from "./Clock";
import { Prompt, PromptOutput } from "./Prompt";
import { SynthSettingsOscillatorType, Synths, oscillatorTypes } from "./Synths";
import { MODES, Notes, ROOTS } from "./Notes";
import { DrumSequencer, Sequencer, SynthSequencer } from "./Sequencer";
import { Keyboard } from "./Keyboard";
import { Signal } from "tone";

export type DestinationCommandArgs = {
  description: string;
  onCommand(command: string, args: string[], prompt: Prompt): PromptOutput;
};

export type DestinationPropertyArgs = {
  description: string;
  onGet(command: string, args: string[], prompt: Prompt): PromptOutput;
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
  gain: validateNumber(0, 1),
  mode: validateOptions(MODES),
  octave: validateNumber(0, 7),
  oscillator: (string: string) =>
    Boolean(
      string.match(
        /^(((am|fm|fat)?(sine|square|sawtooth|triangle)([1-9]|[12][0-9]|3[0-2])?)|pulse)$/
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

class DestinationCommand {
  description: string;
  onCommand: (command: string, args: string[], prompt: Prompt) => PromptOutput;

  constructor({ description, onCommand }: DestinationCommandArgs) {
    this.description = description;
    this.onCommand = onCommand;
  }
}

class DestinationProperty {
  description: string;
  onGet: (command: string, args: string[], prompt: Prompt) => PromptOutput;
  onSet: (command: string, args: string[], prompt: Prompt) => PromptOutput;

  constructor({ description, onGet, onSet }: DestinationPropertyArgs) {
    this.description = description;
    this.onGet = onGet;
    this.onSet = onSet;
  }
}

export class Destination {
  key?: string;
  description: string;
  destinations: { [destination: string]: Destination };
  properties: { [property: string]: DestinationProperty };
  commands: { [command: string]: DestinationCommand };

  constructor({
    key,
    description,
    destinations,
    properties,
    commands,
  }: {
    key?: string;
    description: string;
    destinations?: { [destination: string]: Destination };
    properties?: { [property: string]: DestinationProperty };
    commands?: { [command: string]: DestinationCommand };
  }) {
    this.key = key;
    this.description = description;
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
    const destinationDescriptions = destinations.reduce<{
      [k: string]: string;
    }>((into, key) => {
      into[key] = this.destinations[key].description;
      return into;
    }, {});
    const properties = Object.keys(this.properties);
    const propertyDescriptions = properties.reduce<{
      [k: string]: string;
    }>((into, key) => {
      into[key] = this.properties[key].description;
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
      destinationDescriptions,
      properties,
      propertyDescriptions,
      commands,
      commandDescriptions,
    };
  }
}

const synthProperties = (synths: Synths, a: boolean, b: boolean) => ({
  type: new DestinationProperty({
    description: "Oscillator type",
    onSet: (_command, [value], _prompt) => {
      const valid = validators.oscillator(value);
      if (valid) {
        synths.updateSynth(
          { oscillator: { type: value as SynthSettingsOscillatorType } },
          a,
          b
        );
        return { valid, output: [`Set type to ${value}`] };
      } else {
        return { valid, output: [`Could not set type to ${value}`] };
      }
    },
    onGet: (_command, _args, _prompt) => {
      const output: string[] = [];
      if (a) {
        output.push(synths.voices[0].nodeA.oscillator.type);
      }
      if (b) {
        output.push(synths.voices[0].nodeB.oscillator.type);
      }
      output.push(oscillatorTypes.join(", "));
      output.push('Optionally add partial suffix from 0 to 64 eg. "sine8"');
      return { valid: true, output };
    },
  }),
  adsr: new DestinationProperty({
    description: "ADSR each from 0 to 1 (x4)",
    onSet: (_command, args, _prompt) => {
      const valid = validators.adsr(args);
      if (valid) {
        synths.updateSynth(
          {
            envelope: {
              attack: parseFloat(args[0]),
              decay: parseFloat(args[1]),
              sustain: parseFloat(args[2]),
              release: parseFloat(args[3]),
            },
          },
          a,
          b
        );
        return { valid, output: [`Set adsr to ${args.join(" / ")}`] };
      } else {
        return {
          valid,
          output: [
            `Could not set adsr to ${args.join(" / ")}`,
            "Must be 4 space-separated values from 0 through 1",
          ],
        };
      }
    },
    onGet: (_command, _args, _prompt) => {
      const output: string[] = [];
      if (a) {
        const { envelope } = synths.voices[0].nodeA;
        output.push(
          [
            envelope.attack,
            envelope.decay,
            envelope.sustain,
            envelope.release,
          ].join(" / ")
        );
      }
      if (b) {
        const { envelope } = synths.voices[0].nodeB;
        output.push(
          [
            envelope.attack,
            envelope.decay,
            envelope.sustain,
            envelope.release,
          ].join(" / ")
        );
      }
      output.push("Attack / Decay / Sustain / Release", "All from 0 through 1");
      return { valid: true, output };
    },
  }),
  portamento: new DestinationProperty({
    description: "Portamento value from 0 and 1",
    onSet: (_command, [value], _prompt) => {
      const valid = validators.portamento(value);
      if (valid) {
        synths.updateSynth({ portamento: parseFloat(value) }, a, b);
        return { valid, output: [`Set portamento to ${value}`] };
      } else {
        return {
          valid,
          output: [`Could not set portamento to ${value}. Must be 0 - 1`],
        };
      }
    },
    onGet: (_command, _args, _prompt) => {
      const output: number[] = [];
      if (a) {
        output.push(synths.voices[0].nodeA.portamento);
      }
      if (b) {
        output.push(synths.voices[0].nodeB.portamento);
      }
      return { valid: true, output: [output.join(" & ")] };
    },
  }),
  detune: new DestinationProperty({
    description: "Detune cents from -100 through 100",
    onSet: (_command, [value], _prompt) => {
      const valid = validators.detune(value);
      if (valid) {
        synths.updateSynth({ detune: parseInt(value) }, a, b);
        return { valid, output: [`Set detune to ${value}`] };
      } else {
        return {
          valid,
          output: [`Could not set detune to ${value}. Must be 0 - 1`],
        };
      }
    },
    onGet: (_command, _args, _prompt) => {
      const output: Signal<"cents">[] = [];
      if (a) {
        output.push(synths.voices[0].nodeA.detune);
      }
      if (b) {
        output.push(synths.voices[0].nodeB.detune);
      }
      return { valid: true, output: [output.join(" & ")] };
    },
  }),
  pan: new DestinationProperty({
    description: 'Panning value where "-1" is left and "1" is right',
    onSet: (_command, [value], _prompt) => {
      const valid = validators.pan(value);
      if (valid) {
        synths.updatePan(parseFloat(value), a, b);
        return { valid, output: [`Set pan to ${value}`] };
      } else {
        return {
          valid,
          output: [`Could not set pan to ${value}. Must be from -1 through 1`],
        };
      }
    },
    onGet: (_command, _args, _prompt) => {
      const output: Signal<"cents">[] = [];
      if (a) {
        output.push(synths.voices[0].nodeA.detune);
      }
      if (b) {
        output.push(synths.voices[0].nodeB.detune);
      }
      return { valid: true, output: [output.join(" & ")] };
    },
  }),
});

const synthsCommands = (synths: Synths, a: boolean, b: boolean) => ({
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
  // load: new DestinationCommand({
  //   description: "Load synth configuration",
  //   onCommand,
  // }),
  // save: new DestinationCommand({
  //   description: "Save synth configuration",
  //   onCommand,
  // }),
});

export class Destinations {
  static generateDestinations({
    clock,
    notes,
    sequencers,
    keyboard,
    onExport,
    onToggleMachine,
    onToggleRainbow,
    onStepChange,
    onModeChange,
    onRandomize,
  }: {
    clock: Clock;
    notes: Notes;
    sequencers: Sequencer[];
    keyboard: Keyboard;
    onExport: () => void;
    onToggleMachine: () => boolean;
    onToggleRainbow: () => boolean;
    onStepChange: () => void;
    onModeChange: () => void;
    onRandomize: () => void;
  }): Destination {
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
        clock,
        notes,
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
      description: "Modulo",
      destinations,
      properties: {},
      commands: {},
    });
  }

  static generateCoreDestination({
    clock,
    notes,
    onExport,
    onToggleMachine,
    onToggleRainbow,
    onModeChange,
    onRandomize,
  }: {
    clock: Clock;
    notes: Notes;
    onExport: () => void;
    onToggleRainbow: () => boolean;
    onToggleMachine: () => boolean;
    onModeChange: () => void;
    onRandomize: () => void;
  }): Destinations {
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
      // load: new DestinationCommand({
      //   description: "Load machine configuration",
      //   onCommand,
      // }),
      // save: new DestinationCommand({
      //   description: "Save machine configuration",
      //   onCommand,
      // }),
    };

    return {
      core: new Destination({
        key: "core",
        description: "Core configurations for the machine",
        commands,
        properties: {},
        destinations: {
          clock: new Destination({
            description: "Clock timing and state",
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
                description: "Clock tempo expressed as beats per minute",
                onSet: (_command, [value]) => {
                  const valid = validators.bpm(value);
                  if (valid) {
                    clock.setRate(parseInt(value));
                    return {
                      valid,
                      output: [`Set clock tempo to ${value}bpm`],
                    };
                  } else {
                    return {
                      valid,
                      output: [`Could not set clock tempo to ${value}bpm`],
                    };
                  }
                },
                onGet: () => ({
                  valid: true,
                  output: [`Clock tempo is ${clock.getRate()}bpm`],
                }),
              }),
              swing: new DestinationProperty({
                description: "Clock swing expressed as float from 0 through 1",
                onSet: (_command, [value]) => {
                  const valid = validators.swing(value);
                  if (valid) {
                    clock.setSwing(parseFloat(value));
                    return { valid, output: [`Set clock swing to ${value}`] };
                  } else {
                    return {
                      valid,
                      output: [`Could not set clock swing to ${value}`],
                    };
                  }
                },
                onGet: () => ({
                  valid: true,
                  output: [`Clock swing is ${clock.getSwing()}`],
                }),
              }),
            },
          }),
          key: new Destination({
            description: "Musical key for the machine",
            properties: {
              mode: new DestinationProperty({
                description: "The mode for the current key.",
                onSet: (_command, [value]) => {
                  const valid = validators.mode(value);
                  if (valid) {
                    notes.setMode(value);
                    onModeChange();
                    return { valid, output: [`Set mode to ${value}`] };
                  } else {
                    return {
                      valid,
                      output: [`Could not set mode to ${value}`],
                    };
                  }
                },
                onGet: () => ({
                  valid: true,
                  output: [
                    `Current mode is "${notes.getMode()}".`,
                    MODES.join(", "),
                  ],
                }),
              }),
              root: new DestinationProperty({
                description: "The root for the current key.",
                onSet: (_command, [value]) => {
                  const valid = validators.root(value);
                  if (valid) {
                    notes.setRoot(value);
                    onModeChange();
                    return { valid, output: [`Set root to ${value}`] };
                  } else {
                    return {
                      valid,
                      output: [`Could not set root to ${value}`],
                    };
                  }
                },
                onGet: () => ({
                  valid: true,
                  output: [
                    `Root is "${notes.getRoot()}"`,
                    `${ROOTS.join(", ")}`,
                  ],
                }),
              }),
            },
          }),
          color: new Destination({
            description: "Color settings for the machine",
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
        description: `Settings for ${key.charAt(0).toUpperCase()}${key.slice(
          1
        )}`,
        commands: {
          random: new DestinationCommand({
            description: 'Randomize steps. Argument "chance" from 0 through 1.',
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
            description: 'Double steps. Argument "chance" from 0 through 1.',
            onCommand: (_command, _args, _prompt) => {
              sequencer.steps.double();
              onStepChange();
              return { valid: true, output: ["Randomized steps"] };
            },
          }),
        },
        properties: {
          steps: new DestinationProperty({
            description: "Step count from 1 to 16",
            onSet: (_command, [value]) => {
              const valid = validators.step(value);
              if (valid) sequencer.steps.set(parseInt(value));
              onStepChange();
              return { valid, output: [`Set steps to ${value}`] };
            },
            onGet: () => ({
              valid: true,
              output: [`Step count is ${sequencer.steps.size}`],
            }),
          }),
          gain: new DestinationProperty({
            description: "Set gain from 0 through 1",
            onSet: (_command, [value]) => {
              const valid = validators.gain(value);
              drum.updateGain(parseFloat(value));
              if (valid) {
                return { valid, output: [`Set gain to ${value}`] };
              } else {
                return { valid, output: [`Could not set gain to ${value}`] };
              }
            },
            onGet: () => ({
              valid: true,
              output: [`Gain is ${drum.getGain()}`],
            }),
          }),
        },

        destinations: {},
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
      description: "The Keyboard",
      destinations: {
        main: new Destination({
          description: "The selected note synth",
          commands: synthsCommands(keyboard.main, true, true),
          properties: synthProperties(keyboard.main, true, true),
        }),
        ghosts: new Destination({
          description: "The ghost note synths",
          commands: synthsCommands(keyboard.ghosts, true, true),
          properties: synthProperties(keyboard.ghosts, true, true),
        }),
      },
      properties: {
        octave: new DestinationProperty({
          description: "Set base octave from 0 through 7",
          onSet: (_command, [value]) => {
            const valid = validators.octave(value);
            if (valid) {
              keyboard.octave = parseInt(value);
              return { valid, output: [`Set base octave to ${value}`] };
            } else {
              return {
                valid,
                output: [`Could not set base octave to ${value}`],
              };
            }
          },
          onGet: () => ({
            valid: true,
            output: [`Base octave is ${keyboard.octave}`],
          }),
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
        description: `Settings for ${key.charAt(0).toUpperCase()}${key.slice(
          1
        )} Sequencer`,
        commands: {
          random: new DestinationCommand({
            description: 'Randomize steps. Argument "chance" from 0 through 1.',
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
          steps: new DestinationProperty({
            description: "Step count from 1 to 16",
            onSet: (_command, [value]) => {
              const valid = validators.step(value);
              if (valid) sequencer.steps.set(parseInt(value));
              onStepChange();
              return { valid, output: [`Set steps to ${value}`] };
            },
            onGet: () => ({
              valid: true,
              output: [`Step count is ${sequencer.steps.size}`],
            }),
          }),
          gain: new DestinationProperty({
            description: "Set gain from 0 through 1",
            onSet: (_command, [value]) => {
              const valid = validators.gain(value);
              synth.updateGain(parseFloat(value));
              if (valid) {
                return { valid, output: [`Set gain to ${value}`] };
              } else {
                return { valid, output: [`Could not set gain to ${value}`] };
              }
            },
            onGet: () => ({
              valid: true,
              output: [`Gain is ${synth.getGain()}`],
            }),
          }),
          octave: new DestinationProperty({
            description: "Set base octave from 0 through 7",
            onSet: (_command, [value]) => {
              const valid = validators.octave(value);
              if (valid) {
                sequencer.octave = parseInt(value);
                return { valid, output: [`Set base octave to ${value}`] };
              } else {
                return {
                  valid,
                  output: [`Could not set base octave to ${value}`],
                };
              }
            },
            onGet: () => ({
              valid: true,
              output: [`Base octave is ${sequencer.octave}`],
            }),
          }),
        },

        destinations: {
          synth: new Destination({
            description: "Settings for both synth voices",
            commands: synthsCommands(synth, true, true),
            properties: synthProperties(synth, true, true),
            destinations: {
              a: new Destination({
                description: "Settings for synth voice A",
                commands: synthsCommands(synth, true, false),
                properties: synthProperties(synth, true, false),
              }),
              b: new Destination({
                description: "Settings for synth voice B",
                commands: synthsCommands(synth, false, true),
                properties: synthProperties(synth, false, true),
              }),
            },
          }),
          delay: new Destination({
            description: "Delay effect",
            properties: {
              feedback: new DestinationProperty({
                description: "Delay feedback from 0 through 1",
                onSet: (_command, [value]) => {
                  const valid = validators.feedback(value);
                  synth.updateDelay({ feedback: parseFloat(value) });
                  if (valid) {
                    return {
                      valid,
                      output: [`Set delay feedback to ${value}`],
                    };
                  } else {
                    return {
                      valid,
                      output: [`Could not set delay feedback to ${value}`],
                    };
                  }
                },
                onGet: () => ({
                  valid: true,
                  output: [
                    `Delay feedback is ${synth.voices[0].delay.feedback.value}`,
                  ],
                }),
              }),
              time: new DestinationProperty({
                description: "Time for delay",
                onSet: (_command, [value]) => {
                  const valid = validators.time(value);
                  synth.updateDelay({ delayTime: value });
                  if (valid) {
                    return { valid, output: [`Set delay time to ${value}`] };
                  } else {
                    return {
                      valid,
                      output: [`Could not set delay time to ${value}`],
                    };
                  }
                },
                onGet: () => ({
                  valid: true,
                  output: [
                    `Delay time is ${synth.voices[0].delay.delayTime.value}`,
                  ],
                }),
              }),
              wet: new DestinationProperty({
                description: "Delay wet from 0 through 1",
                onSet: (_command, [value]) => {
                  const valid = validators.wet(value);
                  synth.updateDelay({ wet: parseFloat(value) });
                  if (valid) {
                    return { valid, output: [`Set delay wet to ${value}`] };
                  } else {
                    return {
                      valid,
                      output: [`Could not set delay wet to ${value}`],
                    };
                  }
                },
                onGet: () => ({
                  valid: true,
                  output: [`Delay wet is ${synth.voices[0].delay.wet.value}`],
                }),
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
