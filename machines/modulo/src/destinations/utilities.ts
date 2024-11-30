import { MODES, ROOTS } from "../Notes";
import { Time as TimeUnit } from "tone/build/esm/core/type/Units";

const validateTime = (string: string) =>
  Boolean(string.match(/^((2|4|8|16|32)[dnt])|(\d+(\.\d+)?)$/));

const validateNumber = (min: number, max: number) => (value: string) => {
  const float = parseFloat(value);
  return float >= min && float <= max;
};

const validateOptions = (list: string[]) => (value: string) =>
  list.includes(value);

export const timeOptions = ["4n", "8n", "16n", "32n", "4t", "8t", "16t", "32t"];

export const validators = {
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

export function numericAsString(time: TimeUnit | number) {
  if (typeof time === "number") {
    return (Math.round(time * 10000) / 10000).toString();
  } else if (typeof time === "string") {
    return time;
  }
  return time.valueOf().toString();
}
