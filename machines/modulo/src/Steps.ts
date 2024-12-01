export type StepsSlot = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface StepsParams {
  size: number;
  max: StepsSlot;
  rows: StepsSlot[][];
}

class StepsRow {
  slots: StepsSlot[] = [];
  max: StepsSlot;
  _nextArray: StepsSlot[] = [];

  static loadRow(slots: StepsSlot[], max: StepsSlot) {
    const row = new StepsRow(0, max);
    row.slots = slots;
    return row;
  }

  static saveRow(row: StepsRow) {
    return { slots: row.slots, max: row.max };
  }

  constructor(size: number, max: StepsSlot) {
    this.max = max;
    for (let i = 0; i < size; i++) {
      this.slots.push(0);
    }
  }

  get nextArray() {
    if (this._nextArray.length) {
      return this._nextArray;
    }
    this._nextArray = [];
    let i = 1;
    while (i <= this.max) {
      this._nextArray.push(i as StepsSlot);
      i++;
    }
    this._nextArray.push(0);
    return this._nextArray;
  }

  set(number: number) {
    if (this.slots.length >= number) {
      this.slots.splice(number);
    } else {
      while (this.slots.length < number) {
        this.grow();
      }
    }
  }

  grow() {
    this.slots.push(0);
  }

  tap(index: number) {
    this.slots[index] = this.nextArray[this.slots[index]];
  }

  shrink() {
    if (this.slots.length > 1) {
      this.slots.splice(this.slots.length - 1, 1);
    }
  }
}

export class Steps {
  rows: StepsRow[] = [];
  max: StepsSlot;

  static loadStepsObject(rows: { slots: StepsSlot[]; max: StepsSlot }[]) {
    const step = new Steps({ size: 0, rows: 0, max: rows[0].max });
    step.rows = rows.map((row) => StepsRow.loadRow(row.slots, row.max));
    return step;
  }

  static loadStepsString(rowsString: string) {
    const rows: { slots: StepsSlot[]; max: StepsSlot }[] =
      JSON.parse(rowsString);
    return Steps.loadStepsObject(rows);
  }

  static saveStepsString(step: Steps) {
    const stepArray = step.rows.map((row) => StepsRow.saveRow(row));
    return JSON.stringify(stepArray);
  }

  constructor({
    size,
    rows,
    max,
  }: {
    size: number;
    rows: number | StepsSlot[][];
    max: StepsSlot;
  }) {
    this.max = max;
    if (Array.isArray(rows)) {
      this.rows = rows.map((row) => StepsRow.loadRow(row, max));
    } else {
      for (let i = 0; i < rows; i++) {
        this.rows.push(new StepsRow(size, max));
      }
    }
  }

  get size() {
    return this.rows[0]?.slots.length || 0;
  }

  exportParams(): StepsParams {
    return {
      size: this.size,
      max: this.max,
      rows: this.rows.map((row) => row.slots),
    };
  }

  randomValue(): StepsSlot {
    return Math.ceil(Math.random() * this.max) as StepsSlot;
  }

  randomize(chance = 0.25) {
    this.rows.forEach((row) => {
      for (let i = 0; i < row.slots.length; i++) {
        row.slots[i] = 0;
        const random = Math.random();
        if (random < chance) {
          row.slots[i] = this.randomValue();
        }
      }
    });
  }

  tap(row: number, column: number) {
    this.rows[row].tap(column);
  }

  set(number: number) {
    this.rows.forEach((row) => row.set(number));
  }

  double() {
    this.rows.forEach(
      (row) => (row.slots = [...row.slots, ...row.slots].splice(0, 64))
    );
  }

  halve() {
    this.rows.forEach(
      (row) =>
        (row.slots = row.slots.splice(0, Math.ceil(row.slots.length * 0.5)))
    );
  }

  third() {
    this.rows.forEach(
      (row) =>
        (row.slots = row.slots.splice(0, Math.ceil(row.slots.length * 0.3333)))
    );
  }

  grow() {
    this.rows.forEach((row) => row.grow());
  }

  shrink() {
    this.rows.forEach((row) => row.shrink());
  }

  values(index: number) {
    return this.rows.map((row) => row.slots[index % this.size]);
  }
}
