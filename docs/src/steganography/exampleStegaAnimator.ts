import { StegaAnimator } from "../../../packages/amplib-steganography/src";
import { createForm } from "../createForm";

type FormData = {
  rate: number;
  resolution: number;
  fadeAmount: number;
};

let animator;

export default async function example(source) {
  const section = document.querySelector("#stega-animator")!;
  const output = section.querySelector("figure")!;
  const form = section.querySelector("form")!;
  form.innerHTML = "";

  const { values } = createForm<FormData>({
    form,
    inputs: {
      resolution: { name: "resolution", type: "number", value: 100, min: 10 },
      fadeAmount: {
        name: "fadeAmount",
        type: "range",
        value: 0,
        min: 0,
        max: 1,
        step: 0.01,
      },
      rate: {
        name: "rate",
        type: "range",
        value: 0.01,
        min: 0.001,
        max: 0.05,
        step: 0.001,
      },
    },
    onInput: run,
    actions: [],
  });
  run(values);

  function run(data: FormData) {
    if (animator) {
      animator.canvas.remove();
    }
    animator = new StegaAnimator({
      source,
      resolution: data.resolution,
      fadeAmount: data.fadeAmount,
    });
    output.innerHTML = "";
    output.appendChild(animator.canvas);
    animator.animationLoop([
      {
        from: {
          rotation: 0,
          scale: 0.5,
          x: 0.5,
          y: 0.5,
        },
        to: {
          rotation: Math.PI * 1,
          scale: 0.6,
          x: 0.5,
          y: 0.5,
        },
        rate: data.rate,
      },
      {
        from: {
          rotation: Math.PI * 1,
          scale: 0.6,
          x: 0.5,
          y: 0.5,
        },
        to: {
          rotation: Math.PI * 2,
          scale: 0.5,
          x: 0.5,
          y: 0.5,
        },
        rate: data.rate,
      },
    ]);
  }
}
