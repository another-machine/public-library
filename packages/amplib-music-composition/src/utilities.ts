/**
 * Utility functions for procedural music generation
 */

/**
 * Select an item from an array using weighted random selection
 * @param array The array to select from
 * @param selector A function that returns a random number between 0 and 1
 * @returns The selected item from the array
 */
export function weightedSelect<T>(array: T[], selector: () => number): T {
  return array[Math.floor(selector() * array.length)];
}

/**
 * Normalize a value to a specific range
 * @param value The value to normalize
 * @param min The minimum value of the range
 * @param max The maximum value of the range
 * @returns The normalized value
 */
export function normalizeValue(
  value: number,
  min: number,
  max: number
): number {
  return (value - min) / (max - min);
}

/**
 * Map a value from one range to another
 * @param value The value to map
 * @param fromMin The minimum of the input range
 * @param fromMax The maximum of the input range
 * @param toMin The minimum of the output range
 * @param toMax The maximum of the output range
 * @returns The mapped value
 */
export function mapRange(
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number
): number {
  // First normalize to 0-1
  const normalized = normalizeValue(value, fromMin, fromMax);
  // Then scale to target range
  return normalized * (toMax - toMin) + toMin;
}

/**
 * Create a seeded random number generator
 * @param seed The seed value
 * @returns A function that returns a random number between 0 and 1
 */
export function createSeededRandom(seed: number): () => number {
  return function () {
    // LCG parameters from glibc
    seed = (seed * 1103515245 + 12345) % 2147483647;
    return seed / 2147483647;
  };
}

/**
 * Clamp a value between a minimum and maximum
 * @param value The value to clamp
 * @param min The minimum allowed value
 * @param max The maximum allowed value
 * @returns The clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generate a bell curve distribution
 * @param selector A function that returns a random number between 0 and 1
 * @param mean The mean value of the bell curve
 * @param stdDev The standard deviation of the bell curve
 * @returns A random value from the bell curve distribution
 */
export function bellCurveRandom(
  selector: () => number,
  mean: number,
  stdDev: number
): number {
  // Box-Muller transform for normal distribution
  const u1 = selector();
  const u2 = selector();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

  // Apply mean and standard deviation
  return z0 * stdDev + mean;
}

/**
 * Interpolate between two values
 * @param start The start value
 * @param end The end value
 * @param factor The interpolation factor (0-1)
 * @returns The interpolated value
 */
export function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

/**
 * Convert beats per minute to milliseconds per beat
 * @param bpm Beats per minute
 * @returns Milliseconds per beat
 */
export function bpmToMs(bpm: number): number {
  return 60000 / bpm;
}

/**
 * Calculate note frequency in Hz from MIDI note number
 * @param midiNote The MIDI note number (0-127)
 * @returns The frequency in Hz
 */
export function midiNoteToFrequency(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Format a duration in seconds to mm:ss format
 * @param seconds The duration in seconds
 * @returns The formatted duration string
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
