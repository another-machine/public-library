import { ConfigurableHat, ConfigurableKick, ConfigurableSnare } from "./Drums";
import { Machine, MachineParams } from "./Machine";
import { Synths } from "./Synths";

console.clear();

const start = document.querySelector<HTMLButtonElement>("button#start")!;

// Update button text based on localStorage status
if (Machine.hasStoredState()) {
  start.textContent = "Start Modulo";
} else {
  start.textContent = "Start Modulo";
}

start.addEventListener("click", () => initialize());

function getDefaultMachineParams(): Omit<MachineParams, "element"> {
  return {
    core: {
      theme: 1,
      notes: { root: "F#", mode: "locrian" },
      clock: { tempo: 90, swing: 0 },
    },
    keys: {
      theme: 6,
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
        theme: 2,
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
        theme: 3,
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
        theme: 4,
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
        theme: 5,
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
        synths: {
          volume: 0.4,
          settings: [
            ConfigurableHat.initialSettings("open"),
            ConfigurableHat.initialSettings("closed"),
            ConfigurableSnare.initialSettings,
            ConfigurableKick.initialSettings,
          ],
        },
      },
    ],
    theme: {
      colors: [
        {
          a: { l: 1, c: 0, h: 0 },
          b: { l: 0.2, c: 0, h: 0 },
          c: { l: 0, c: 0, h: 0 },
        },
        {
          a: { l: 0.6, c: 0.45, h: 180 },
          b: { l: 0.2, c: 0.03, h: 180 },
          c: { l: 0.05, c: 0, h: 0 },
        },
        {
          a: { l: 0.6, c: 0.45, h: 10 },
          b: { l: 0.2, c: 0.03, h: 10 },
          c: { l: 0.05, c: 0, h: 0 },
        },
        {
          a: { l: 0.6, c: 0.5, h: 105 },
          b: { l: 0.21, c: 0.03, h: 105 },
          c: { l: 0.05, c: 0, h: 0 },
        },
        {
          a: { l: 0.6, c: 0.45, h: 120 },
          b: { l: 0.2, c: 0.03, h: 120 },
          c: { l: 0.05, c: 0, h: 0 },
        },
        {
          a: { l: 0.6, c: 0.5, h: 290 },
          b: { l: 0.2, c: 0.03, h: 290 },
          c: { l: 0.05, c: 0, h: 0 },
        },
        {
          a: { l: 0.6, c: 0.43, h: 210 },
          b: { l: 0.2, c: 0.03, h: 210 },
          c: { l: 0.2, c: 0.03, h: 210 },
        },
      ],
      sizes: {
        pads: {
          border: 0.1,
          corner: 0.2,
          gapX: 0.4,
          gapY: 0.4,
          glow: 0.1,
          paddingX: 0.5,
          paddingY: 0.5,
        },
        prompt: {
          border: 0.1,
          corner: 0.2,
          font: 1,
          gapX: 0.4,
          gapY: 0.4,
          paddingX: 0.5,
          paddingY: 0.5,
          width: 32,
        },
      },
    },
  };
}

function initialize() {
  start.remove();

  // Try to load from localStorage first, fallback to defaults
  const storedParams = Machine.loadFromLocalStorage();
  const machineParams = storedParams || getDefaultMachineParams();

  console.log(
    storedParams
      ? "Loaded machine state from localStorage"
      : "Using default machine settings"
  );

  new Machine({
    element: document.body,
    ...machineParams,
  });
}
