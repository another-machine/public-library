import { DrumSynth } from "./DrumSynth";
import { PATTERNS, type PatternName } from "./drumPatterns";

/** Seconds of hits to schedule ahead of the audio clock. */
const LOOKAHEAD = 0.1;
/** Milliseconds between scheduler wake-ups. */
const INTERVAL = 25;

export interface DrumMachineParams {
  drumSynth: DrumSynth;
  bpm?: number;
  pattern?: PatternName;
}

export interface DrumStep {
  /** Step index within the current pattern. */
  index: number;
  /** AudioContext time this step plays at. Pass it straight to a voice. */
  time: number;
  /** Seconds per step at the current tempo — one sixteenth. */
  stepLength: number;
  pattern: PatternName;
}

export type DrumStepListener = (step: DrumStep) => void;

/**
 * A lookahead scheduler driving DrumSynth.
 *
 * This is the "Tale of Two Clocks" pattern: a setTimeout loop wakes every
 * 25 ms and schedules every hit falling inside a 100 ms window on the audio
 * clock. Timing comes from AudioContext.currentTime, never from the timer, so
 * jitter in setTimeout — and browsers throttle it hard in background tabs —
 * moves when hits get scheduled but not when they play.
 */
export class DrumMachine {
  private readonly synth: DrumSynth;
  private currentBpm: number;
  private patternName: PatternName;
  private step = 0;
  private nextNoteTime = 0;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private taps: number[] = [];
  private stepListeners: DrumStepListener[] = [];

  constructor({ drumSynth, bpm = 85, pattern = "rock" }: DrumMachineParams) {
    this.synth = drumSynth;
    this.currentBpm = bpm;
    this.patternName = pattern;
  }

  get bpm(): number {
    return this.currentBpm;
  }

  get pattern(): PatternName {
    return this.patternName;
  }

  get running(): boolean {
    return this.timerId !== null;
  }

  start(): void {
    if (this.running) return;
    this.step = 0;
    // 0 is the "not yet anchored" marker; the first tick sets a real time.
    this.nextNoteTime = 0;
    this.tick();
  }

  stop(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  setBpm(bpm: number): void {
    this.currentBpm = Math.max(40, Math.min(180, bpm));
  }

  setPattern(name: PatternName): void {
    if (!(name in PATTERNS) || name === this.patternName) return;
    this.patternName = name;
    // Restart the loop rather than carrying the old step index into a pattern
    // that may be a different length.
    this.step = 0;
  }

  /**
   * Subscribe to steps as they are scheduled. Returns an unsubscribe function.
   *
   * Listeners fire during the lookahead pass, so `time` is up to 100 ms in the
   * future — that is the point. Anything that wants to play in time with the
   * drums should schedule against that value rather than playing immediately,
   * because "immediately" is the wall clock and the drums are on the audio
   * clock. The two drift, and the drift is audible.
   */
  onStep(listener: DrumStepListener): () => void {
    this.stepListeners.push(listener);
    return () => {
      const index = this.stepListeners.indexOf(listener);
      if (index >= 0) this.stepListeners.splice(index, 1);
    };
  }

  /**
   * Tap tempo. Averages the gaps between the last four taps; a gap over two
   * seconds is treated as the start of a new attempt rather than a very slow
   * tempo.
   */
  tap(): void {
    const now = performance.now();
    const last = this.taps[this.taps.length - 1];
    if (last !== undefined && now - last > 2000) this.taps = [];
    this.taps.push(now);
    if (this.taps.length > 4) this.taps.shift();
    if (this.taps.length < 2) return;

    let total = 0;
    for (let i = 1; i < this.taps.length; i++) {
      total += this.taps[i] - this.taps[i - 1];
    }
    const averageMs = total / (this.taps.length - 1);
    this.currentBpm = Math.round(
      Math.max(40, Math.min(180, 60000 / averageMs))
    );
  }

  private tick(): void {
    const { audioContext } = this.synth;

    if (this.nextNoteTime === 0) {
      this.nextNoteTime = audioContext.currentTime + 0.05;
    }

    const pattern = PATTERNS[this.patternName];
    const stepLength = 60 / this.currentBpm / 4; // one sixteenth

    while (this.nextNoteTime < audioContext.currentTime + LOOKAHEAD) {
      const index = this.step % pattern.steps;
      const time = this.nextNoteTime;

      if (pattern.kick[index] > 0)
        this.synth.kick(time, pattern.kick[index]);
      if (pattern.snare[index] > 0)
        this.synth.snare(time, pattern.snare[index]);
      if (pattern.hihatC[index] > 0)
        this.synth.hihatClosed(time, pattern.hihatC[index]);
      if (pattern.hihatO[index] > 0)
        this.synth.hihatOpen(time, pattern.hihatO[index]);
      if (pattern.rim[index] > 0) this.synth.rim(time, pattern.rim[index]);

      for (const listener of this.stepListeners) {
        listener({
          index,
          time,
          stepLength,
          pattern: this.patternName,
        });
      }

      this.nextNoteTime += stepLength;
      this.step = (this.step + 1) % pattern.steps;
    }

    this.timerId = setTimeout(() => this.tick(), INTERVAL);
  }
}
