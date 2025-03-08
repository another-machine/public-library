/**
 * A sine wave component with amplitude and relative frequency
 */
interface WaveComponent {
  amplitude: number;
  relativeFrequency: number;
}

interface HarmonicSuperpositionConfig {
  /*
   * Base frequency in Hz (cycles per time unit)
   */
  baseFrequency: number;
  /*
   * Array of wave components
   */
  components: WaveComponent[];
  /*
   * Threshold for triggering events
   */
  threshold: number;
  /*
   * Optional callback for threshold crossing
   */
  onThresholdCrossed?: (time: number, value: number) => void;
}

/**
 * Class for creating and managing harmonic superpositions of sine waves
 * with threshold detection for triggering events
 */
export class HarmonicSuperposition {
  public config: HarmonicSuperpositionConfig;
  private lastWasAboveThreshold: boolean = false;

  /**
   * Creates a new harmonic superposition instance
   *
   * @param config Configuration for the harmonic superposition
   */
  constructor(config: HarmonicSuperpositionConfig) {
    this.config = {
      ...config,
      onThresholdCrossed: config.onThresholdCrossed || ((time, value) => {}),
    };
  }

  /**
   * Calculates the wave value at a given time and triggers events if threshold is crossed
   *
   * @param time The time at which to calculate the wave value
   * @returns The calculated wave value
   */
  public calculate(time: number): number {
    // Calculate the sum of all sine components
    const value = this.config.components.reduce((sum, component) => {
      const frequency = this.config.baseFrequency * component.relativeFrequency;
      return (
        sum + component.amplitude * Math.sin(2 * Math.PI * frequency * time)
      );
    }, 0);

    // Check if we've crossed the threshold (only trigger on rising edge)
    const isAboveThreshold = value >= this.config.threshold;
    if (
      isAboveThreshold &&
      !this.lastWasAboveThreshold &&
      this.config.onThresholdCrossed
    ) {
      this.config.onThresholdCrossed(time, value);
    }
    this.lastWasAboveThreshold = isAboveThreshold;

    return value;
  }

  /**
   * Updates the configuration for this harmonic superposition
   *
   * @param config New configuration (partial or complete)
   */
  public updateConfig(config: Partial<HarmonicSuperpositionConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      components: config.components || this.config.components,
    };
  }

  /**
   * Simulates the harmonic superposition over a time period
   *
   * @param startTime Start time for simulation
   * @param endTime End time for simulation
   * @param timeStep Step size for time increments
   * @returns Array of simulation results (time and value pairs)
   */
  public simulate(
    startTime: number,
    endTime: number,
    timeStep: number
  ): Array<{ time: number; value: number }> {
    const results: Array<{ time: number; value: number }> = [];

    for (let t = startTime; t <= endTime; t += timeStep) {
      const value = this.calculate(t);
      results.push({ time: t, value });
    }

    return results;
  }

  /**
   * Creates a default harmonic superposition based on the formula:
   * f(t) = sin(ωt) + 0.5sin(2.7ωt) + 0.3sin(4.1ωt)
   *
   * @param baseFrequency Base frequency in Hz
   * @param threshold Threshold for triggering events (default: 1.5)
   * @param callback Callback function for threshold crossing events
   * @returns A new HarmonicSuperposition instance
   */
  public static createDefault(
    // baseFrequency: number = 0.00029,
    baseFrequency: number = 0.003,
    threshold: number = 1.5,
    callback?: (time: number, value: number) => void
  ): HarmonicSuperposition {
    return new HarmonicSuperposition({
      baseFrequency,
      components: [
        { amplitude: 1.0, relativeFrequency: 1.0 }, // sin(ωt)
        { amplitude: 0.5, relativeFrequency: 2.7 }, // 0.5sin(2.7ωt)
        { amplitude: 0.3, relativeFrequency: 4.1 }, // 0.3sin(4.1ωt)
      ],
      threshold,
      onThresholdCrossed: callback,
    });
  }

  /**
   * Utility function to tune the parameters to achieve desired event frequency
   *
   * @param desiredEventsPerHour Desired number of events per hour
   * @param simulationHours Hours to simulate for tuning (default: 24)
   * @param callback Callback function for threshold crossing events
   * @returns A new HarmonicSuperposition instance with tuned parameters
   */
  public static tuneForEventsPerHour({
    desiredEventsPerHour,
    simulationHours = 24,
    onThresholdCrossed,
  }: {
    desiredEventsPerHour: number;
    simulationHours: number;
    onThresholdCrossed?: (time: number, value: number) => void;
  }): HarmonicSuperposition {
    // Start with a reasonable base frequency and adjust
    let baseFrequency = 0.0003; // Initial guess

    const components = [
      { amplitude: 1.0, relativeFrequency: 1.0 },
      { amplitude: 0.5, relativeFrequency: 2.7 },
      { amplitude: 0.3, relativeFrequency: 4.1 },
    ];

    const threshold = 1.5;

    // Perform binary search to find appropriate base frequency
    let minFreq = 0.0001;
    let maxFreq = 0.001;

    // 10 iterations should be enough
    // TODO: verify this
    for (let i = 0; i < 10; i++) {
      baseFrequency = (minFreq + maxFreq) / 2;

      let eventCount = 0;
      const harmonicSuperposition = new HarmonicSuperposition({
        baseFrequency,
        components,
        threshold,
        onThresholdCrossed: () => eventCount++,
      });

      // Simulate
      harmonicSuperposition.simulate(0, simulationHours, 1 / 60);

      const actualEventsPerHour = eventCount / simulationHours;

      // Detecting if we're close enough
      if (Math.abs(actualEventsPerHour - desiredEventsPerHour) < 0.1) {
        break;
      }

      if (actualEventsPerHour > desiredEventsPerHour) {
        maxFreq = baseFrequency;
      } else {
        minFreq = baseFrequency;
      }
    }

    return new HarmonicSuperposition({
      baseFrequency,
      components,
      threshold,
      onThresholdCrossed,
    });
  }
}
