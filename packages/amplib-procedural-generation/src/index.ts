interface RandomEngineParams {
  seed: string;
  size: number;
}

export interface TimecodeSeedResponse {
  code: string;
  expiry: number;
  position: number;
}

export class RandomEngine {
  core: RandomEngineCore;
  generation = 0;
  values: number[] = [];
  seed: string;
  size: number;

  constructor({ seed, size }: RandomEngineParams) {
    this.seed = seed;
    this.size = size;
    this.core = this.updatedCore();
    this.step(0);
  }

  step(direction = 1) {
    this.generation += direction;
    this.core = this.updatedCore();
    this.values.splice(0, this.values.length);
    for (let i = 0; i < this.size; i++) {
      this.values.push(this.core.random());
    }
  }

  to(generation = 0) {
    this.generation = generation;
    // Do not increment generation
    this.step(0);
  }

  static timecodeGenerator({
    seed,
    size,
    seconds,
  }: {
    seed: string;
    size: number;
    seconds: number;
  }) {
    const engine = new RandomEngine({ seed, size });
    const milliseconds = seconds * 1000;
    const memo: { [position: string]: string } = {};
    // https://www.crockford.com/base32.html
    const chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    return function generator(): TimecodeSeedResponse {
      const currentTime = Date.now();
      const position = Math.floor(currentTime / milliseconds) * milliseconds;
      if (memo[position]) {
        return {
          code: memo[position],
          expiry: position + milliseconds - currentTime,
          position,
        };
      }
      engine.to(position);
      const code = engine.values
        .map((a) => chars.charAt(Math.floor(a * chars.length)))
        .join("");
      memo[position] = code;
      const expiry = position + milliseconds - currentTime;
      return { code, expiry, position };
    };
  }

  private updatedCore() {
    return new RandomEngineCore(`${this.seed}-${this.generation}`);
  }
}

// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript
class RandomEngineCore {
  random: () => number;
  seed: string;

  constructor(seed = "") {
    this.seed = seed;
    const seedingFunction = this.xmur3(seed);
    this.random = this.sfc32(
      seedingFunction(),
      seedingFunction(),
      seedingFunction(),
      seedingFunction()
    );
  }

  private xmur3(str) {
    for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++)
      (h = Math.imul(h ^ str.charCodeAt(i), 3432918353)),
        (h = (h << 13) | (h >>> 19));
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  private sfc32(a, b, c, d) {
    return function () {
      a >>>= 0;
      b >>>= 0;
      c >>>= 0;
      d >>>= 0;
      var t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }
}
