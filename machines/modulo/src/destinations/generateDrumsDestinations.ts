import { Destinations } from "./Destinations";
import { Machine } from "../Machine";
import { DrumSequencer } from "../Sequencer";
import { Time } from "tone/build/esm/core";
import {
  formatJSON,
  numericAsString,
  timeOptions,
  validators,
} from "./utilities";
import { ConfigurableHat, ConfigurableKick, ConfigurableSnare } from "../Drums";
import { synthVolumeProperty, themeSelectorProperty } from "./synthUtilities";
import {
  Destination,
  DestinationCommand,
  DestinationProperty,
} from "./Destination";

function synthEffectsProperties(
  loader: () => ConfigurableHat | ConfigurableKick | ConfigurableSnare
): { [k: string]: DestinationProperty } {
  return {
    highpass: new DestinationProperty({
      inputs: [
        {
          label: "Q",
          type: "range",
          min: 0,
          max: 1,
          initialValue: () =>
            numericAsString(loader().exportParams().settings.highpass.Q || 0),
        },
        {
          label: "frequency",
          type: "range",
          min: 0,
          max: 12000,
          initialValue: () =>
            numericAsString(
              loader().exportParams().settings.highpass.frequency || 0
            ),
        },
      ],
      onSet: (_command, [q, frequency]) => {
        const { volume, settings } = loader().exportParams();
        loader().updateSettings({
          volume,
          settings: {
            ...settings,
            highpass: {
              ...settings.highpass,
              Q: parseFloat(q),
              frequency: parseFloat(frequency),
            },
          },
        });
        return { valid: true };
      },
    }),
    lowpass: new DestinationProperty({
      inputs: [
        {
          label: "Q",
          type: "range",
          min: 0,
          max: 1,
          initialValue: () =>
            numericAsString(loader().exportParams().settings.lowpass.Q || 0),
        },
        {
          label: "frequency",
          type: "range",
          min: 0,
          max: 12000,
          initialValue: () =>
            numericAsString(
              loader().exportParams().settings.lowpass.frequency || 0
            ),
        },
      ],
      onSet: (_command, [q, frequency]) => {
        const { volume, settings } = loader().exportParams();
        loader().updateSettings({
          volume,
          settings: {
            ...settings,
            lowpass: {
              ...settings.lowpass,
              Q: parseFloat(q),
              frequency: parseFloat(frequency),
            },
          },
        });
        return { valid: true };
      },
    }),
    crush: new DestinationProperty({
      inputs: [
        {
          label: "bits",
          type: "range",
          min: 1,
          max: 16,
          step: 1,
          initialValue: () =>
            numericAsString(loader().exportParams().settings.crush.bits || 1),
        },
        {
          label: "wet",
          type: "range",
          min: 0,
          max: 1,
          initialValue: () =>
            numericAsString(loader().exportParams().settings.crush.wet || 0),
        },
      ],
      onSet: (_command, [bits, wet]) => {
        const { volume, settings } = loader().exportParams();
        loader().updateSettings({
          volume,
          settings: {
            ...settings,
            crush: {
              ...settings.crush,
              wet: parseFloat(wet),
              bits: parseInt(bits),
            },
          },
        });
        return { valid: true };
      },
    }),

    delay: new DestinationProperty({
      inputs: [
        {
          label: "feedback",
          type: "range",
          min: 0,
          max: 1,
          initialValue: () => numericAsString(loader().delay.feedback.value),
        },
        {
          label: "wet",
          type: "range",
          min: 0,
          max: 1,
          initialValue: () => numericAsString(loader().delay.wet.value),
        },
        {
          label: "time",
          type: "select",
          options: timeOptions,
          initialValue: () => Time(loader().delay.delayTime.value).toNotation(),
        },
      ],
      onSet: (_command, [feedback, wet, time]) => {
        const { volume, settings } = loader().exportParams();
        loader().updateSettings({
          volume,
          settings: {
            ...settings,
            delay: {
              ...settings.delay,
              feedback: parseFloat(feedback),
              delayTime: time,
              wet: parseFloat(wet),
            },
          },
        });
        return { valid: true };
      },
    }),
  };
}

export function generateDrumsDestinations({
  sequencers,
  machine,
  onStepChange,
  onPropertyChange,
}: {
  sequencers: DrumSequencer[];
  machine: Machine;
  onStepChange: () => void;
  onPropertyChange: () => void;
}): { [destination: string]: Destination } {
  const destinations: { [destination: string]: Destination } = {};
  sequencers.forEach((sequencer) => {
    const drums = sequencer.drums;
    const key = sequencer.key;
    destinations[key] = new Destination({
      key: sequencer.theme.toString(),
      info: {
        content: () => formatJSON(sequencer.exportParams()),
      },
      properties: {
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
                return { valid };
              },
            }),
          },
        }),
        synths: new Destination({
          info: {
            content: () => formatJSON(drums.exportParams()),
          },
          properties: {
            ...synthVolumeProperty(() => drums),
          },
          destinations: drums.kit.reduce<{
            [k: string]: Destination;
          }>((into, drum, index) => {
            into[index] = new Destination({
              info: {
                content: () => formatJSON(drum.exportParams()),
              },
              properties: {
                ...synthVolumeProperty(() => drum),
                ...synthEffectsProperties(() => drum),
              },
              destinations: {},
            });
            return into;
          }, {}),
        }),
      },
    });
  });
  return destinations;
}
