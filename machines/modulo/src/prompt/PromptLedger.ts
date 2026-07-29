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
 * The whole editor surface.
 *
 * Root's children are a row of pills, the active one's children are a second
 * row fused to a pane, and anything deeper is a pane block that folds. Colour
 * marks only where you are: the active section pill is the one filled plate,
 * and every level below it uses neutral tone with the section colour as text.
 * Properties are directly editable rows; commands are hollow pills sitting in
 * the scope they act on, so a verb never looks like a place.
 */
export class PromptLedger extends HTMLElement {
  private prompt!: Prompt;
  private onChange?: () => void;
  private onClose?: () => void;
  private refreshers: (() => void)[] = [];

  private activeSection = "";
  private activeGroups: { [section: string]: string } = {};
  private openPanes: { [path: string]: boolean } = {};

  private elementTabs = document.createElement("div");
  private elementOwn = document.createElement("div");
  private elementGroupTabs = document.createElement("div");
  private elementPane = document.createElement("div");

  initialize(prompt: Prompt, onChange?: () => void, onClose?: () => void) {
    this.prompt = prompt;
    this.onChange = onChange;
    this.onClose = onClose;
    this.elementTabs.className = "ledger-tabs";
    this.elementOwn.className = "ledger-own";
    this.elementGroupTabs.className = "ledger-group-tabs";
    this.elementPane.className = "ledger-pane";
    this.appendChild(this.elementTabs);
    this.appendChild(this.elementOwn);
    this.appendChild(this.elementGroupTabs);
    this.appendChild(this.elementPane);
    this.render();
  }

  get root(): Destination {
    return this.prompt.destination;
  }

  render() {
    this.refreshers = [];
    this.elementTabs.innerHTML = "";
    this.elementOwn.innerHTML = "";
    this.elementGroupTabs.innerHTML = "";
    this.elementPane.innerHTML = "";
    this.elementOwn.className = "ledger-own";
    this.elementGroupTabs.className = "ledger-group-tabs";
    this.elementPane.className = "ledger-pane";

    const sections = Object.keys(this.root.destinations);
    if (!sections.length) return;
    if (!sections.includes(this.activeSection)) {
      this.activeSection = sections[0];
    }

    sections.forEach((name) => {
      const destination = this.root.destinations[name];
      const tab = document.createElement("button");
      tab.className = "ledger-tab";
      tab.textContent = name;
      this.applyThemeKey(tab, destination.key);
      if (name === this.activeSection) tab.setAttribute("active", "");
      tab.addEventListener("click", () => {
        // Tapping the section you are already in closes the editor — on mobile
        // it covers the machine, so the pill you just used is the nearest
        // thing to a way back out.
        if (name === this.activeSection) {
          if (this.onClose) this.onClose();
          return;
        }
        this.activeSection = name;
        this.render();
      });
      this.elementTabs.appendChild(tab);
    });

    const section = this.root.destinations[this.activeSection];
    // Everything below the first row inherits the active section's palette.
    [this.elementOwn, this.elementGroupTabs, this.elementPane].forEach(
      (element) => this.applyThemeKey(element, section.key)
    );

    this.renderCommands(this.elementOwn, section);
    this.renderProperties(this.elementOwn, section, this.activeSection);

    const groups = Object.keys(section.destinations);
    if (!groups.length) return;
    const remembered = this.activeGroups[this.activeSection];
    const activeGroup = groups.includes(remembered) ? remembered : groups[0];
    this.activeGroups[this.activeSection] = activeGroup;

    groups.forEach((name) => {
      const tab = document.createElement("button");
      tab.className = "ledger-group-tab";
      tab.textContent = name;
      if (name === activeGroup) tab.setAttribute("active", "");
      tab.addEventListener("click", () => {
        this.activeGroups[this.activeSection] = name;
        this.render();
      });
      this.elementGroupTabs.appendChild(tab);
    });

    this.renderContents(
      this.elementPane,
      section.destinations[activeGroup],
      `${this.activeSection}.${activeGroup}`
    );
  }

  refreshValues() {
    this.refreshers.forEach((refresh) => refresh());
  }

  /** Jump to the first section, then group, whose name starts with `prefix`. */
  selectByPrefix(prefix: string): boolean {
    const sections = Object.keys(this.root.destinations);
    const section = sections.find((name) => name.startsWith(prefix));
    if (section && section !== this.activeSection) {
      this.activeSection = section;
      this.render();
      return true;
    }
    const current = this.root.destinations[this.activeSection];
    if (!current) return false;
    const group = Object.keys(current.destinations).find((name) =>
      name.startsWith(prefix)
    );
    if (group && group !== this.activeGroups[this.activeSection]) {
      this.activeGroups[this.activeSection] = group;
      this.render();
      return true;
    }
    return false;
  }

