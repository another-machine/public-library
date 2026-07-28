import {
  Destination,
  DestinationProperty,
  DestinationPropertyInput,
} from "../destinations/Destination";
import { Prompt } from "./Prompt";

const METER_CELLS = 12;
const SCRUB_PIXELS = 240;

type NumericInput = Extract<
  DestinationPropertyInput,
  { type: "number" } | { type: "range" }
>;

/**
 * The ledger renders every property in the current destination and its
 * descendants as one directly-editable row: drag or arrow-key numbers,
 * click or arrow-key options. It replaces the read-only JSON readout and
 * the per-property input forms.
 */
export class PromptLedger extends HTMLElement {
  private prompt: Prompt;
  private onTouch?: (label: string, value: string) => void;
  private refreshers: (() => void)[] = [];

  initialize(prompt: Prompt, onTouch?: (label: string, value: string) => void) {
    this.prompt = prompt;
    this.onTouch = onTouch;
    this.render();
  }

  render() {
    this.innerHTML = "";
    this.refreshers = [];
    this.renderDestination(this.prompt.currentDestination, []);
  }

  refreshValues() {
    this.refreshers.forEach((refresh) => refresh());
  }

  private renderDestination(destination: Destination, path: string[]) {
    const propertyKeys = Object.keys(destination.properties);
    if (propertyKeys.length && path.length) {
      const header = document.createElement("div");
      header.className = "ledger-section";
      header.textContent = path.join(".");
      this.appendChild(header);
    }
    propertyKeys.forEach((key) =>
      this.renderProperty(key, destination.properties[key], path)
    );
    Object.keys(destination.destinations).forEach((key) =>
      this.renderDestination(destination.destinations[key], [...path, key])
    );
  }

  private renderProperty(
    propertyKey: string,
    property: DestinationProperty,
    path: string[]
  ) {
    // All of a property's inputs submit together, so their current values are
    // shared state across the property's rows.
    const values = property.inputs.map((input) => input.initialValue());
    property.inputs.forEach((input, index) => {
      const inputLabel = (input.label || `${index + 1}`).toLowerCase();
      const label =
        property.inputs.length > 1 && inputLabel !== propertyKey
          ? `${propertyKey} ${inputLabel}`
          : propertyKey;
      const fullLabel = [...path, label].join(".");

      const submit = (value: string) => {
        values[index] = value;
        const formatted = String(property.inputsFormatter(values)).trim();
        property.onSet(propertyKey, formatted.split(/ +/), this.prompt);
        if (this.onTouch) this.onTouch(fullLabel, value);
      };

      if (input.type === "select") {
        this.renderOptionRow(label, input.options, values, index, submit);
      } else {
        this.renderNumericRow(label, input, values, index, submit);
      }
    });
  }

  private renderNumericRow(
    label: string,
    input: NumericInput,
    values: string[],
    index: number,
    submit: (value: string) => void
  ) {
    const step =
      ("step" in input && input.step) ||
      ("steps" in input && input.steps && input.steps[0]) ||
      (input.max - input.min) / 100;
    const digits = step >= 1 ? 0 : 3;

    const row = document.createElement("button");
    row.className = "ledger-row ledger-row-numeric";

    const key = document.createElement("span");
    key.className = "ledger-key";
    key.textContent = label;

    const meter = document.createElement("span");
    meter.className = "ledger-meter";

    const value = document.createElement("span");
    value.className = "ledger-value";

    row.appendChild(key);
    row.appendChild(meter);
    row.appendChild(value);
    this.appendChild(row);

    const current = () => parseFloat(values[index]) || 0;

    const renderValue = (flash: boolean) => {
      const number = current();
      const amount = Math.min(
        1,
        Math.max(0, (number - input.min) / (input.max - input.min))
      );
      const cells = Math.round(amount * METER_CELLS);
      meter.innerHTML = `<b>${"█".repeat(cells)}</b>${"░".repeat(
        METER_CELLS - cells
      )}`;
      this.swapValueText(value, number.toFixed(digits), flash);
    };

    const set = (number: number, flash: boolean) => {
      const quantized =
        Math.round((number - input.min) / step) * step + input.min;
      const clamped = Math.min(input.max, Math.max(input.min, quantized));
      const normalized = parseFloat(clamped.toFixed(Math.max(digits, 3))).toString();
      if (normalized === parseFloat(values[index]).toString()) return;
      submit(normalized);
      renderValue(flash);
    };

    let dragging = false;
    let startX = 0;
    let startValue = 0;
    row.addEventListener("pointerdown", (event) => {
      dragging = true;
      startX = event.clientX;
      startValue = current();
      try {
        row.setPointerCapture(event.pointerId);
      } catch (e) {
        // Synthetic pointers have no capturable id; scrubbing still works.
      }
    });
    row.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const delta =
        ((event.clientX - startX) / SCRUB_PIXELS) * (input.max - input.min);
      set(startValue + delta, false);
    });
    row.addEventListener("pointerup", () => {
      dragging = false;
      renderValue(true);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        set(current() + step, true);
        event.preventDefault();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        set(current() - step, true);
        event.preventDefault();
      }
    });

    renderValue(false);
    this.refreshers.push(() => {
      if (!dragging) renderValue(false);
    });
  }

  private renderOptionRow(
    label: string,
    options: string[],
    values: string[],
    index: number,
    submit: (value: string) => void
  ) {
    const row = document.createElement("button");
    row.className = "ledger-row ledger-row-option";

    const key = document.createElement("span");
    key.className = "ledger-key";
    key.textContent = label;

    const value = document.createElement("span");
    value.className = "ledger-options";

    row.appendChild(key);
    row.appendChild(value);
    this.appendChild(row);

    // Short option sets render inline; long ones compact to a cycling value.
    const inline = options.join(" ").length <= 28;

    const renderValue = () => {
      if (inline) {
        value.innerHTML = options
          .map(
            (option) =>
              `<span${option === values[index] ? ' class="on"' : ""}>${option}</span>`
          )
          .join(" ");
      } else {
        value.innerHTML = `‹ <span class="on">${values[index]}</span> ›`;
      }
    };

    const cycle = (direction: number) => {
      const at = options.indexOf(values[index]);
      const next =
        options[(at + direction + options.length) % options.length];
      submit(next);
      renderValue();
    };

    row.addEventListener("click", () => cycle(1));
    row.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") {
        cycle(1);
        event.preventDefault();
      } else if (event.key === "ArrowLeft") {
        cycle(-1);
        event.preventDefault();
      }
    });

    renderValue();
    this.refreshers.push(renderValue);
  }

  // Replacing the node restarts the zoom-outwards flash animation.
  private swapValueText(container: HTMLSpanElement, text: string, flash: boolean) {
    if (container.textContent === text && !flash) return;
    container.innerHTML = "";
    const span = document.createElement("span");
    if (flash) span.setAttribute("data-highlight", text);
    span.textContent = text;
    container.appendChild(span);
  }
}
