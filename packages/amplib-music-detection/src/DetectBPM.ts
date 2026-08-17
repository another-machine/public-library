import { detectTempo, toMono } from "./analyze";

/**
 * Live beat detection off an `AnalyserNode`: low-band energy crossing a
 * threshold, intervals between crossings, mean interval as tempo. It answers
 * frame by frame while audio is playing, which is the one thing offline
 * analysis cannot do.
 *
 * For a buffer you already hold, `analyzeBPM` defers to `detectTempo`.
 */
export class DetectBPM {
  audioContext: AudioContext;
  analyser: AnalyserNode;
  dataArray: Uint8Array;
  bufferLength: number;
  threshold: number;
  minBPM: number;
  maxBPM: number;
  previousPeakTime: number;
  intervalTimes: number[];
  currentBPM: number;
  isDetecting: boolean;

  constructor({
    audioContext,
    fftSize = 2048,
    threshold = 0.5,
    minBPM = 60,
    maxBPM = 200,
  }: {
    audioContext: AudioContext;
    fftSize?: number;
    threshold?: number;
    minBPM?: number;
    maxBPM?: number;
  }) {
    this.audioContext = audioContext;
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(this.bufferLength);

    this.threshold = threshold;
    this.minBPM = minBPM;
    this.maxBPM = maxBPM;

    this.previousPeakTime = 0;
    this.intervalTimes = [];
    this.currentBPM = 0;
    this.isDetecting = false;
  }

  async initialize(
    source:
      | AudioBufferSourceNode
      | MediaElementAudioSourceNode
      | MediaStreamAudioSourceNode
  ) {
    try {
      source.connect(this.analyser);

      // this.analyser.connect(this.audioContext.destination);
    } catch (e) {
      throw e;
    }
  }

  /**
   * Start real-time BPM detection
   */
  startDetection() {
    this.isDetecting = true;
    this.intervalTimes = [];
    this.previousPeakTime = this.audioContext.currentTime;
  }

  /**
   * Stop real-time BPM detection
   */
  stopDetection() {
    this.isDetecting = false;
  }

  /**
   * Calculate BPM from a set of time intervals
   * @param intervals Array of time intervals between beats
   * @returns Calculated BPM
   */
  private calculateBPM(intervals: number[]): number {
    if (intervals.length === 0) return 0;

    // Filter out outliers for better accuracy
    const validIntervals = intervals.filter((interval) => {
      const bpm = 60 / interval;
      return bpm >= this.minBPM && bpm <= this.maxBPM;
    });

    if (validIntervals.length === 0) return 0;

    // Calculate average interval
    const averageInterval =
      validIntervals.reduce((sum, val) => sum + val, 0) / validIntervals.length;

    // Convert to BPM
    return Math.round(60 / averageInterval);
  }

  /**
   * Check for beats on animation frame
   * Call this method from your requestAnimationFrame loop
   * @returns Current BPM estimation
   */
  detectBeatOnFrame(): number {
    if (!this.isDetecting) return this.currentBPM;

    // Get current frequency data
    this.analyser.getByteFrequencyData(this.dataArray);

    // Calculate energy in the low frequency range (bass frequencies where beats are usually found)
    let energy = 0;
    const lowerBound = 0; // First bin
    const upperBound = Math.min(40, this.bufferLength); // Focus on bass frequencies

    for (let i = lowerBound; i < upperBound; i++) {
      energy += this.dataArray[i];
    }
    energy = energy / (upperBound - lowerBound) / 255; // Normalize

    // Detect peak if energy is above threshold
    const currentTime = this.audioContext.currentTime;
    if (energy > this.threshold) {
      const timeSinceLastPeak = currentTime - this.previousPeakTime;

      // Avoid counting the same beat multiple times
      if (timeSinceLastPeak > 0.2) {
        // 200ms minimum time between beats
        this.intervalTimes.push(timeSinceLastPeak);
        this.previousPeakTime = currentTime;

        // Keep a reasonable history size
        if (this.intervalTimes.length > 20) {
          this.intervalTimes.shift();
        }

        // Update BPM calculation
        this.currentBPM = this.calculateBPM(this.intervalTimes);
      }
    }

    return this.currentBPM;
  }

  /**
   * Estimate the tempo of a buffer you already hold.
   *
   * This used to look for peaks in raw amplitude and average the gaps between
   * them, which finds a kick drum and nothing else: sustained material has no
   * amplitude peaks to find, so it returned 0. It also rendered the buffer
   * through an OfflineAudioContext first, which reproduced the same samples.
   *
   * `detectTempo` autocorrelates an onset envelope instead — "how well does
   * the onset pattern line up with itself this far along" is a question
   * sustained material can answer. Two differences to expect: the result is
   * fractional rather than rounded to a whole bpm, and tempo is
   * octave-ambiguous, so check `alternatives` from `detectTempo` directly if
   * half or double time matters.
   *
   * Still a Promise so existing callers keep working; nothing here awaits.
   */
  async analyzeBPM(buffer: AudioBuffer): Promise<number> {
    const channels: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++)
      channels.push(buffer.getChannelData(c));
    return detectTempo(toMono(channels), buffer.sampleRate, {
      minBPM: this.minBPM,
      maxBPM: this.maxBPM,
    }).bpm;
  }

  /**
   * Get the current BPM value
   * @returns Current BPM
   */
  getBPM(): number {
    return this.currentBPM;
  }
}
