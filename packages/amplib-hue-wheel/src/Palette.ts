import { fromPerceptual, toPerceptual } from "./huePerception";
import { parseSlotList } from "./parseSlotList";

export interface PaletteSlot<T> {
  /** Position in the slot array. */
  index: number;
  /** Whatever this slot stands for. The wheel never inspects it. */
  value: T;
}

export interface HueSlotResult<T> {
  slot: PaletteSlot<T>;
  /** Position within the slot's sector, 0 at its start and 1 at its end. */
  t: number;
}

export interface HueBlendResult<T> {
  slot: PaletteSlot<T>;
  weight: number;
}

export interface PaletteParams<T> {
  /**
   * One entry per sector, in order around the wheel. Every sector is the same
   * width, so a value is weighted by repeating it.
   */
  slots: T[];
  /** Rotates the whole wheel. In perceptual degrees. */
  rootHue?: number;
  /** Fraction of a sector at each edge that blends into its neighbour. */
  crossZone?: number;
}

/**
 * A hue wheel divided into equal sectors, so that any hue names a slot and any
 * slot names a hue.
 *
 * Weight is repetition, not a number. `["g1", "g2", "g2", "g3"]` gives g2 twice
 * the arc of its neighbours because it is written twice, and the list reads as
 * the wheel it describes rather than as a set of multipliers to work out. It
 * also makes something a bias field could not express: a value can appear at
 * more than one place on the wheel. In `["g1", "g2", "g2", "g1", "g3"]` the two
 * g1 sectors are separated by g2, so g1 is reachable from two different regions
 * of colour without being one continuous band.
 *
 * Slots carry whatever you put in them — a chord, a word list, a sample. `T` is
 * opaque on purpose: deciding what a hue *means* belongs to the consuming
 * application, and baking one meaning in here would rule the others out.
 *
 * Sector boundaries are computed in perceptual hue space, not display hue, so
 * equal sectors take arcs that *look* equal rather than arcs that are equal in
 * HSV and visibly lopsided.
 */
export class Palette<T = string> {
  rootHue: number;

  private slotList: PaletteSlot<T>[];
  private crossZone: number;
  private listeners: Array<(palette: Palette<T>) => void> = [];

  private cachedSlotHues: Float32Array | null = null;
  private cachedBoundaryHues: Float32Array | null = null;

  constructor({ slots, rootHue = 0, crossZone = 0.15 }: PaletteParams<T>) {
    if (!slots || slots.length < 1) {
      throw new Error("Palette requires at least one slot.");
    }
    this.slotList = slots.map((value, index) => ({ index, value }));
    this.rootHue = ((rootHue % 360) + 360) % 360;
    this.crossZone = Math.max(0, Math.min(0.5, crossZone));
  }

  private invalidateCache(): void {
    this.cachedSlotHues = null;
    this.cachedBoundaryHues = null;
  }

  /** Degrees of perceptual hue per sector. */
  private get sectorWidth(): number {
    return 360 / this.slotList.length;
  }

  /** Which slot a display hue lands in, and where inside its sector. */
  hueToSlot(displayHue: number): HueSlotResult<T> {
    const count = this.slotList.length;
    const perceptual =
      (((toPerceptual(displayHue) - this.rootHue) % 360) + 360) % 360;
    const width = this.sectorWidth;
    const position = perceptual / width;
    // Guard the top of the range: a hue landing exactly on 360 would index one
    // past the end.
    const index = Math.min(count - 1, Math.floor(position));
    return { slot: this.slotList[index], t: position - index };
  }

  /**
   * The same lookup, but blended across a sector boundary.
   *
   * Without this a hue drifting past a boundary would switch slots instantly.
   * The weight tops out at 0.5 rather than 1, so a slot never loses its
   * majority to a neighbour — at the boundary itself the two are equal and the
   * transition has no discontinuity.
   *
   * Repeated adjacent values are one continuous band, so no blending happens
   * between them. Crossfading a value with itself would return the same thing
   * twice at half weight each, which reads downstream as a two-slot mix when
   * nothing is actually changing.
   */
  hueToBlend(displayHue: number): HueBlendResult<T>[] {
    const count = this.slotList.length;
    if (count === 1) return [{ slot: this.slotList[0], weight: 1 }];

    const { slot, t } = this.hueToSlot(displayHue);
    const index = slot.index;

    const blendWith = (neighbourIndex: number, weight: number) => {
      const neighbour = this.slotList[neighbourIndex];
      if (neighbour.value === slot.value) {
        return [{ slot, weight: 1 }];
      }
      return [
        { slot, weight: 1 - weight },
        { slot: neighbour, weight },
      ];
    };

    if (t < this.crossZone) {
      return blendWith(
        (index - 1 + count) % count,
        ((this.crossZone - t) / this.crossZone) * 0.5
      );
    }
    if (t > 1 - this.crossZone) {
      return blendWith(
        (index + 1) % count,
        ((t - (1 - this.crossZone)) / this.crossZone) * 0.5
      );
    }
    return [{ slot, weight: 1 }];
  }

