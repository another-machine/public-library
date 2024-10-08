import { Keyboard } from "./Keyboard";
import { Sequencer } from "./Sequencer";
import { StepsSlot } from "./Steps";
export type RendererEventType = "TAP" | "PRESS" | "RELEASE";
export type RendererEventLocation = "KEYS" | "PADS" | string;
export type RendererEventHandler = (
  eventType: RendererEventType,
  eventLocation: RendererEventLocation,
  valueA: number,
  valueB?: number
) => void;

interface RendererThemeLCH {
  l: number;
  c: number;
  h: number;
}

interface RendererThemeColor {
  on: RendererThemeLCH;
  off: RendererThemeLCH;
  disabled: RendererThemeLCH;
}

export interface RendererTheme {
  color: {
    core: RendererThemeColor;
    sequencers: { [key: string]: RendererThemeColor };
    keyboard: RendererThemeColor;
    background: RendererThemeLCH;
    text: RendererThemeLCH;
  };
  prompt: {
    corner: number;
    gapColumn: number;
    gapRow: number;
    paddingX: number;
    paddingY: number;
    sizeBorder: number;
    sizeFont: number;
  };
  interface: {
    corner: number;
    gapColumn: number;
    gapRow: number;
    sizeBorder: number;
  };
}

export class Renderer {
  cursorX: number | null = null;
  cursorY: number | null = null;
  baseHue = 0;
  hueRotate = false;
  elementMain: HTMLElement;
  sequencerElements: { [key: string]: HTMLDivElement } = {};
  sequencers: Sequencer[] = [];
  keyboard: Keyboard;
  elementKeys = document.createElement("div");
  elementPads = document.createElement("div");
  style = document.createElement("style");
  rendererEventHandler: RendererEventHandler;

  constructor({
    theme,
    element,
    sequencers,
    keyboard,
    rendererEventHandler,
  }: {
    theme: RendererTheme;
    element: HTMLElement;
    sequencers: Sequencer[];
    keyboard: Keyboard;
    rendererEventHandler: RendererEventHandler;
  }) {
    this.elementMain = element;
    this.elementMain.appendChild(this.style);
    this.sequencers = sequencers;
    this.keyboard = keyboard;
    this.setTheme(theme);
    this.rendererEventHandler = rendererEventHandler;
    this.initializeSequencers();
    this.elementMain.appendChild(this.elementPads);
    this.elementMain.appendChild(this.elementKeys);
    this.initializePads();
    this.initializeKeys();
    this.animationLoop();
  }

  animationLoop() {
    requestAnimationFrame(this.animationLoop.bind(this));
    if (this.hueRotate) {
      this.baseHue += 1;
      window.document.documentElement.style.setProperty(
        "--color-hue-base",
        this.baseHue.toString()
      );
    } else if (
      window.document.documentElement.style.getPropertyValue("--color-hue-base")
    ) {
      window.document.documentElement.style.removeProperty("--color-hue-base");
    }
  }

  update({
    theme,
    sequencers,
    keyboard,
  }: {
    theme: RendererTheme;
    sequencers: Sequencer[];
    keyboard: Keyboard;
  }) {
    this.sequencers = sequencers;
    this.keyboard = keyboard;
    this.elementMain.innerHTML = "";
    this.elementMain.appendChild(this.style);
    this.setTheme(theme);
    this.initializeSequencers();
    this.elementMain.appendChild(this.elementPads);
    this.elementMain.appendChild(this.elementKeys);
    this.handleStepsSizeChange();
  }

