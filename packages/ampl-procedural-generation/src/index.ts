interface RandomEngineParams {
  memory: number;
  seed: string;
  size: number;
}

export class RandomEngine {
  core: RandomEngineCore;
  generation = 0;
  history: number[][];
  memory: number;
  seed: string;
  size: number;

  constructor({ seed, size, memory }: RandomEngineParams) {
    this.history = [];
    this.memory = memory;
    this.seed = seed;
    this.size = size;
    this.core = this.freshCore();
  }

  freshCore() {
    return new RandomEngineCore(`${this.seed}-${this.generation}`);
  }

  generate() {
    const result: number[] = [];
    for (let i = 0; i < this.size; i++) {
      result.push(this.core.random());
    }
    if (this.memory) {
      while (this.history.length >= this.memory) {
        this.history.shift();
      }
      this.history.push(result);
    }
    this.generation++;
    this.core = this.freshCore();
  }

  values() {
    return this.history[this.history.length - 1];
  }

  to(generation = 0) {
    this.generation = generation;
    this.core = this.freshCore();
  }
}

// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript
export class RandomEngineCore {
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
