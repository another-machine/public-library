import { Time } from "tone";
import { Machine } from "../Machine";
import { SynthSequencer } from "../Sequencer";
import {
  validators,
  numericAsString,
  timeOptions,
  formatJSON,
} from "./utilities";
import {
  synthDestinations,
  synthProperties,
  synthsCommands,
  synthVolumeProperty,
  themeSelectorProperty,
} from "./synthUtilities";
import {
  Destination,
  DestinationCommand,
  DestinationProperty,
} from "./Destination";

export function generateSynthsDestinations({
  sequencers,
  machine,
  onStepChange,
  onPropertyChange,
}: {
  sequencers: SynthSequencer[];
  machine: Machine;
  onStepChange: () => void;
  onPropertyChange: () => void;
}): { [destination: string]: Destination } {
  const destinations: { [destination: string]: Destination } = {};
  sequencers.forEach((sequencer) => {
    const synth = sequencer.synths;
    const key = sequencer.key;
    destinations[key] = new Destination({
      key: sequencer.theme.toString(),
      info: {
        content: () => formatJSON(sequencer.exportParams(), 4),
      },
      properties: {
        octave: new DestinationProperty({
          inputs: [
            {
              type: "range",
              min: 0,
              max: 7,
              step: 1,
              initialValue: () => sequencer.octave.toString(),
            },
          ],
          onSet: (_command, [value]) => {
            const valid = validators.octave(value);
            if (valid) {
              sequencer.octave = parseInt(value);
              onPropertyChange();
            }
            return { valid };
          },
        }),
        ...themeSelectorProperty(
          machine,
          (value) => (sequencer.theme = value),
          () => sequencer.theme.toString()
        ),
      },

      destinations: {
        steps: new Destination({
          info: {
            content: () => formatJSON(sequencer.steps.exportParams()),
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
            third: new DestinationCommand({
              description: "Third steps",
              onCommand: (_command, _args, _prompt) => {
                sequencer.steps.third();
                onStepChange();
                return { valid: true, output: ["Thirded steps"] };
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
                content: () => formatJSON(sequencer.steps.exportParams()),
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
                      output: ["Could not randomize steps. Invalid arguments."],
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
                onPropertyChange();
                return { valid };
              },
            }),
          },
        }),
        synths: new Destination({
          info: {
            content: () => {
              const settings = synth.exportParams();
              return formatJSON(settings);
            },
          },
          properties: { ...synthVolumeProperty(() => synth) },
          destinations: {
            a: new Destination({
              info: {
                content: () => formatJSON(synth.exportParams().settings.a),
              },
              commands: synthsCommands(synth, true, false),
              properties: synthProperties(synth, true, false),
              destinations: synthDestinations(synth, true, false),
            }),
            b: new Destination({
              info: {
                content: () => formatJSON(synth.exportParams().settings.b),
              },
              commands: synthsCommands(synth, false, true),
              properties: synthProperties(synth, false, true),
              destinations: synthDestinations(synth, false, true),
            }),
          },
        }),
        effects: new Destination({
          info: {
            content: () => {
              const { delay, reverb } = synth.exportParams().settings;
              return formatJSON({ delay, reverb });
            },
          },
          properties: {
            delay: new DestinationProperty({
              inputs: [
                {
                  label: "feedback",
                  type: "range",
                  min: 0,
                  max: 1,
                  initialValue: () =>
                    numericAsString(synth.voices[0].delay.feedback.value),
                },
                {
                  label: "wet",
                  type: "range",
                  min: 0,
                  max: 1,
                  initialValue: () =>
                    numericAsString(synth.voices[0].delay.wet.value),
                },
                {
                  label: "time",
                  type: "select",
                  options: timeOptions,
                  initialValue: () =>
                    Time(synth.voices[0].delay.delayTime.value).toNotation(),
                },
              ],
              onSet: (_command, [feedback, wet, time]) => {
                const valid = true;
                synth.updateDelay({
                  feedback: parseFloat(feedback),
                  delayTime: time,
                  wet: parseFloat(wet),
                });
                onPropertyChange();
                return { valid };
              },
            }),
            reverb: new DestinationProperty({
              inputs: [
                {
                  label: "size",
                  type: "range",
                  min: 0,
                  max: 1,
                  initialValue: () =>
                    numericAsString(synth.voices[0].reverb.roomSize.value),
                },
                {
                  label: "wet",
                  type: "range",
                  min: 0,
                  max: 1,
                  initialValue: () =>
                    numericAsString(synth.voices[0].reverb.wet.value),
                },
              ],
              onSet: (_command, [size, wet]) => {
                const valid = true;
                synth.updateReverb({
                  roomSize: parseFloat(size),
                  wet: parseFloat(wet),
                });
                onPropertyChange();
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