  setTheme(theme: RendererTheme) {
    function setProperty(property: string, value: number) {
      document.documentElement.style.setProperty(property, value.toString());
    }

    function setColor(prefix: string[], color: RendererThemeLCH) {
      setProperty(`--color-${prefix.join("-")}-lit`, color.l);
      setProperty(`--color-${prefix.join("-")}-chr`, color.c);
      setProperty(`--color-${prefix.join("-")}-hue`, color.h);
    }

    const themeColorKeys: (keyof RendererThemeColor)[] = [
      "on",
      "off",
      "disabled",
    ];
    themeColorKeys.forEach((type) => {
      setColor(["core", type], theme.color.core[type]);
      setColor(["keyboard", type], theme.color.keyboard[type]);
      for (let key in theme.color.sequencers) {
        setColor(["sequencer", key, type], theme.color.sequencers[key][type]);
      }
    });
    setColor(["background"], theme.color.background);
    setColor(["text"], theme.color.text);

    setProperty("--prompt-corner-factor", theme.prompt.corner);
    setProperty("--prompt-gap-column-factor", theme.prompt.gapColumn);
    setProperty("--prompt-gap-row-factor", theme.prompt.gapRow);
    setProperty("--prompt-padding-x-factor", theme.prompt.paddingX);
    setProperty("--prompt-padding-y-factor", theme.prompt.paddingY);
    setProperty("--prompt-size-border-factor", theme.prompt.sizeBorder);
    setProperty("--prompt-size-font-factor", theme.prompt.sizeFont);

    setProperty("--interface-corner-factor", theme.interface.corner);
    setProperty("--interface-gap-column-factor", theme.interface.gapColumn);
    setProperty("--interface-gap-row-factor", theme.interface.gapRow);
    setProperty("--interface-size-border-factor", theme.interface.sizeBorder);
  }

  createButton(
    eventType: RendererEventType,
    location: RendererEventLocation,
    valueA: number,
    valueB?: number
  ) {
    const button = document.createElement("button");
    button.addEventListener("click", () =>
      this.rendererEventHandler(eventType, location, valueA, valueB)
    );
    return button;
  }

  addTheme(themeClassName: string, propertyPrefix: string) {
    const properties = ["off", "on", "disabled"].flatMap((type) =>
      ["lit", "chr", "hue"].map(
        (lch) =>
          `--color-${type}-${lch}: var(--color-${propertyPrefix}-${type}-${lch})`
      )
    );
    this.style.innerHTML += `.${themeClassName} { ${properties.join("; ")} } `;
  }

  initializeSequencers() {
    this.sequencers.forEach((sequencer) => {
      const element = document.createElement("div");
      this.addTheme(`theme-key-${sequencer.key}`, `sequencer-${sequencer.key}`);
      element.id = `sequencer-${sequencer.key}`;
      element.className = `sequencer sequencer-${
        sequencer.isDrum() ? "drum" : "synth"
      } theme-key-${sequencer.key}`;
      this.elementMain.appendChild(element);
      this.sequencerElements[sequencer.key] = element;
    });
  }

  initializeKeys() {
    this.elementKeys.id = "keys";
    this.elementKeys.classList.add("theme-key-keyboard");
    this.addTheme("theme-key-keyboard", "keyboard");
    for (let i = 0; i < 24; i++) {
      const key = document.createElement("button");
      key.addEventListener("click", () =>
        this.rendererEventHandler("TAP", "KEYS", i)
      );
      // key.addEventListener("touchstart", () =>
      //   this.rendererEventHandler("PRESS", "KEYS", i)
      // );
      // key.addEventListener("touchend", () =>
      //   this.rendererEventHandler("RELEASE", "KEYS", i)
      // );
      // key.addEventListener("touchmove", (e) => e.preventDefault());
      // key.addEventListener("touchleave", () =>
      //   this.rendererEventHandler("RELEASE", "KEYS", i)
      // );
      // key.addEventListener("mousedown", () => {
      //   key.setAttribute("down", "true");
      //   this.rendererEventHandler("PRESS", "KEYS", i);
      // });
      // key.addEventListener("mouseup", () => {
      //   key.removeAttribute("down");
      //   this.rendererEventHandler("RELEASE", "KEYS", i);
      // });
      // key.addEventListener("mousemove", (e) => e.preventDefault());
      // key.addEventListener("mouseleave", () => {
      //   if (key.hasAttribute("down")) {
      //     key.removeAttribute("down");
      //     this.rendererEventHandler("RELEASE", "KEYS", i);
      //   }
      // });
      this.elementKeys.appendChild(key);
    }
  }

