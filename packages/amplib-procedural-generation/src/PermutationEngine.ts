interface PermutationEngineParams {
  seed: string;
  length: number;
}

/**
 * Generates deterministic permutations from a seed string using Fisher-Yates shuffle.
 * Used for scrambling data in a reversible way for encryption-like purposes.
 */
export class PermutationEngine {
  private _seed: string;
  private _length: number;
  private _permutation: number[];
  private _inverse: number[];

  constructor({ seed, length }: PermutationEngineParams) {
    this._seed = seed;
    this._length = length;
    this._permutation = this.generatePermutation();
    this._inverse = this.generateInverse();
  }

  /**
   * Get the forward permutation array
   */
  get permutation(): number[] {
    return this._permutation;
  }

  /**
   * Get the inverse permutation array
   */
  get inverse(): number[] {
    return this._inverse;
  }

  /**
   * Apply the forward permutation to an array
   */
  public permute<T>(array: T[]): T[] {
    if (array.length !== this._length) {
      throw new Error(
        `Array length ${array.length} does not match permutation length ${this._length}`
      );
    }
    const result = new Array<T>(this._length);
    for (let i = 0; i < this._length; i++) {
      result[i] = array[this._permutation[i]];
    }
    return result;
  }

  /**
   * Apply the inverse permutation to an array (unpermute)
   */
  public unpermute<T>(array: T[]): T[] {
    if (array.length !== this._length) {
      throw new Error(
        `Array length ${array.length} does not match permutation length ${this._length}`
      );
    }
    const result = new Array<T>(this._length);
    for (let i = 0; i < this._length; i++) {
      result[i] = array[this._inverse[i]];
    }
    return result;
  }

  /**
   * Generate a deterministic permutation using Fisher-Yates shuffle with seeded RNG
   */
  private generatePermutation(): number[] {
    const rng = this.seededRNG(stringToInt(this._seed));
    const permutation = Array.from({ length: this._length }, (_, i) => i);

    // Fisher-Yates shuffle
    for (let i = permutation.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
    }

    return permutation;
  }

  /**
   * Generate the inverse permutation
   */
  private generateInverse(): number[] {
    const inverse = new Array<number>(this._length);
    for (let i = 0; i < this._length; i++) {
      inverse[this._permutation[i]] = i;
    }
    return inverse;
  }

  /**
   * Simple seeded RNG function (Linear Congruential Generator)
   */
  private seededRNG(seed: number): () => number {
    let state = seed % 2147483647;
    if (state <= 0) state += 2147483646;

    return function () {
      state = (state * 16807) % 2147483647;
      return (state - 1) / 2147483646;
    };
  }
}

/**
 * Convert a string to a deterministic integer hash
 */
function stringToInt(string: string): number {
  let hash = 5381;
  for (let i = 0; i < string.length; i++) {
    hash = (hash * 33) ^ string.charCodeAt(i);
  }
  return hash >>> 0;
}