  /** The display hue at position `t` within slot `index`. */
  slotToHue(index: number, t = 0.5): number {
    const count = this.slotList.length;
    const wrapped = ((index % count) + count) % count;
    const width = this.sectorWidth;
    const perceptual =
      ((((wrapped + t) * width + this.rootHue) % 360) + 360) % 360;
    return fromPerceptual(perceptual);
  }

  get slots(): PaletteSlot<T>[] {
    return this.slotList;
  }

  /** The values alone, in wheel order. */
  get values(): T[] {
    return this.slotList.map((slot) => slot.value);
  }

  /** The display hue at the centre of each sector. */
  get slotHues(): Float32Array {
    if (!this.cachedSlotHues) {
      this.cachedSlotHues = Float32Array.from(
        { length: this.slotList.length },
        (_, index) => this.slotToHue(index, 0.5)
      );
    }
    return this.cachedSlotHues;
  }

  /** The display hue at every sector boundary, wrapping back to the first. */
  get slotBoundaryHues(): Float32Array {
    if (!this.cachedBoundaryHues) {
      const count = this.slotList.length;
      this.cachedBoundaryHues = Float32Array.from(
        { length: count + 1 },
        (_, index) => this.slotToHue(index === count ? 0 : index, 0)
      );
    }
    return this.cachedBoundaryHues;
  }

  /**
   * Runs of adjacent sectors sharing a value, merged — the bands you would
   * actually draw or label. Wraps, so a run spanning 0° is one band.
   *
   * `["g1","g2","g2","g1","g3"]` gives four bands, not five: the two g2
   * sectors are one double-width band, while the two g1 sectors stay separate
   * because g2 sits between them.
   */
  get bands(): { value: T; indices: number[]; centreHue: number }[] {
    const count = this.slotList.length;
    const values = this.values;
    const allSame = values.every((value) => value === values[0]);

    // Start from a point where the value actually changes, otherwise a band
    // straddling 0° would be reported as two.
    let start = 0;
    if (!allSame) {
      for (let i = 0; i < count; i++) {
        if (values[(i - 1 + count) % count] !== values[i]) {
          start = i;
          break;
        }
      }
    }

    const bands: { value: T; indices: number[]; centreHue: number }[] = [];
    for (let step = 0; step < count; step++) {
      const index = (start + step) % count;
      const previous = bands[bands.length - 1];
      if (previous && previous.value === values[index]) {
        previous.indices.push(index);
      } else {
        bands.push({ value: values[index], indices: [index], centreHue: 0 });
      }
    }

    for (const band of bands) {
      // Walk from the first sector's start to the last sector's end. Using the
      // mean of the sector centres would be wrong for a band crossing 0°.
      const first = band.indices[0];
      const span = band.indices.length;
      band.centreHue = this.slotToHue(first, span / 2);
    }
    return bands;
  }

  setRootHue(hue: number): void {
    this.rootHue = ((hue % 360) + 360) % 360;
    this.invalidateCache();
    this.emit();
  }

  setSlots(slots: T[]): void {
    if (!slots || slots.length < 1) {
      throw new Error("Palette requires at least one slot.");
    }
    this.slotList = slots.map((value, index) => ({ index, value }));
    this.invalidateCache();
    this.emit();
  }

  setCrossZone(crossZone: number): void {
    this.crossZone = Math.max(0, Math.min(0.5, crossZone));
    this.emit();
  }

  /** Subscribe to changes. Returns an unsubscribe function. */
  onChange(listener: (palette: Palette<T>) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this);
  }

  /** Build a Palette of plain string slots from a comma-separated list. */
  static fromString(
    input: string,
    { rootHue = 0, crossZone = 0.15 } = {}
  ): Palette<string> {
    return new Palette<string>({
      slots: parseSlotList(input),
      rootHue,
      crossZone,
    });
  }

  /**
   * A new Palette with the same geometry and every slot's value transformed.
   *
   * This is the seam where domain meaning gets attached — parse strings into
   * chords, resolve names to samples — so the wheel stays generic while the
   * consumer gets a typed palette back.
   *
   * Equal inputs are transformed once and share the result. That is not just
   * an optimisation: `bands` and `hueToBlend` decide what counts as the same
   * slot by identity, so mapping "CEG" twice into two equal-but-separate
   * objects would silently split one band in two and start crossfading a value
   * with itself. `transform` is therefore called once per distinct value, not
   * once per sector.
   */
  map<U>(transform: (value: T, index: number) => U): Palette<U> {
    const memo = new Map<T, U>();
    return new Palette<U>({
      slots: this.slotList.map((slot) => {
        if (memo.has(slot.value)) return memo.get(slot.value)!;
        const mapped = transform(slot.value, slot.index);
        memo.set(slot.value, mapped);
        return mapped;
      }),
      rootHue: this.rootHue,
      crossZone: this.crossZone,
    });
  }
}
