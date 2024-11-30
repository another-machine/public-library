import { Destinations } from "./Destinations";
import { Machine } from "../Machine";
import { DrumSequencer } from "../Sequencer";
import { Time } from "tone/build/esm/core";
import { numericAsString, timeOptions, validators } from "./utilities";
import { ConfigurableHat, ConfigurableKick, ConfigurableSnare } from "../Drums";
import { synthVolumeProperty } from "./synthUtilities";
import {
  Destination,
  DestinationCommand,
  DestinationProperty,
} from "./Destination";

function synthEffectsDestinations(
  loader: () => ConfigurableHat | ConfigurableKick | ConfigurableSnare
) {
  return {
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
                numericAsString(
                  loader().exportParams().settings.highpass.Q || 0
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
                highpass: {
                  ...settings.highpass,
                  frequency: parseFloat(value),
                },
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
                numericAsString(
                  loader().exportParams().settings.lowpass.Q || 0
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
                numericAsString(
                  loader().exportParams().settings.crush.wet || 0
                ),
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
                numericAsString(
                  loader().exportParams().settings.crush.bits || 1
                ),
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
              initialValue: () =>
                numericAsString(loader().delay.feedback.value),
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
                numericAsString(
                  loader().exportParams().settings.delay.wet || 0
                ),
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
  };
}

export function generateDrumsDestinations({
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
