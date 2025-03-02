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
   * Analyze an audio buffer to estimate BPM
   * @param buffer AudioBuffer to analyze
   * @returns Promise resolving to the estimated BPM
   */
  async analyzeBPM(buffer: AudioBuffer): Promise<number> {
    try {
      // Create an offline audio context for analysis
      const offlineCtx = new OfflineAudioContext(
        buffer.numberOfChannels,
        buffer.length,
        buffer.sampleRate
      );

      // Create buffer source
      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;

      // Create analyzer
      const analyser = offlineCtx.createAnalyser();
      analyser.fftSize = this.analyser.fftSize;

      // Connect
      source.connect(analyser);
      analyser.connect(offlineCtx.destination);

      // Start
      source.start(0);

      // Render buffer
      const renderedBuffer = await offlineCtx.startRendering();

      // Process the rendered buffer for BPM detection
      const peaks = this.findPeaks(renderedBuffer);
      const intervals = this.getIntervals(peaks, renderedBuffer.sampleRate);

      return this.calculateBPM(intervals);
    } catch (e) {
      console.error("Error analyzing BPM:", e);
      return 0;
    }
  }

  /**
   * Find peaks in audio data that likely represent beats
   * @param buffer Rendered audio buffer
   * @returns Array of sample indices where peaks occur
   */
  private findPeaks(buffer: AudioBuffer): number[] {
    const data = buffer.getChannelData(0);
    const peaks: number[] = [];
    const sampleRate = buffer.sampleRate;

    // Calculate minimum distance between peaks (in samples)
    const minPeakDistance = Math.floor((sampleRate * 60) / this.maxBPM / 2);

    let lastPeakIndex = -minPeakDistance;
    const threshold = this.calculateDynamicThreshold(data);

    // Process in chunks to handle large files efficiently
    const chunkSize = 16384;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunkEnd = Math.min(i + chunkSize, data.length);

      // Find local maxima in this chunk
      for (let j = i; j < chunkEnd; j++) {
        if (data[j] > threshold && j - lastPeakIndex >= minPeakDistance) {
          // Check if this is a local maximum
          if (j > 0 && j < data.length - 1) {
            if (data[j] > data[j - 1] && data[j] >= data[j + 1]) {
              peaks.push(j);
              lastPeakIndex = j;
            }
          }
        }
      }
    }

    return peaks;
  }

  /**
   * Calculate a dynamic threshold based on the audio data
   * @param data Audio data
   * @returns Threshold value
   */
  private calculateDynamicThreshold(data: Float32Array): number {
    // Take a sample of the data for efficiency
    const sampleSize = Math.min(10000, data.length);
    const step = Math.floor(data.length / sampleSize);

    let sum = 0;
    let max = 0;

    for (let i = 0; i < data.length; i += step) {
      const absValue = Math.abs(data[i]);
      sum += absValue;
      max = Math.max(max, absValue);
    }

    const avgAmplitude = sum / (data.length / step);

    // Dynamic threshold is between the average and max amplitude
    return avgAmplitude + (max - avgAmplitude) * this.threshold;
  }

  /**
   * Convert peak indices to time intervals
   * @param peaks Array of sample indices where peaks occur
   * @param sampleRate Sample rate of the audio
   * @returns Array of time intervals between consecutive peaks
   */
  private getIntervals(peaks: number[], sampleRate: number): number[] {
    const intervals: number[] = [];

    for (let i = 1; i < peaks.length; i++) {
      const interval = (peaks[i] - peaks[i - 1]) / sampleRate;
      intervals.push(interval);
    }

    return intervals;
  }

  /**
   * Get the current BPM value
   * @returns Current BPM
   */
  getBPM(): number {
    return this.currentBPM;
  }
}
