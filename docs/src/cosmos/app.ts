import { Geolocation } from "../../../packages/amplib-devices/src";
import {
  generate,
  describeLines,
  type CosmosResult,
} from "../../../packages/amplib-cosmos/src";
import { createForm } from "../createForm";

type FormData = {
  latitude: number;
  longitude: number;
};

const data = {
  latitude: 0,
  longitude: 0,
};

export async function example() {
  const section = document.querySelector("section")!;
  const form = section.querySelector("form")!;
  const output = section.querySelector('[data-output="report-output"]')!;
  const date = section.querySelector('[data-output="date-output"]')!;
  const seed = section.querySelector('[data-output="seed-output"]')!;
  const signals = section.querySelector('[data-output="signals-output"]')!;
  form.innerHTML = "";

  const { values, setValue } = createForm<FormData>({
    form,
    inputs: {
      latitude: { name: "latitude", type: "number", value: 0 },
      longitude: { name: "longitude", type: "number", value: 0 },
    },
    onInput,
    actions: [{ action: setLocation, name: "Current Location" }],
  });

  async function setLocation() {
    const { latitude, longitude } = await Geolocation.get();
    setValue("latitude", latitude);
    setValue("longitude", longitude);
  }

  onInput(values);
  loop();

  function onInput(formData: FormData) {
    data.latitude = formData.latitude;
    data.longitude = formData.longitude;
  }

  function loop() {
    requestAnimationFrame(loop);
    const timestamp = Date.now();
    const result = generate({ ...data, timestamp });

    date.innerHTML = timestamp.toString();
    seed.innerHTML = renderSeed(result);
    signals.innerHTML = renderSignals(result);
    // describeLines() is the opt-in text layer. generate() itself allocates no
    // strings, which is what makes calling it every frame reasonable.
    output.innerHTML = describeLines(result);
  }
}

function renderSeed({ seed }: CosmosResult): string {
  const seconds = Math.max(0, seed.millisecondsRemaining / 1000);
  return [
    `code    ${seed.code}`,
    `integer ${seed.integer}`,
    `expires in ${seconds.toFixed(1)} s`,
  ].join("\n");
}

/**
 * A bar per signal, grouped by how fast it moves. This is the view that makes
 * the timescale bands legible: the rotational bars visibly crawl while the
 * epochal ones sit still.
 */
function renderSignals(result: CosmosResult): string {
  const width = 24;
  const lines: string[] = [];

  for (const band of Object.values(result.timescales)) {
    lines.push(`${band.band} (${formatPeriod(band.periodSeconds)})`);
    for (const signal of band.signals) {
      const filled = Math.round(signal.value.unitRange * width);
      const bar = "█".repeat(filled) + "░".repeat(width - filled);
      const name = signal.path.padEnd(38);
      const marker = signal.cyclic ? "~" : " ";
      lines.push(`  ${marker} ${name} ${bar} ${signal.value.unitRange.toFixed(3)}`);
    }
    lines.push("");
  }

  lines.push("~ marks a cyclic signal, which also carries sin and cos");
  return lines.join("\n");
}

function formatPeriod(seconds: number): string {
  if (seconds < 172800) return `${(seconds / 3600).toFixed(1)} h`;
  if (seconds < 63072000) return `${(seconds / 86400).toFixed(1)} d`;
  return `${(seconds / 31557600).toFixed(1)} y`;
}
