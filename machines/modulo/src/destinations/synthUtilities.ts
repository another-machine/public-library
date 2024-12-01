import { Destinations } from "./Destinations";
import {
  ConfigurableHat,
  ConfigurableKick,
  ConfigurableSnare,
  Drums,
} from "../Drums";
import {
  oscillatorTypes,
  Synths,
  SynthSettingsOscillatorType,
} from "../Synths";
import {
  Destination,
  DestinationProperty,
  DestinationCommand,
} from "./Destination";
import { formatJSON, numericAsString, validators } from "./utilities";
import { Sequencer } from "../Sequencer";
import { Machine } from "../Machine";

export function synthVolumeProperty(
  loader: () =>
    | Synths
    | Drums
    | ConfigurableHat
    | ConfigurableKick
    | ConfigurableSnare
) {
  return {
    volume: new DestinationProperty({
      inputs: [
        {
          type: "range",
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
  };
}

export const themeSelectorProperty = (
  machine: Machine,
  set: (theme: number) => void,
  get: () => string
) => ({
  theme: new DestinationProperty({
    inputs: [
      {
        type: "select",
        options: machine.renderer.theme.colors.map((_, i) => i.toString()),
        initialValue: get,
      },
    ],
    onSet: (_command, [value]) => {
      set(parseInt(value));
      machine.renderer.refreshTheme();
      machine.promptInterface.updateTheme(value);
      machine.destinations.refresh();
      return { valid: true };
    },
  }),
});

export const synthDestinations = (synths: Synths, a: boolean, b: boolean) => ({
  envelope: new Destination({
    info: {
      content: () =>
        formatJSON(
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

export const synthProperties = (synths: Synths, a: boolean, b: boolean) => ({
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

export const synthsCommands = (synths: Synths, a: boolean, b: boolean) => ({
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
