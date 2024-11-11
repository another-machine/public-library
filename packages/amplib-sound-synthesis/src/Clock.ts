import { worker } from "./clock-worker";

type BeatCallback = (info: { timestamp: number; beatIndex: number }) => void;

type ClockOptions = {
  bpm?: number;
  swing?: number;
  subdivision?: number;
};

export class Clock {
  private worker: Worker;
  private started: boolean;
  private swing: number;
  private callbacks: Set<BeatCallback>;
  public subdivision: number;
  public bpm: number;

  constructor(options: ClockOptions = {}) {
    this.callbacks = new Set();
    this.bpm = options.bpm || 120;
    this.started = false;

    this.worker = new Worker(
      URL.createObjectURL(
        new Blob([worker], { type: "application/javascript" })
      )
    );

    this.worker.onmessage = (e) => {
      if (e.data.type === "tick") {
        this.callbacks.forEach((callback) => callback(e.data));
      }
    };

    this.setResolution(options.swing || 0, options.subdivision || 8);
  }

  public onBeat(callback: BeatCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  public start(): void {
    if (this.started) return;
    this.started = true;
    this.bpm = this.bpm;

    this.worker.postMessage({
      command: "start",
      bpm: this.bpm,
      swing: this.swing,
      subdivision: this.subdivision,
    });
  }

  public stop(): void {
    if (!this.started) return;
    this.started = false;
    this.worker.postMessage({ command: "stop" });
  }

  public setBPM(bpm: number): void {
    this.bpm = bpm;
    this.worker.postMessage({ command: "set-bpm", bpm });
  }

  public setResolution(swing: number, subdivision?: number): void {
    this.swing = swing;
    if (subdivision !== undefined) {
      this.subdivision = subdivision;
    }

    this.worker.postMessage({
      command: "set-swing",
      swing: this.swing,
      subdivision: this.subdivision,
    });
  }

  public dispose(): void {
    this.stop();
    this.worker.terminate();
    this.callbacks.clear();
  }
}
