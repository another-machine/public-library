import { Keyboard } from "./Keyboard";
import { MachineCore } from "./Machine";
import { Sequencer } from "./Sequencer";
import { StepsSlot } from "./Steps";
export type RendererEventType = "TAP" | "PRESS" | "RELEASE";
export type RendererEventLocation = "KEYS" | "PADS" | "SOLO" | "MUTE" | string;

export interface RendererChannelState {
  key: string;
  muted: boolean;
  soloed: boolean;
  audible: boolean;
}
export type RendererEventHandler = (
  eventType: RendererEventType,
  eventLocation: RendererEventLocation,
  valueA: number,
  valueB?: number
) => void;

export interface RendererThemeLCH {
  l: number;
  c: number;
  h: number;
}

export interface RendererThemeColor {
  a: RendererThemeLCH;
  b: RendererThemeLCH;
  c: RendererThemeLCH;
}

export interface RendererThemeSizesPads {
  border: number;
  corner: number;
  gapX: number;
  gapY: number;
  glow: number;
  paddingX: number;
  paddingY: number;
}
export interface RendererTheme {
  colors: RendererThemeColor[];
  sizes: {
    pads: RendererThemeSizesPads;
  };
}

export class Renderer {
  cursorX: number | null = null;
  cursorY: number | null = null;
  hueRotate = false;
  elementMain = document.createElement("main");
  elementRoot: HTMLElement;
  sequencerElements: { [key: string]: HTMLDivElement } = {};
  sequencerButtons: { [key: string]: HTMLButtonElement[][] } = {};
  activeColumns: { [key: string]: number | null } = {};
  keyButtons: HTMLButtonElement[] = [];
  padButtons: HTMLButtonElement[] = [];
  elementEditorToggle = document.createElement("button");
  channelRails: {
    [key: string]: {
      element: HTMLDivElement;
      solo: HTMLButtonElement;
      mute: HTMLButtonElement;
    };
  } = {};
  channelWrappers: { [key: string]: HTMLDivElement } = {};
  padsRail: HTMLDivElement | null = null;
  sequencers: Sequencer[] = [];
  keys: Keyboard;
  elementKeys = document.createElement("div");
  elementPads = document.createElement("div");
  style = document.createElement("style");
  theme: RendererTheme;
  core: MachineCore;
  rendererEventHandler: RendererEventHandler;

  constructor({
    theme,
    core,
    element,
    sequencers,
    keys,
    rendererEventHandler,
  }: {
    theme: RendererTheme;
    core: MachineCore;
    element: HTMLElement;
    sequencers: Sequencer[];
    keys: Keyboard;
    rendererEventHandler: RendererEventHandler;
  }) {
    this.core = core;
    this.elementRoot = element;
    this.elementRoot.appendChild(this.elementMain);
    this.elementRoot.appendChild(this.style);
    this.sequencers = sequencers;
    this.keys = keys;
    this.setTheme(theme);
    this.rendererEventHandler = rendererEventHandler;
    this.initializeEditorToggle();
    this.initializeSequencers();
    this.attachPadsChannel();
    this.attachKeysChannel();
    this.initializePads();
    this.initializeKeys();
  }

  initializeEditorToggle() {
    this.elementEditorToggle.id = "editor-toggle";
    this.elementEditorToggle.setAttribute("aria-label", "Toggle editor");
    this.elementEditorToggle.addEventListener("click", () =>
      this.rendererEventHandler("TAP", "EDITOR", 0)
    );
  }

  // Every row owns a slot on the right rail: sequencers and keys get a
  // stacked solo/mute pair, the pads row gets the editor toggle.
  private createChannelWrapper(key: string, section: HTMLElement) {
    const wrapper = document.createElement("div");
    wrapper.className = "channel";
    wrapper.appendChild(section);
    this.elementMain.appendChild(wrapper);
    this.channelWrappers[key] = wrapper;
    return wrapper;
  }

  private createSoloMuteRail(key: string, channelIndex: number, theme: number) {
    const rail = document.createElement("div");
    rail.className = `channel-rail theme-key-${theme}`;
    const solo = this.createButton("TAP", "SOLO", channelIndex);
    solo.className = "rail-solo";
    solo.setAttribute("aria-label", `Solo ${key}`);
    const mute = this.createButton("TAP", "MUTE", channelIndex);
    mute.className = "rail-mute";
    mute.setAttribute("aria-label", `Mute ${key}`);
    rail.appendChild(solo);
    rail.appendChild(mute);
    this.channelRails[key] = { element: rail, solo, mute };
    return rail;
  }