  private applyThemeKey(element: HTMLElement, key?: string) {
    if (key !== undefined) element.classList.add(`theme-key-${key}`);
  }

  private renderContents(
    container: HTMLElement,
    destination: Destination,
    path: string
  ) {
    this.renderCommands(container, destination);
    this.renderProperties(container, destination, path);
    Object.keys(destination.destinations).forEach((name) => {
      this.renderPaneBlock(
        container,
        destination.destinations[name],
        name,
        `${path}.${name}`
      );
    });
  }

  private renderPaneBlock(
    container: HTMLElement,
    destination: Destination,
    name: string,
    path: string
  ) {
    const block = document.createElement("div");
    block.className = "ledger-block";
    this.applyThemeKey(block, destination.key);

    const head = document.createElement("button");
    head.className = "ledger-block-head";
    head.textContent = name;

    const body = document.createElement("div");
    body.className = "ledger-block-body";

    if (this.openPanes[path]) block.setAttribute("open", "");
    head.addEventListener("click", () => {
      this.openPanes[path] = !this.openPanes[path];
      if (this.openPanes[path]) {
        block.setAttribute("open", "");
      } else {
        block.removeAttribute("open");
      }
    });

    this.renderContents(body, destination, path);
    block.appendChild(head);
    block.appendChild(body);
    container.appendChild(block);
  }

  private renderCommands(container: HTMLElement, destination: Destination) {
    const names = Object.keys(destination.commands);
    if (!names.length) return;
    const row = document.createElement("div");
    row.className = "ledger-actions";
    names.forEach((name) => {
      const button = document.createElement("button");
      button.className = "ledger-action";
      button.textContent = name;
      button.title = destination.commands[name].description;
      button.addEventListener("click", () => {
        destination.commands[name].onCommand(name, [], this.prompt);
        // A command can rewrite any number of properties, so repaint from the
        // engine and persist the result like a direct edit.
        this.refreshValues();
        if (this.onChange) this.onChange();
      });
      row.appendChild(button);
    });
    container.appendChild(row);
  }

  private renderProperties(
    container: HTMLElement,
    destination: Destination,
    path: string
  ) {
    Object.keys(destination.properties).forEach((key) =>
      this.renderProperty(container, key, destination.properties[key], path)
    );
  }

  private renderProperty(
    container: HTMLElement,
    propertyKey: string,
    property: DestinationProperty,
    path: string
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

      const submit = (value: string) => {
        values[index] = value;
        const formatted = String(property.inputsFormatter(values)).trim();
        property.onSet(propertyKey, formatted.split(/ +/), this.prompt);
        if (this.onChange) this.onChange();
      };

      // Commands can rewrite a property behind the panel's back, so a refresh
      // re-reads from the engine rather than repainting the cached value.
      const read = () => input.initialValue();

      if (input.type === "select") {
        this.renderOptionRow(
          container,
          label,
          input.options,
          values,
          index,
          submit,
          read
        );
      } else {
        this.renderNumericRow(
          container,
          label,
          input,
          values,
          index,
          submit,
          read
        );
      }
    });
  }

  private renderNumericRow(
    container: HTMLElement,
    label: string,
    input: NumericInput,
    values: string[],
    index: number,
    submit: (value: string) => void,
    read: () => string
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
    container.appendChild(row);

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
      const normalized = parseFloat(
        clamped.toFixed(Math.max(digits, 3))
      ).toString();
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
      if (dragging) return;
      values[index] = read();
      renderValue(false);
    });
  }

  private renderOptionRow(
    container: HTMLElement,
    label: string,
    options: string[],
    values: string[],
    index: number,
    submit: (value: string) => void,
    read: () => string
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
    container.appendChild(row);

    // Short option sets render inline; long ones compact to a cycling value.
    const inline = options.join(" ").length <= 28;

    const renderValue = () => {
      if (inline) {
        value.innerHTML = options
          .map(
            (option) =>
              `<span${
                option === values[index] ? ' class="on"' : ""
              }>${option}</span>`
          )
          .join(" ");
      } else {
        value.innerHTML = `‹ <span class="on">${values[index]}</span> ›`;
      }
    };

    const cycle = (direction: number) => {
      const at = options.indexOf(values[index]);
      const next = options[(at + direction + options.length) % options.length];
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
    this.refreshers.push(() => {
      values[index] = read();
      renderValue();
    });
  }

  // Replacing the node restarts the zoom-outwards flash animation.
  private swapValueText(
    container: HTMLSpanElement,
    text: string,
    flash: boolean
  ) {
    if (container.textContent === text && !flash) return;
    container.innerHTML = "";
    const span = document.createElement("span");
    if (flash) span.setAttribute("data-highlight", text);
    span.textContent = text;
    container.appendChild(span);
  }
}
