import { GoldenRatio } from "../../../packages/amplib-procedural-generation/src";

export function exampleGoldenRatio() {
  const timeOutputs = document.querySelectorAll<HTMLElement>(
    '[data-output="gr-time"]'
  )!;
  const grOutput1 = document.querySelector<HTMLElement>(
    '[data-output="gr-1"]'
  )!;
  const grOutput2 = document.querySelector<HTMLElement>(
    '[data-output="gr-2"]'
  )!;
  const grOutput3 = document.querySelector<HTMLElement>(
    '[data-output="gr-3"]'
  )!;
  const grOutputx = document.querySelector<HTMLElement>(
    '[data-output="gr-x"]'
  )!;
  const grOutputy = document.querySelector<HTMLElement>(
    '[data-output="gr-y"]'
  )!;
  const generator = new GoldenRatio();

  let i = 0;
  tickGenerator();

  function tickGenerator() {
    requestAnimationFrame(tickGenerator);
    const time = Date.now();
    grOutput1.innerText = generator
      .shouldEventOccur({ time, eventWindow: 1000, cycleLength: 10000 })
      .toString();
    grOutput2.innerText = generator.generate({ time }).toString();
    const t = time / 100000000;
    const x = i % 100;
    const y = Math.floor(i / 100);
    grOutputx.innerText = `${x}`;
    grOutputy.innerText = `${y}`;
    grOutput3.innerText = generator.noise2d({ x, y }).toString();
    timeOutputs.forEach((a) => (a.innerText = time.toString()));
    i++;
  }
}
