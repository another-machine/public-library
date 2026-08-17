/** MSB-first bit reader/writer over a byte buffer. */

export class BitWriter {
  private bytes: number[] = [];
  private cur = 0;
  private n = 0;

  write(value: number, width: number): void {
    for (let i = width - 1; i >= 0; i--) this.writeBit((value >>> i) & 1);
  }

  writeBit(b: number): void {
    this.cur = (this.cur << 1) | (b & 1);
    if (++this.n === 8) {
      this.bytes.push(this.cur);
      this.cur = 0;
      this.n = 0;
    }
  }

  /** Flushes a partial trailing byte with zero padding. */
  finish(): Uint8Array {
    if (this.n) {
      this.bytes.push(this.cur << (8 - this.n));
      this.cur = 0;
      this.n = 0;
    }
    return Uint8Array.from(this.bytes);
  }

  get bitLength(): number {
    return this.bytes.length * 8 + this.n;
  }
}

export class BitReader {
  private i = 0;

  constructor(private readonly data: Uint8Array) {}

  readBit(): number {
    const byte = this.data[this.i >> 3] ?? 0;
    const bit = (byte >>> (7 - (this.i & 7))) & 1;
    this.i++;
    return bit;
  }

  read(width: number): number {
    let v = 0;
    for (let i = 0; i < width; i++) v = (v << 1) | this.readBit();
    return v >>> 0;
  }

  get remaining(): number {
    return this.data.length * 8 - this.i;
  }
}

/** Unpack every bit of `bytes`, MSB first. */
export function toBits(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++)
    for (let b = 0; b < 8; b++) out[i * 8 + b] = (bytes[i] >>> (7 - b)) & 1;
  return out;
}

/** Inverse of `toBits`; a partial trailing byte is zero-padded. */
export function fromBits(bits: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++)
    if (bits[i]) out[i >> 3] |= 1 << (7 - (i & 7));
  return out;
}