  private attachPadsChannel() {
    const wrapper = this.createChannelWrapper("pads", this.elementPads);
    const rail = document.createElement("div");
    rail.className = `channel-rail theme-key-${this.core.theme}`;
    rail.appendChild(this.elementEditorToggle);
    wrapper.appendChild(rail);
    this.padsRail = rail;
  }

  private attachKeysChannel() {
    const wrapper = this.createChannelWrapper("keys", this.elementKeys);
    wrapper.appendChild(
      this.createSoloMuteRail("keys", this.sequencers.length, this.keys.theme)
    );
  }

  updateChannelStates(states: RendererChannelState[]) {
    states.forEach(({ key, muted, soloed, audible }) => {
      const rail = this.channelRails[key];
      if (!rail) return;
      rail.solo.toggleAttribute("engaged", soloed);
      rail.mute.toggleAttribute("engaged", muted);
      this.channelWrappers[key]?.toggleAttribute("silenced", !audible);
    });
  }

  setEditorOpen(open: boolean) {
    if (open) {
      this.elementEditorToggle.setAttribute("open", "");
    } else {
      this.elementEditorToggle.removeAttribute("open");
    }
  }

  // Rainbow mode is a compositor-friendly CSS hue-rotate animation — updating
  // a hue custom property from script forced a full-page style recalc per frame.
  toggleHueRotate() {
    this.hueRotate = !this.hueRotate;
    document.documentElement.classList.toggle("rainbow", this.hueRotate);
    return this.hueRotate;
  }

  update({
    theme,
    core,
    sequencers,
    keys,
  }: {
    theme: RendererTheme;
    core: MachineCore;
    sequencers: Sequencer[];
    keys: Keyboard;
  }) {
    this.core = core;
    this.sequencers = sequencers;
    this.keys = keys;
    this.elementMain.innerHTML = "";
    this.elementRoot.appendChild(this.style);
    this.setTheme(theme);
    this.initializeSequencers();
    this.attachPadsChannel();
    this.attachKeysChannel();
    this.handleStepsSizeChange();
    this.refreshTheme();
  }

  updateThemeColors(
    index: number,
    type: "a" | "b" | "c",
    value: RendererThemeLCH
  ) {
    const theme = this.theme;
    theme.colors[index][type] = value;
    this.setTheme(theme);
  }

  removeThemeColors(index: number) {
    const theme = this.theme;
    this.sequencers.forEach((sequencer) => {
      if (sequencer.theme === index) {
        sequencer.theme = 0;
      }
    });
    if (this.keys.theme === index) {
      this.keys.theme = 0;
    }
    if (this.core.theme === index) {
      this.core.theme = 0;
    }
    theme.colors.splice(index, 1);
    this.setTheme(theme);
    this.refreshTheme();
  }

  duplicateThemeColors(index: number) {
    const theme = this.theme;
    theme.colors.push({ ...theme.colors[index] });
    this.setTheme(theme);
  }

  updateThemeLayoutPads(value: RendererThemeSizesPads) {
    this.setTheme({ ...this.theme, sizes: { pads: value } });
  }

