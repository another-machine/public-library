import { Time } from "tone";
import { Destinations } from "./Destinations";
import { Machine } from "../Machine";
import { SynthSequencer } from "../Sequencer";
import { validators, numericAsString, timeOptions } from "./utilities";
import {
  synthDestinations,
  synthProperties,
  synthsCommands,
  synthVolumeProperty,
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
