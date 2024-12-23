import { StegaAnimator } from "../../../packages/amplib-steganography/src";

let animator;

export default async function example(source) {
  const output = document.getElementById("image-five")!;
  if (animator) {
    animator.canvas.remove();
  }
  animator = new StegaAnimator({ source, resolution: 100 });
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
      rate: 0.01,
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
      rate: 0.01,
    },
  ]);
}