  setTheme(theme: RendererTheme) {
    // Older saved states carry a `prompt` size group; the prompt is no longer
    // themeable, so drop it rather than let it set stale custom properties.
    this.theme = { colors: theme.colors, sizes: { pads: theme.sizes.pads } };
    theme = this.theme;

    function setProperty(property: string, value: number) {
      document.documentElement.style.setProperty(property, value.toString());
    }

    function setColor(prefix: string[], color: RendererThemeLCH) {
      setProperty(`--color-${prefix.join("-")}-lit`, color.l);
      setProperty(`--color-${prefix.join("-")}-chr`, color.c);
      setProperty(`--color-${prefix.join("-")}-hue`, color.h);
    }

    // TODO: This clearing of theme is overkill, but fix for the fact that themes can be added and removed;
    const rules: string[] = [];
    theme.colors.forEach((color, i) => {
      for (let item in color) {
        setColor([i.toString(), item], theme.colors[i][item]);
      }
      rules.push(this.themeRule(`theme-key-${i}`, `${i}`));
    });
    this.style.textContent = rules.join("\n");

    for (let type in theme.sizes) {
      const object = theme.sizes[type];
      for (let key in object) {
        const token = key
          .replace(/([^a-z])/g, "-$1")
          .split("-")
          .filter(Boolean)
          .join("-")
          .toLowerCase();
        setProperty(`--${type}-${token}-factor`, object[key]);
      }
    }
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

  themeRule(themeClassName: string, propertyPrefix: string) {
    const properties = ["b", "a", "c"].flatMap((type) =>
      ["lit", "chr", "hue"].map(
        (lch) =>
          `--color-${type}-${lch}: var(--color-${propertyPrefix}-${type}-${lch})`
      )
    );
    return `.${themeClassName} { ${properties.join("; ")} }`;
  }

  refreshTheme() {
    this.sequencers.forEach((sequencer) => {
      const element = this.sequencerElements[sequencer.key];
      element.id = `sequencer-${sequencer.key}`;
      element.className = `sequencer sequencer-${
        sequencer.isDrum() ? "drum" : "synth"
      } theme-key-${sequencer.theme}`;
      const rail = this.channelRails[sequencer.key];
      if (rail) {
        rail.element.className = `channel-rail theme-key-${sequencer.theme}`;
      }
    });
    this.elementKeys.className = `theme-key-${this.keys.theme}`;
    this.elementPads.className = `theme-key-${this.core.theme}`;
    const keysRail = this.channelRails["keys"];
    if (keysRail) {
      keysRail.element.className = `channel-rail theme-key-${this.keys.theme}`;
    }
    if (this.padsRail) {
      this.padsRail.className = `channel-rail theme-key-${this.core.theme}`;
    }
  }

  initializeSequencers() {
    this.sequencerElements = {};
    this.sequencerButtons = {};
    this.activeColumns = {};
    this.channelRails = {};
    this.channelWrappers = {};
    this.sequencers.forEach((sequencer, index) => {
      const element = document.createElement("div");
      element.id = `sequencer-${sequencer.key}`;
      element.className = `sequencer sequencer-${
        sequencer.isDrum() ? "drum" : "synth"
      } theme-key-${sequencer.theme}`;
      const wrapper = this.createChannelWrapper(sequencer.key, element);
      wrapper.appendChild(
        this.createSoloMuteRail(sequencer.key, index, sequencer.theme)
      );
      this.sequencerElements[sequencer.key] = element;
    });
  }

  initializeKeys() {
    this.elementKeys.id = "keys";
    this.elementKeys.classList.add(`theme-key-${this.keys.theme}`);
    this.keyButtons = [];
    for (let i = 0; i < 24; i++) {
      const key = document.createElement("button");
      this.keyButtons.push(key);
      key.addEventListener("click", () => {
        this.rendererEventHandler("TAP", "KEYS", i);
      });
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
    this.elementPads.classList.add(`theme-key-${this.core.theme}`);
    this.padButtons = [];
    for (let i = 0; i < 8; i++) {
      const pad = this.createButton("TAP", "PADS", i);
      this.padButtons.push(pad);
      this.elementPads.appendChild(pad);
      pad.setAttribute("state", i === 7 ? "1/4" : "0");
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
      button.click();
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
    this.elementMain.querySelectorAll("button").forEach((button) => {
      // Rail controls (solo/mute, editor toggle) are chrome rather than part
      // of the instrument's face — including them painted stray bars and
      // stretched the captured bounds.
      if (button.closest(".channel-rail")) return;
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
    // The whole canvas, not just the button bounds — the padding ring was
    // left transparent, which flattens to white wherever the export lands.
    context.fillRect(0, 0, canvas.width, canvas.height);

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
      this.keys.notes.currentModeSteps();
    this.keyButtons.forEach((button, step) => {
      if (!stepsForScale.includes(step)) {
        button.removeAttribute("step");
      } else if (stepsForRoot.includes(step)) {
        button.setAttribute("step", "root");
      } else if (stepsForInterval.includes(step)) {
        button.setAttribute("step", "interval");
      } else {
        button.setAttribute("step", "scale");
      }
    });
    this.updateKeyboardActives();
  }

  updateKeyboardActives() {
    const { mainStep, ghostSteps } = this.keys;
    this.keyButtons.forEach((button) => button.removeAttribute("active"));
    if (mainStep !== null) {
      this.keyButtons[mainStep]?.setAttribute("active", "main");
      ghostSteps.forEach((ghostStep) => {
        this.keyButtons[ghostStep]?.setAttribute("active", "ghost");
      });
    }
  }

  updatePads(activeInterval: number) {
    this.padButtons.forEach((pad, i) => {
      if (i === 7) return;
      pad.setAttribute("state", "0");
      pad.removeAttribute("active");
    });
    const activePad = this.padButtons[activeInterval];
    activePad?.setAttribute("state", "4/4");
    activePad?.setAttribute("active", "");
  }

  updateStep(
    sequencerKey: string,
    row: number,
    col: number,
    state: StepsSlot,
    stateMax: StepsSlot
  ) {
    const button = this.sequencerButtons[sequencerKey]?.[row]?.[col];
    button?.setAttribute("state", state ? `${state}/${stateMax}` : `${state}`);
  }

  updateSteps() {
    this.sequencers.forEach((sequencer) =>
      sequencer.steps.rows.forEach((stepRow, row) => {
        stepRow.slots.forEach((step, col) => {
          this.updateStep(sequencer.key, row, col, step, sequencer.steps.max);
        });
      })
    );
  }

  handleStepsSizeChange() {
    Object.values(this.sequencerElements).forEach(
      (element) => (element.innerHTML = "")
    );
    this.sequencerButtons = {};
    this.activeColumns = {};
    let xMax = 0;
    let yMax = 0;
    this.sequencers.forEach((sequencer) => {
      xMax = Math.max(sequencer.steps.size, xMax);
      yMax = Math.max(sequencer.steps.rows.length, yMax);
      this.sequencerButtons[sequencer.key] = [];
      this.activeColumns[sequencer.key] = null;
    });

    for (let rowIndex = 0; rowIndex < yMax; rowIndex++) {
      const rows: (HTMLDivElement | null)[] = [];

      this.sequencers.forEach((sequencer, i) => {
        const row =
          rowIndex < sequencer.steps.rows.length
            ? document.createElement("div")
            : null;
        rows[i] = row;
        if (row) {
          this.sequencerElements[sequencer.key].appendChild(row);
          this.sequencerButtons[sequencer.key][rowIndex] = [];
        }
      });

      for (let colIndex = 0; colIndex < xMax; colIndex++) {
        this.sequencers.forEach((sequencer, i) => {
          if (rows[i] && colIndex < sequencer.steps.size) {
            const button = this.createButton(
              "TAP",
              sequencer.key,
              rowIndex,
              colIndex
            );
            rows[i].appendChild(button);
            this.sequencerButtons[sequencer.key][rowIndex][colIndex] = button;
          }
        });
      }
    }
    this.updateSteps();
  }

  renderStep(position: number) {
    this.sequencers.forEach((sequencer) => {
      const rows = this.sequencerButtons[sequencer.key];
      if (!rows || !rows[0] || !rows[0].length) return;
      const col = position % rows[0].length;
      const previous = this.activeColumns[sequencer.key];
      if (previous === col) return;
      rows.forEach((rowButtons) => {
        if (previous !== null && previous !== undefined) {
          rowButtons[previous]?.removeAttribute("active");
        }
        rowButtons[col]?.setAttribute("active", "true");
      });
      this.activeColumns[sequencer.key] = col;
    });
  }

  clearActives() {
    Object.entries(this.sequencerButtons).forEach(([key, rows]) => {
      rows.forEach((rowButtons) =>
        rowButtons.forEach((button) => button.removeAttribute("active"))
      );
      this.activeColumns[key] = null;
    });
  }

  stop() {
    this.elementMain.removeAttribute("stepping");
    const togglePad = this.padButtons[7];
    togglePad?.setAttribute("state", "1/4");
    togglePad?.removeAttribute("active");
    this.clearActives();
  }

  start() {
    this.elementMain.setAttribute("stepping", "true");
    const togglePad = this.padButtons[7];
    togglePad?.setAttribute("state", "4/4");
    togglePad?.setAttribute("active", "");
  }
}
