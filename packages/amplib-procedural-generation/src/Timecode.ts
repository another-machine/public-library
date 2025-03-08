import { RandomEngine } from "./RandomEngine";

// https://www.crockford.com/base32.html
const chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export interface TimecodeResponse {
  code: string;
  expiry: number;
  position: number;
}

export class Timecode {
  milliseconds: number;
  engine: RandomEngine;
  memo: { [position: string]: string } = {};

  constructor({
    length,
    seconds,
    seed,
  }: {
    length: number;
    seed: string;
    seconds: number;
  }) {
    this.engine = new RandomEngine({ seed, size: length });

    this.milliseconds = seconds * 1000;
  }

  generate(time = Date.now()): TimecodeResponse {
    const position = Math.floor(time / this.milliseconds) * this.milliseconds;
    if (this.memo[position]) {
      return {
        code: this.memo[position],
        expiry: position + this.milliseconds - time,
        position,
      };
    }
    const code = this.engine
      .move(position)
      .map((a) => chars.charAt(Math.floor(a * chars.length)))
      .join("");
    this.memo[position] = code;
    const expiry = position + this.milliseconds - time;
    return { code, expiry, position };
  }
}