  initializePads() {
    this.elementPads.id = "pads";
    this.elementPads.classList.add("theme-key-core");
    this.addTheme("theme-key-core", "core");
    for (let i = 0; i < 8; i++) {
      const pad = this.createButton("TAP", "PADS", i);
      this.elementPads.appendChild(pad);
      pad.setAttribute("state", "1/4");
    }
    this.updatePads(0);
  }

  updateCursor({ x, y }: { x?: number; y?: number }) {
    if (x !== undefined) {
      this.cursorX = Math.min(x, 0.99999999999);
    } else if (this.cursorX === null) {
      this.cursorX = 0;
    }
    if (y !== undefined) {
      this.cursorY = Math.min(y, 0.99999999999);
    } else if (this.cursorY === null) {
      this.cursorY = 0;
    }
    this.renderCursor();
  }

  handleCursorSelect() {
    const button =
      this.elementMain.querySelector<HTMLButtonElement>("button.cursor");
    if (button) {
      // TODO: gross, but works. Keyboard is mousedown/mouseup, everything else is currently click.
      if (button.parentElement?.id === "keys") {
        button.dispatchEvent(new Event("mousedown"));
      } else {
        button.click();
      }
    }
  }

  renderCursor() {
    if (this.cursorX === null || this.cursorY === null) {
      return;
    }

    const rows = [
      ...this.sequencers.flatMap((sequencer) =>
        sequencer.steps.rows.map(
          (_, i) => `#sequencer-${sequencer.key} div:nth-child(${i + 1})`
        )
      ),
      "#pads",
      "#keys",
    ];
    const currentCursor = document.querySelector("button.cursor");
    const row = document.querySelector(
      rows[Math.floor(this.cursorY * rows.length)]
    );
    if (row) {
      const buttons = row.querySelectorAll("& > button");
      const button = buttons[Math.floor(this.cursorX * buttons.length)];
      if (!button.classList.contains("cursor")) {
        currentCursor?.classList.remove("cursor");
        button.classList.add("cursor");
      }
    }
  }

  snapshot() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    const background = getComputedStyle(document.body).backgroundColor;
    const computedMain = getComputedStyle(this.elementMain);
    const padding = Math.max(parseInt(computedMain.gap.replace("px", "")), 2);
    const buttons: {
      top: number;
      left: number;
      right: number;
      bottom: number;
      fill: string;
      zIndex: number;
    }[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    this.elementMain
      .querySelectorAll<HTMLButtonElement>("button:not(#prompt button)")
      .forEach((button) => {
        const { top, right, bottom, left } = button.getBoundingClientRect();
        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, right);
        maxY = Math.max(maxY, bottom);
        const computed = getComputedStyle(button);
        const fill = computed.backgroundColor;
        const zIndex =
          computed.zIndex !== "auto" ? parseInt(computed.zIndex) : -1;
        buttons.push({ top, left, right, bottom, fill, zIndex });
      });

