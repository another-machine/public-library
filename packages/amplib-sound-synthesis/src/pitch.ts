/**
 * Pitch-class to frequency, shared by the layers and the drum-free voices.
 *
 * Pitch class 0 = C, 9 = A. A4 = 440 Hz, so pc 9 at octave 4 is the anchor.
 * This lives here rather than in @amplib/music-theory because it is a raw
 * numeric conversion with no Notation or Scale involved — the layers work in
 * pitch classes coming out of an analyzer, not in named notes.
 */
export function pitchClassToFrequency(
  pitchClass: number,
  octave: number
): number {
  return 440 * Math.pow(2, (pitchClass - 9 + (octave - 4) * 12) / 12);
}

/**
 * cancelAndHoldAtTime where the browser has it, otherwise cancel and pin the
 * current value. Safari shipped setTargetAtTime long before cancelAndHold, and
 * without the fallback a cancel there resets the param to its default instead
 * of holding — an audible jump rather than a smooth takeover.
 */
export function cancelParam(param: AudioParam, now: number): void {
  type Extended = AudioParam & {
    cancelAndHoldAtTime?: (time: number) => AudioParam;
  };
  const extended = param as Extended;
  if (typeof extended.cancelAndHoldAtTime === "function") {
    extended.cancelAndHoldAtTime(now);
  } else {
    const value = param.value;
    param.cancelScheduledValues(0);
    param.setValueAtTime(value, now);
  }
}
