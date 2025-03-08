import { HarmonicSuperposition } from "../../../packages/amplib-procedural-generation/src";

export function exampleHarmonicSuperposition() {
  const timeOutputs = document.querySelectorAll<HTMLElement>(
    '[data-output="hs-time"]'
  )!;
  const harmonicOutput1 = document.querySelector<HTMLElement>(
    '[data-output="hs-1"]'
  )!;
  const harmonicOutput2 = document.querySelector<HTMLElement>(
    '[data-output="hs-2"]'
  )!;
  const harmonic2Config = document.querySelector<HTMLElement>(
    '[data-output="hs-2-config"]'
  )!;
  const generator1 = new HarmonicSuperposition({
    baseFrequency: 0.001,
    threshold: 1.5,
    onThresholdCrossed: (time, value) => {
      harmonicOutput1.innerText = `{
  time: ${time},
  value: ${value}
}`;
    },
    components: [
      { amplitude: 1.0, relativeFrequency: 1.0 },
      { amplitude: 0.5, relativeFrequency: 2.7 },
      { amplitude: 0.3, relativeFrequency: 4.1 },
    ],
  });
  const generator2 = HarmonicSuperposition.tuneForEventsPerHour({
    desiredEventsPerHour: 45,
    simulationHours: 24,
    onThresholdCrossed: (time, value) => {
      harmonicOutput2.innerText = `{
  time: ${time},
  value: ${value}
}`;
    },
  });
  harmonic2Config.innerText = `{
  baseFrequency: ${generator2.config.baseFrequency},
  threshold: ${generator2.config.threshold},
  components: [
${generator2.config.components
  .map(
    (a) =>
      `    { amplitude: ${a.amplitude.toFixed(
        2
      )}, relativeFrequency: ${a.relativeFrequency.toFixed(2)} }`
  )
  .join(",\n")}
  ]
}`;

  tickGenerator();

  function tickGenerator() {
    requestAnimationFrame(tickGenerator);
    const time = Date.now();
    timeOutputs.forEach((a) => (a.innerText = time.toString()));
    generator1.calculate(time);
    generator2.calculate(time);
  }
}