    buttons.sort((a, b) => a.zIndex - b.zIndex);
    const width = Math.ceil(maxX - minX);
    const height = Math.ceil(maxY - minY);
    canvas.width = width + padding * 2;
    canvas.height = height + padding * 2;
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    buttons.forEach(({ top, right, bottom, left, fill }) => {
      context.fillStyle = fill;
      context.fillRect(
        left - minX + padding,
        top - minY + padding,
        right - left,
        bottom - top
      );
    });
    return canvas;
  }

  updateKeyboard() {
    const { stepsForScale, stepsForInterval, stepsForRoot } =
      this.keyboard.notes.currentModeSteps();
    this.elementKeys
      .querySelectorAll("[step]")
      .forEach((a) => a.removeAttribute("step"));
    stepsForScale.forEach((step) => {
      const element = this.elementKeys.querySelector(
        `button:nth-child(${step + 1})`
      );
      if (element) {
        if (stepsForRoot.includes(step)) {
          element.setAttribute("step", "root");
        } else if (stepsForInterval.includes(step)) {
          element.setAttribute("step", "interval");
        } else {
          element.setAttribute("step", "scale");
        }
      }
    });
    this.updateKeyboardActives();
  }

  updateKeyboardActives() {
    const { mainStep, ghostSteps } = this.keyboard;
    this.elementKeys
      .querySelectorAll("[active]")
      .forEach((a) => a.removeAttribute("active"));
    if (mainStep !== null) {
      this.elementKeys
        .querySelector(`button:nth-child(${mainStep + 1})`)
        ?.setAttribute("active", "main");
      ghostSteps.forEach((ghostStep) => {
        this.elementKeys
          .querySelector(`button:nth-child(${ghostStep + 1})`)
          ?.setAttribute("active", "ghost");
      });
    }
  }

  updatePads(activeInterval: number) {
    this.elementPads
      .querySelectorAll("button:not(:nth-child(8))")
      .forEach((child) => {
        child.setAttribute("state", "1/4");
        child.removeAttribute("active");
      });
    const activePad = this.elementPads.querySelector(
      `button:nth-child(${activeInterval + 1})`
    );
    activePad?.setAttribute("state", "4/4");
    activePad?.setAttribute("active", "");
  }

  updateStep(
    element: HTMLDivElement,
    row: number,
    col: number,
    state: StepsSlot,
    stateMax: StepsSlot
  ) {
    const button = element.querySelector<HTMLButtonElement>(
      `div:nth-child(${row + 1}) > button:nth-child(${col + 1})`
    );
    button?.setAttribute("state", state ? `${state}/${stateMax}` : `${state}`);
  }

  updateSteps() {
    this.sequencers.forEach((sequencer) =>
      sequencer.steps.rows.forEach((stepRow, row) => {
        stepRow.slots.forEach((step, col) => {
          const element = this.sequencerElements[sequencer.key];
          this.updateStep(element, row, col, step, sequencer.steps.max);
        });
      })
    );
  }

  handleStepsSizeChange() {
    Object.values(this.sequencerElements).forEach(
      (element) => (element.innerHTML = "")
    );
    let xMax = 0;
    let yMax = 0;
    this.sequencers.forEach((sequencer) => {
      xMax = Math.max(sequencer.steps.size, xMax);
      yMax = Math.max(sequencer.steps.rows.length, yMax);
    });

    for (let rowIndex = 0; rowIndex < yMax; rowIndex++) {
      const rows: (HTMLDivElement | null)[] = [];

      this.sequencers.forEach((sequencer, i) => {
        const row =
          rowIndex < sequencer.steps.rows.length
            ? document.createElement("div")
            : null;
        rows[i] = row;
        if (row) this.sequencerElements[sequencer.key].appendChild(row);
      });

      for (let colIndex = 0; colIndex < xMax; colIndex++) {
        this.sequencers.forEach((sequencer, i) => {
          if (rows[i] && colIndex < sequencer.steps.size) {
            rows[i].appendChild(
              this.createButton("TAP", sequencer.key, rowIndex, colIndex)
            );
          }
        });
      }
    }
    this.updateSteps();
  }

  renderStep(position: number) {
    this.clearActives();
    Object.values(this.sequencerElements).forEach((element) => {
      const index = position % element.childNodes[0].childNodes.length;
      element
        .querySelectorAll(`div > button:nth-child(${index + 1})`)
        .forEach((element) => element.setAttribute("active", "true"));
    });
  }

  clearActives() {
    Object.values(this.sequencerElements).forEach((element) =>
      element
        .querySelectorAll(`div > button[active="true"]`)
        .forEach((element) => element.removeAttribute("active"))
    );
  }

  stop() {
    this.elementMain.removeAttribute("stepping");
    const togglePad = this.elementPads.querySelector("button:nth-child(8)");

    togglePad?.setAttribute("state", "1/4");
    togglePad?.removeAttribute("active");
    this.clearActives();
  }

  start() {
    this.elementMain.setAttribute("stepping", "true");
    const togglePad = this.elementPads.querySelector("button:nth-child(8)");
    togglePad?.setAttribute("state", "4/4");
    togglePad?.setAttribute("active", "");
  }
}