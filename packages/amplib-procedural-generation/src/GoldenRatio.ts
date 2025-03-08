/**
 * Performing deterministic procedural generation in
 * aesthetically pleasing distributions.
 */
export class GoldenRatio {
  // The golden ratio (φ or phi)
  private readonly PHI: number = 1.61803398875;

  // Seed value for generation
  private seed: number;

  /**
   * Constructor for the procedural generator
   * @param seed Optional seed value, defaults to current time
   */
  constructor({ seed = 0 }: { seed?: number } = { seed: 12 }) {
    this.seed = seed ?? 0;
  }

  /**
   * Implementation of modulo that handles floats and negative numbers correctly
   * @param a Dividend
   * @param b Divisor
   * @returns Remainder of a / b
   */
  private fmod(a: number, b: number): number {
    return Number((a - Math.floor(a / b) * b).toPrecision(10));
  }

  /**
   * Check if an event should occur at the given time based on the golden ratio
   * This creates events 1-2 times per hour (when modulo 3600)
   *
   * @param time Timestamp to check
   * @param eventWindow Window size in which event occurs (default 1 second)
   * @param cycleLength Total cycle length (default 10 seconds)
   * @returns True if an event should occur, false otherwise
   */
  shouldEventOccur({
    time,
    eventWindow = 1000,
    cycleLength = 10000,
  }: {
    time: number;
    eventWindow?: number;
    cycleLength?: number;
  }): boolean {
    const value = this.fmod((time + this.seed) * this.PHI, cycleLength);
    return value < eventWindow;
  }

  /**
   * Generate a value between min and max using the golden ratio and time
   *
   * @param min Minimum value (inclusive)
   * @param max Maximum value (exclusive)
   * @param time Timestamp to use
   * @returns A deterministic but seemingly random value between min and max
   */
  generate({
    min = 0,
    max = 1,
    time,
  }: {
    min?: number;
    max?: number;
    time: number;
  }): number {
    // Use golden ratio and seed to generate a value between 0 and 1
    const normalized = this.fmod((time + this.seed) * this.PHI, 1);
    // Scale to range
    return min + normalized * (max - min);
  }

  /**
   * Generate a noise value at coordinates (x, y) - useful for terrain generation
   * This implements a simple 2D noise function using the golden ratio
   *
   * @param x X coordinate
   * @param y Y coordinate
   * @returns A deterministic noise value between 0 and 1
   */
  noise2d({ x, y }: { x: number; y: number }): number {
    // Combine coordinates with seed to create a unique input
    const normX = this.fmod(x, 10000);
    const normY = this.fmod(y, 10000);

    // Combine coordinates with seed to create a unique input
    const input = normX * 12345.6789 + normY * 9876.54321 + this.seed;
    return this.fmod(input * this.PHI, 1);
  }
}
