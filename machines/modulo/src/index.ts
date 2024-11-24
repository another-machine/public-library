import { Machine } from "./Machine";
import { Synths } from "./Synths";

console.clear();

new Machine({
  element: document.body,
  theme: {
    color: {
      core: {
        on: { l: 0.6, c: 0.45, h: 180 },
        off: { l: 0.2, c: 0.03, h: 180 },
        disabled: { l: 0.05, c: 0, h: 0 },
      },
      sequencers: {
        lead: {
          on: { l: 0.6, c: 0.45, h: 10 },
          off: { l: 0.2, c: 0.03, h: 10 },
          disabled: { l: 0.05, c: 0, h: 0 },
        },
        arp: {
          on: { l: 0.6, c: 0.5, h: 105 },
          off: { l: 0.21, c: 0.03, h: 105 },
          disabled: { l: 0.05, c: 0, h: 0 },
        },
        bass: {
          on: { l: 0.6, c: 0.45, h: 120 },
          off: { l: 0.2, c: 0.03, h: 120 },
          disabled: { l: 0.05, c: 0, h: 0 },
        },
        kit: {
          on: { l: 0.6, c: 0.5, h: 290 },
          off: { l: 0.2, c: 0.03, h: 290 },
          disabled: { l: 0.05, c: 0, h: 0 },
        },
      },
      keyboard: {
        on: { l: 0.6, c: 0.43, h: 210 },
        off: { l: 0.2, c: 0.03, h: 210 },
        disabled: { l: 0.2, c: 0.03, h: 210 },
      },
      background: { l: 0, c: 0, h: 0 },
      text: { l: 1, c: 0, h: 0 },
    },
    prompt: {
      corner: 0.2,
      gapColumn: 0.4,
      gapRow: 0.4,
      paddingX: 0.5,
      paddingY: 0.5,
      sizeBorder: 0.1,
      sizeFont: 1,
    },
    interface: {
      corner: 0.2,
      gapColumn: 0.4,
      gapRow: 0.4,
      sizeBorder: 0.1,
    },
  },
  notes: { root: "F#", mode: "locrian" },
  clock: { tempo: 90, swing: 0 },
  keyboard: {
    octave: 3,
    main: {
      volume: 0.1,
      settings: Synths.initialSettingsWithOscillatorType("triangle", 4),
    },
    ghosts: {
      volume: 0.05,
      settings: Synths.initialSettingsWithOscillatorType("sawtooth", 4),
      voices: 2,
    },
  },
  sequencers: [
    {
      key: "lead",
      type: "SYNTH",
      octave: 5,
      steps: {
        size: 12,
        max: 4,
        rows: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
      },
      synths: { volume: 0.05, settings: Synths.initialSettings, voices: 1 },
    },
    {
      key: "arp",
      type: "SYNTH",
      octave: 3,
      steps: {
        size: 12,
        max: 2,
        rows: [
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ],
      },
      synths: { volume: 0.1, settings: Synths.initialSettings, voices: 3 },
    },
    {
      key: "bass",
      type: "SYNTH",
      octave: 1,
      steps: {
        size: 12,
        max: 4,
        rows: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
      },
      synths: { volume: 0.1, settings: Synths.initialSettings, voices: 1 },
    },
    {
      key: "kit",
      type: "DRUM",
      steps: {
        size: 12,
        max: 2,
        rows: [
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ],
      },
      drums: {
        volume: 0.4,
        kit: [{}, {}, {}],
        pieces: ["OPEN_HAT", "CLOSED_HAT", "SNARE", "KICK"],
      },
    },
  ],
});
