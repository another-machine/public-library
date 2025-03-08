import { exampleGoldenRatio } from "./exampleGoldenRatio";
import { exampleHarmonicSuperposition } from "./exampleHarmonicSuperposition";
import { exampleRandomEngine } from "./exampleRandomEngine";

document
  .querySelectorAll("form")
  .forEach((form) =>
    form.addEventListener("submit", (e) => e.preventDefault())
  );

exampleGoldenRatio();
exampleHarmonicSuperposition();
exampleRandomEngine();
