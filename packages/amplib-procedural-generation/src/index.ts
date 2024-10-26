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
  private _perlinCores: RandomEngineCorePerlin[] = [];
  private _position = 0;
  private _seed: string;
  private _size: number;

  constructor({ seed, size }: RandomEngineParams) {
    this.setSeed(seed);
    this.setSize(size);
    this.setPerlinCores();
    this.random(0);
  }

  get position() {
    return this._position;
  }

  perlin(x = 0, y = 0, z = 0) {
    if (this._perlinCores.length !== this._size) {
      this.setPerlinCores();
    }
    return this._perlinCores.map((core) => core.random(x, y, z));
  }

  random(direction = 1) {
    this._position += direction;
    const core = new RandomEngineCoreSFC(`${this._seed}-${this._position}`);
    const values: number[] = [];
    for (let i = 0; i < this._size; i++) {
      values.push(core.random());
    }
    return values;
  }

  move(position: number) {
    this._position = position;
    return this.random(0);
  }

  setSeed(seed: string) {
    this._seed = seed;
    return this.random(0);
  }

  setSize(size: number) {
    this._size = size;
    return this.random(0);
  }

  static timecodeGenerator({
    length,
    seconds,
    seed,
  }: {
    length: number;
    seed: string;
    seconds: number;
  }) {
    const engine = new RandomEngine({ seed, size: length });
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
      const code = engine
        .move(position)
        .map((a) => chars.charAt(Math.floor(a * chars.length)))
        .join("");
      memo[position] = code;
      const expiry = position + milliseconds - currentTime;
      return { code, expiry, position };
    };
  }

  private setPerlinCores() {
    this._perlinCores.splice(0, this._perlinCores.length);
    for (let i = 0; i < this._size; i++) {
      const core = new RandomEngineCorePerlin(`${this._seed}-${i}`);
      this._perlinCores.push(core);
    }
  }
}

// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript
class RandomEngineCoreSFC {
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

class RandomEngineCorePerlin {
  seed: string;
  private permutation: number[];
  private p: number[];

  constructor(seed: string) {
    this.seed = seed;
    this.permutation = this.generatePermutation();
    this.p = new Array(512);

    // Duplicate the permutation array to avoid overflow
    for (let i = 0; i < 512; i++) {
      this.p[i] = this.permutation[i % 256];
    }
  }

  public random(x: number = 0, y: number = 0, z: number = 0): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);

    const A = this.p[X] + Y;
    const AA = this.p[A] + Z;
    const AB = this.p[A + 1] + Z;
    const B = this.p[X + 1] + Y;
    const BA = this.p[B] + Z;
    const BB = this.p[B + 1] + Z;

    return this.lerp(
      w,
      this.lerp(
        v,
        this.lerp(
          u,
          this.grad(this.p[AA], x, y, z),
          this.grad(this.p[BA], x - 1, y, z)
        ),
        this.lerp(
          u,
          this.grad(this.p[AB], x, y - 1, z),
          this.grad(this.p[BB], x - 1, y - 1, z)
        )
      ),
      this.lerp(
        v,
        this.lerp(
          u,
          this.grad(this.p[AA + 1], x, y, z - 1),
          this.grad(this.p[BA + 1], x - 1, y, z - 1)
        ),
        this.lerp(
          u,
          this.grad(this.p[AB + 1], x, y - 1, z - 1),
          this.grad(this.p[BB + 1], x - 1, y - 1, z - 1)
        )
      )
    );
  }

  private generatePermutation(): number[] {
    const rng = this.seededRNG(stringToInt(this.seed));
    const permutation = Array.from({ length: 256 }, (_, i) => i);

    for (let i = permutation.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
    }

    return permutation;
  }

  // Simple seeded RNG function (Linear Congruential Generator)
  private seededRNG(seed: number): () => number {
    let state = seed % 2147483647;
    if (state <= 0) state += 2147483646;

    return function () {
      state = (state * 16807) % 2147483647;
      return (state - 1) / 2147483646;
    };
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
}

function stringToInt(string: string) {
  let hash = 5381;
  for (let i = 0; i < string.length; i++) {
    hash = (hash * 33) ^ string.charCodeAt(i); // XOR operation
  }
  return hash >>> 0; // Convert to an unsigned 32-bit integer
}
