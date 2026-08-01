import {
  fromPerceptual,
  toPerceptual,
} from "../../../packages/amplib-color/src";
import { createForm } from "../createForm";

type FormData = {
  sectors: number;
  displayHue: number;
};

const WHEEL_STEPS = 1440;

export function example() {
  const section = document.querySelector("section")!;
  const form = section.querySelector("form")!;
  const displayCanvas =
    section.querySelector<HTMLCanvasElement>('[data-canvas="display"]')!;
  const perceptualCanvas =
    section.querySelector<HTMLCanvasElement>('[data-canvas="perceptual"]')!;
  const naiveRow = section.querySelector('[data-swatches="naive"]')!;
  const evenRow = section.querySelector('[data-swatches="even"]')!;
  const roundTripOutput = section.querySelector('[data-output="round-trip"]')!;
  const spacedOutput = section.querySelector('[data-output="spaced"]')!;
  form.innerHTML = "";

  const { values } = createForm<FormData>({
    form,
    inputs: {
      sectors: {
        name: "sectors",
        type: "range",
        value: 6,
        min: 2,
        max: 12,
        step: 1,
      },
      displayHue: {
        name: "display hue",
        type: "range",
        value: 210,
        min: 0,
        max: 359,
        step: 1,
      },
    },
    onInput,
  });

  onInput(values);

  function onInput(formData: FormData) {
    drawWheel(displayCanvas, formData.sectors, formData.displayHue, "display");
    drawWheel(
      perceptualCanvas,
      formData.sectors,
      formData.displayHue,
      "perceptual"
    );
    drawSwatches(formData.sectors);
    report(formData);
  }

  /**
   * The same request — "give me N evenly spaced hues" — answered both ways.
   * This is the shortest version of the argument: the top row is what you get
   * by dividing 360 by N, and the greens run together while the blues barely
   * move apart.
   */
  function drawSwatches(sectors: number) {
    const naive: number[] = [];
    const even: number[] = [];
    for (let i = 0; i < sectors; i++) {
      naive.push((i * 360) / sectors);
      even.push(fromPerceptual((i * 360) / sectors));
    }
    const fill = (row: Element, hues: number[]) => {
      row.innerHTML = hues
        .map(
          (hue) =>
            `<span class="swatch" style="background: hsl(${hue} 85% 55%)">${Math.round(
              hue
            )}</span>`
        )
        .join("");
    };
    fill(naiveRow, naive);
    fill(evenRow, even);
  }

  function report({ sectors, displayHue }: FormData) {
    const perceptual = toPerceptual(displayHue);
    const back = fromPerceptual(perceptual);
    let error = Math.abs(back - displayHue);
    if (error > 180) error = 360 - error;
    roundTripOutput.innerHTML = [
      `display     ${Math.round(displayHue)}°`,
      `perceptual  ${perceptual.toFixed(2)}°`,
      `back        ${back.toFixed(2)}°`,
      `error       ${error.toFixed(3)}°`,
    ].join("\n");

    const even = Array.from({ length: sectors }, (_, i) =>
      fromPerceptual((i * 360) / sectors).toFixed(1)
    );
    const naive = Array.from({ length: sectors }, (_, i) =>
      ((i * 360) / sectors).toFixed(1)
    );
    spacedOutput.innerHTML = [
      `naive  ${naive.join(", ")}`,
      `even   ${even.join(", ")}`,
    ].join("\n");
  }
}

/**
 * Draw N equal perceptual sectors as a ring.
 *
 * In "display" mode the angle is display hue, which is how a camera or a color
 * picker measures it — the sectors come out visibly lopsided even though they
 * are all the same width. In "perceptual" mode the angle is oklch hue and they
 * look even. Two views of one division; the difference between them is the
 * entire argument for the package.
 */
function drawWheel(
  canvas: HTMLCanvasElement,
  sectors: number,
  markerHue: number,
  space: "display" | "perceptual"
) {
  const context = canvas.getContext("2d")!;
  const ratio = window.devicePixelRatio || 1;
  const size = canvas.clientWidth || 260;
  if (canvas.width !== size * ratio) {
    canvas.width = size * ratio;
    canvas.height = size * ratio;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, size, size);

  const center = size / 2;
  const outer = center - 4;
  const inner = outer * 0.58;
  const step = 360 / WHEEL_STEPS;

  const angleFor = (displayHue: number) =>
    ((space === "display" ? displayHue : toPerceptual(displayHue)) - 90) *
    (Math.PI / 180);

  const sweepAt = (hue: number) => {
    const start = angleFor(hue);
    let sweep = angleFor(hue + step) - start;
    if (sweep < -Math.PI) sweep += Math.PI * 2;
    if (sweep > Math.PI) sweep -= Math.PI * 2;
    return { start, sweep };
  };

  for (let i = 0; i < WHEEL_STEPS; i++) {
    const hue = i * step;
    const { start, sweep } = sweepAt(hue);
    if (sweep <= 0) continue;
    context.beginPath();
    context.arc(center, center, outer, start, start + sweep);
    context.arc(center, center, inner, start + sweep, start, true);
    context.closePath();
    context.fillStyle = `hsl(${hue} 85% 55%)`;
    context.fill();
  }

  // Sector boundaries, placed at equal perceptual intervals. On the left wheel
  // they bunch up through green and deep blue; on the right they are equally
  // spaced by construction. Same numbers, both times.
  context.strokeStyle = "rgba(0,0,0,0.85)";
  context.lineWidth = 2;
  for (let i = 0; i < sectors; i++) {
    const angle = angleFor(fromPerceptual((i * 360) / sectors));
    context.beginPath();
    context.moveTo(
      center + Math.cos(angle) * inner,
      center + Math.sin(angle) * inner
    );
    context.lineTo(
      center + Math.cos(angle) * outer,
      center + Math.sin(angle) * outer
    );
    context.stroke();
  }

  const markerAngle = angleFor(markerHue);
  context.strokeStyle = "#fff";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(
    center + Math.cos(markerAngle) * (inner - 8),
    center + Math.sin(markerAngle) * (inner - 8)
  );
  context.lineTo(
    center + Math.cos(markerAngle) * (outer + 2),
    center + Math.sin(markerAngle) * (outer + 2)
  );
  context.stroke();
}
