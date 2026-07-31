import { Palette, toPerceptual } from "../../../packages/amplib-hue-wheel/src";
import { parseChord } from "../../../packages/amplib-music-theory/src";
import { createForm } from "../createForm";

type FormData = {
  slots: string;
  rootHue: number;
  crossZone: number;
  displayHue: number;
};

const WHEEL_STEPS = 1440;
const DEFAULT_SLOTS = "g1,g2,g2,g1,g3";

export function example() {
  const section = document.querySelector("section")!;
  const form = section.querySelector("form")!;
  const displayCanvas =
    section.querySelector<HTMLCanvasElement>('[data-canvas="display"]')!;
  const perceptualCanvas =
    section.querySelector<HTMLCanvasElement>('[data-canvas="perceptual"]')!;
  const slotOutput = section.querySelector('[data-output="slot"]')!;
  const blendOutput = section.querySelector('[data-output="blend"]')!;
  const bandsOutput = section.querySelector('[data-output="bands"]')!;
  const chordOutput = section.querySelector('[data-output="chord"]')!;
  form.innerHTML = "";

  let palette = Palette.fromString(DEFAULT_SLOTS);

  const { values } = createForm<FormData>({
    form,
    inputs: {
      slots: { name: "slots", type: "text", value: DEFAULT_SLOTS },
      rootHue: {
        name: "root hue",
        type: "range",
        value: 0,
        min: 0,
        max: 359,
        step: 1,
      },
      crossZone: {
        name: "cross zone",
        type: "range",
        value: 0.15,
        min: 0,
        max: 0.5,
        step: 0.01,
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
    try {
      palette = Palette.fromString(formData.slots, {
        rootHue: formData.rootHue,
        crossZone: formData.crossZone,
      });
    } catch (error) {
      slotOutput.innerHTML = (error as Error).message;
      return;
    }
    render(formData.displayHue);
  }

  function render(displayHue: number) {
    drawWheel(displayCanvas, palette, displayHue, "display");
    drawWheel(perceptualCanvas, palette, displayHue, "perceptual");

    const { slot, t } = palette.hueToSlot(displayHue);
    const occurrences = palette.slots
      .filter((entry) => entry.value === slot.value)
      .map((entry) => entry.index);
    slotOutput.innerHTML = [
      `hue      ${Math.round(displayHue)}°`,
      `sector   ${slot.index} of ${palette.slots.length}`,
      `value    ${slot.value}`,
      `appears  ${occurrences.length}x — sector ${occurrences.join(", ")}`,
      `position ${t.toFixed(3)} through the sector`,
    ].join("\n");

    blendOutput.innerHTML = palette
      .hueToBlend(displayHue)
      .map(
        ({ slot: blendSlot, weight }) =>
          `${blendSlot.value.padEnd(6)} ${weight.toFixed(3)}`
      )
      .join("\n");

    bandsOutput.innerHTML = palette.bands
      .map(
        (band) =>
          `${band.value.padEnd(6)} ${String(band.indices.length).padStart(
            2
          )} sector${band.indices.length === 1 ? " " : "s"} ` +
          `(${band.indices.join(",")})  centre ${Math.round(band.centreHue)}°`
      )
      .join("\n");

    renderChordExample(displayHue);
  }

  /**
   * The same geometry with chords in the slots instead of labels, to show what
   * `map` is for. Note the doubled CEG — it takes two sectors, exactly the way
   * a doubled g2 does.
   */
  function renderChordExample(displayHue: number) {
    try {
      const chords = Palette.fromString("CEG,CEG,FAC,GBD", {
        rootHue: values.rootHue,
        crossZone: values.crossZone,
      }).map(parseChord);
      const { slot } = chords.hueToSlot(displayHue);
      const named = slot.value.chord;
      chordOutput.innerHTML = [
        `spelled  ${slot.value.label}`,
        `notes    ${slot.value.notations.join(" ")}`,
        `named    ${named ? named.label : "—"}`,
        `bands    ${chords.bands.length} from ${chords.slots.length} sectors`,
      ].join("\n");
    } catch (error) {
      chordOutput.innerHTML = (error as Error).message;
    }
  }
}

/**
 * Draw the palette as a ring.
 *
 * In "display" mode the angle is display hue, which is how a camera or a
 * colour picker measures it — the sectors come out visibly lopsided even
 * though they are all the same width. In "perceptual" mode the angle is oklch
 * hue and they look even. Two views of one palette; the difference between
 * them is the entire argument for the package.
 */
function drawWheel(
  canvas: HTMLCanvasElement,
  palette: Palette<string>,
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

  const centre = size / 2;
  const outer = centre - 4;
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
    context.arc(centre, centre, outer, start, start + sweep);
    context.arc(centre, centre, inner, start + sweep, start, true);
    context.closePath();
    context.fillStyle = `hsl(${hue} 85% 55%)`;
    context.fill();
  }

  // Blend zones as a band on the inner edge, opacity tracking how much of the
  // neighbour is mixed in. Without this the crossZone control changes only the
  // readouts, which reads as though it does nothing. Seams inside a band never
  // shade, because hueToBlend does not blend a value with itself.
  const bandOuter = inner + (outer - inner) * 0.3;
  for (let i = 0; i < WHEEL_STEPS; i++) {
    const hue = i * step;
    const blend = palette.hueToBlend(hue);
    if (blend.length < 2) continue;
    const neighbour = Math.min(...blend.map((entry) => entry.weight));
    const { start, sweep } = sweepAt(hue);
    if (sweep <= 0) continue;
    context.beginPath();
    context.arc(centre, centre, bandOuter, start, start + sweep);
    context.arc(centre, centre, inner, start + sweep, start, true);
    context.closePath();
    context.fillStyle = `rgba(0,0,0,${(neighbour * 2 * 0.75).toFixed(3)})`;
    context.fill();
  }

  // Sector boundaries. A seam inside a band is drawn faintly, so the repetition
  // is still legible without implying a transition that does not happen.
  const values = palette.values;
  const count = values.length;
  palette.slots.forEach((slot) => {
    const previous = values[(slot.index - 1 + count) % count];
    const internal = previous === slot.value;
    context.strokeStyle = internal ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.85)";
    context.lineWidth = internal ? 1 : 2;
    const angle = angleFor(palette.slotToHue(slot.index, 0));
    context.beginPath();
    context.moveTo(
      centre + Math.cos(angle) * inner,
      centre + Math.sin(angle) * inner
    );
    context.lineTo(
      centre + Math.cos(angle) * outer,
      centre + Math.sin(angle) * outer
    );
    context.stroke();
  });

  // One label per band, not per sector — a doubled value reads as one wide
  // band, so labelling both its sectors would just print the name twice.
  context.fillStyle = "rgba(0,0,0,0.9)";
  context.font = "600 11px ui-monospace, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const band of palette.bands) {
    const angle = angleFor(band.centreHue);
    const radius = (inner + outer) / 2;
    context.fillText(
      band.value,
      centre + Math.cos(angle) * radius,
      centre + Math.sin(angle) * radius
    );
  }

  const markerAngle = angleFor(markerHue);
  context.strokeStyle = "#fff";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(
    centre + Math.cos(markerAngle) * (inner - 8),
    centre + Math.sin(markerAngle) * (inner - 8)
  );
  context.lineTo(
    centre + Math.cos(markerAngle) * (outer + 2),
    centre + Math.sin(markerAngle) * (outer + 2)
  );
  context.stroke();
}
