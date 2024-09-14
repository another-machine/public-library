import { getTransport, start, getContext } from "tone";

export type ClockTickHandler = (time: number, position: number) => void;

export interface ClockParams {
  tempo: number;
  swing?: number;
}

export class Clock {
  lockedOff = false;
  position = 0;
  time: number = 0;

  constructor({
    tempo,
    swing,
    onTick,
  }: {
    onTick: ClockTickHandler;
  } & ClockParams) {
    this.setRate(tempo);
    if (swing !== undefined) this.setSwing(swing);
    getTransport().scheduleRepeat((time) => {
      this.time = time;
      if (!this.lockedOff) {
        onTick(this.position++, time);
      }
    }, "16n");
  }

  get state() {
    return getTransport().state;
  }

  exportParams(): ClockParams {
    return {
      tempo: this.getRate(),
      swing: this.getSwing(),
    };
  }

  setRate(bpm: number) {
    getTransport().bpm.value = bpm;
  }

  getRate() {
    return getTransport().bpm.value;
  }

  setSwing(swing: number) {
    getTransport().swing = swing;
  }

  getSwing() {
    return getTransport().swing;
  }

  pause() {
    if (this.state === "started") {
      getTransport().pause();
    }
  }

  start() {
    this.lockedOff = false;
    if (getContext().state === "suspended") {
      start();
    }
    if (this.state !== "started") {
      getTransport().start();
    }
  }

  stop() {
    this.lockedOff = true;
    if (this.state !== "stopped") {
      getTransport().stop();
    }
    this.position = 0;
  }
}
