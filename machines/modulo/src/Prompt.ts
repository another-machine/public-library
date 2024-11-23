import {
  Destination,
  DestinationInfo,
  DestinationPropertyInput,
  DestinationPropertyInputFormatter,
} from "./Destinations";

const escapedStringForRegex = (string: string) =>
  string.replace(/([^a-zA-Z\d])/g, "\\$1");

const COMMANDS = {
  BACK: ["back"],
  HOME: ["home", "exit", "$"],
};

export type PromptOutput = {
  valid: boolean;
  suggestions?: {
    destinationKeys: (string | undefined)[];
    destinationInfos: DestinationInfo[];
    destinations: string[];
    propertyInputs: DestinationPropertyInput[][];
    propertyInputsFormatters: ((values: string[]) => string)[];
    properties: string[];
    commandDescriptions: string[];
    commands: string[];
  };
  info?: DestinationInfo[];
  output?: string[];
};

export class Prompt {
  destination: Destination;
  destinationKeys: string[] = [];
  history: string[] = [];
  historyIndex = 0;
  lastDestinationKey?: string = undefined;
  result: string[] = [];

  constructor({ destination }: { destination: Destination }) {
    this.destination = destination;
  }

  get currentDestination(): Destination {
    let obj: Destination = this.destination;
    this.destinationKeys.forEach((key) => {
      if (key in obj.destinations) {
        obj = obj.destinations[key];
      }
    });
    return obj;
  }

  update({ destination }: { destination: Destination }) {
    this.destination = destination;
    this.handleDestination(COMMANDS.HOME[0], []);
  }

  getMatchableRegexForLastToken(string: string): RegExp {
    const commands = string.split(/ +/);
    const command = commands[commands.length - 1] || "";
    return new RegExp(`^(${escapedStringForRegex(command)})`);
  }

  getNextSuggestions(string: string): PromptOutput {
    const [command, ..._args] = string.trim().split(/ +/);
    const matchableCommand = new RegExp(`^${escapedStringForRegex(command)}`);
    const currentDestination = this.currentDestination;
    const {
      key,
      destinations,
      destinationKeys,
      destinationInfos,
      commands,
      commandDescriptions,
      properties,
      propertyInputs,
      propertyInputsFormatters,
    } = currentDestination.suggestions;

    if (this.destinationKeys.length === 0 || key !== undefined) {
      this.lastDestinationKey = key;
    }

    const filteredDestinations = destinations.filter((a) =>
      Boolean(a.match(matchableCommand))
    );
    const filteredDestinationKeys = filteredDestinations.map(
      (key) => destinationKeys[key]
    );
    const filteredDestinationInfos = filteredDestinations.map(
      (key) => destinationInfos[key]
    );
    const filteredCommands = commands.filter((a) =>
      Boolean(a.match(matchableCommand))
    );
    const filteredCommandDescriptions = filteredCommands.map(
      (key) => commandDescriptions[key]
    );
    const filteredProperties = properties.filter((a) =>
      Boolean(a.match(matchableCommand))
    );
    const filteredPropertyInputs = filteredProperties.map(
      (key) => propertyInputs[key]
    );
    const filteredPropertyInputFormatters = filteredProperties.map(
      (key) => propertyInputsFormatters[key]
    );

    const info = [currentDestination.info];
    return {
      valid: true,
      info,
      suggestions: {
        destinationKeys: filteredDestinationKeys,
        destinationInfos: filteredDestinationInfos,
        destinations: filteredDestinations,
        commandDescriptions: filteredCommandDescriptions,
        commands: filteredCommands,
        propertyInputs: filteredPropertyInputs,
        propertyInputsFormatters: filteredPropertyInputFormatters,
        properties: filteredProperties,
      },
    };
  }

  handleCommandString(string: string): PromptOutput {
    this.history.push(string);
    this.historyIndex = this.history.length;
    const [command, ...args] = string.trim().split(/ +/);
    if (!command) {
      return { valid: true };
    }
    return this.handleDestination(command, args);
  }

  handleDestination(command: string, args: string[]): PromptOutput {
    if (COMMANDS.BACK.includes(command)) {
      this.destinationKeys.pop();
      return { valid: true };
    }
    if (COMMANDS.HOME.includes(command)) {
      this.destinationKeys = [];
      return { valid: true };
    }

    const currentDestination = this.currentDestination;
    if (currentDestination.destinations[command]) {
      this.destinationKeys.push(command);
      return { valid: true };
    } else if (currentDestination.properties[command]) {
      const property = currentDestination.properties[command];
      return property.onSet(command, args, this);
    } else if (currentDestination.commands[command]) {
      return currentDestination.commands[command].onCommand(
        command,
        args,
        this
      );
    } else {
      console.log("else", command, args);
      return { valid: true };
    }
  }

  handleHistory(direction: -1 | 1) {
    if (direction === -1 && this.historyIndex > 0) {
      this.historyIndex--;
      return this.history[this.historyIndex];
    } else if (direction === 1 && this.historyIndex < this.history.length) {
      this.historyIndex++;
      return this.history[this.historyIndex] || "";
    }
    return this.history[this.historyIndex] || "";
  }
}

class PromptInterfaceState {
  private subscribers: Map<string, Function[]> = new Map();

  subscribe(event: string, callback: Function) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, []);
    }
    this.subscribers.get(event)?.push(callback);
    return () => this.unsubscribe(event, callback);
  }

  unsubscribe(event: string, callback: Function) {
    const callbacks = this.subscribers.get(event) || [];
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  publish(event: string, data: any) {
    const callbacks = this.subscribers.get(event) || [];
    callbacks.forEach((callback) => callback(data));
  }
}

class PromptInput extends HTMLElement {
  private input: HTMLInputElement | null = null;
  private backButton: HTMLButtonElement | null = null;
  private keydownBackspacing = false;
  private pendingConfig: {
    onSubmit: () => void;
    onBack: () => void;
    onKeydown: (event: KeyboardEvent) => void;
    onKeyup: (event: KeyboardEvent) => void;
    onFocus: () => void;
    onBlur: () => void;
    onInputClear: () => void;
  } | null = null;

  connectedCallback() {
    this.render();
    if (this.pendingConfig) {
      this.setupEventListeners(this.pendingConfig);
      this.pendingConfig = null;
    }
  }

  private render() {
    this.innerHTML = `
      <div class="input">
        <input type="text" />
        <button>&lt;</button>
      </div>
    `;
    this.input = this.querySelector("input");
    this.backButton = this.querySelector("button");
  }

  configure(config: {
    onSubmit: () => void;
    onBack: () => void;
    onKeydown: (event: KeyboardEvent) => void;
    onKeyup: (event: KeyboardEvent) => void;
    onFocus: () => void;
    onBlur: () => void;
    onInputClear: () => void;
  }) {
    if (!this.isConnected) {
      this.pendingConfig = config;
      return;
    }
    this.setupEventListeners(config);
  }

  private setupEventListeners(config: {
    onSubmit: () => void;
    onBack: () => void;
    onKeydown: (event: KeyboardEvent) => void;
    onKeyup: (event: KeyboardEvent) => void;
    onFocus: () => void;
    onBlur: () => void;
    onInputClear: () => void;
  }) {
    if (!this.input || !this.backButton) {
      console.error("PromptInput: Elements not found");
      return;
    }

    const {
      onSubmit,
      onBack,
      onKeydown,
      onKeyup,
      onFocus,
      onBlur,
      onInputClear,
    } = config;

    this.input.addEventListener("keydown", (e) => {
      if (e.code === "Backspace" && !this.input?.value) {
        this.keydownBackspacing = true;
      }
      onKeydown(e);
    });

    this.input.addEventListener("keyup", (e) => {
      if (e.code === "Enter") {
        e.preventDefault();
        onSubmit();
      } else if (this.keydownBackspacing) {
        onBack();
      }
      this.keydownBackspacing = false;
      onKeyup(e);
    });

    this.input.addEventListener("focus", () => onFocus());
    this.input.addEventListener("blur", () => onBlur());

    this.backButton.addEventListener("click", () => {
      if (this.input?.value === "") {
        onBack();
      } else if (this.input) {
        this.input.value = "";
        onInputClear();
      }
    });
  }

  focus() {
    this.input?.focus();
  }

  get value() {
    return this.input?.value ?? "";
  }

  set value(val: string) {
    if (this.input) {
      this.input.value = val;
    }
  }
}

// Suggestions/actions section
class PromptSuggestions extends HTMLElement {
  private lastMatch: RegExp | null = null;
  private onSelect?: (token: string, type: string) => void;

  configure({ onSelect }: { onSelect: (token: string, type: string) => void }) {
    this.onSelect = onSelect;
  }

  update({
    suggestions,
    lastMatch,
    currentKey,
  }: {
    suggestions: PromptOutput["suggestions"];
    lastMatch: RegExp;
    currentKey?: string;
  }) {
    this.lastMatch = lastMatch;
    this.innerHTML = "";

    if (!suggestions) return;

    const totalCount =
      suggestions.destinations.length +
      suggestions.commands.length +
      suggestions.properties.length;

    if (totalCount === 0) {
      this.innerHTML = "Nothing.";
      return;
    }

    suggestions.destinations.forEach((dest, i) => {
      const button = this.makeToken(dest, "destination", "", "/");
      const key = suggestions.destinationKeys[i];
      if (key !== undefined) {
        button.classList.add(`theme-key-${key}`);
      }
      this.appendChild(button);
    });

    suggestions.commands.forEach((cmd) => {
      this.appendChild(this.makeToken(cmd, "command"));
    });

    suggestions.properties.forEach((prop) => {
      this.appendChild(this.makeToken(prop, "property"));
    });
  }

  private makeToken(token: string, type: string, prefix = "", suffix = "") {
    const button = document.createElement("button");
    button.innerHTML = [
      prefix,
      token.replace(this.lastMatch!, "<strong>$1</strong>"),
      suffix,
    ].join("");
    button.setAttribute("prompt-token", token);
    button.setAttribute("prompt-type", type);
    button.addEventListener("click", () => {
      this.onSelect?.(token, type);
    });
    return button;
  }
}

// Info display section
class PromptInfo extends HTMLElement {
  update(info: DestinationInfo | string) {
    this.innerHTML = this.formatInfo(info);
  }

  private formatInfo(info: DestinationInfo | string): string {
    if (typeof info === "string") {
      return `<span>${info}</span>`;
    }

    const label = info.label || "";
    const content = info.content();

    return `${label ? `<span>${label}</span>` : ""}${content
      .map((c) => `<pre>${c}</pre>`)
      .join("\n")}`;
  }
}

export class PromptInterface extends HTMLElement {
  private state: PromptInterfaceState;
  private prompt: Prompt;
  private input: PromptInput;
  private suggestions: PromptSuggestions;
  private info: PromptInfo;
  private breadcrumbs: HTMLSpanElement;
  private result: HTMLDivElement;

  constructor() {
    super();
    this.state = new PromptInterfaceState();
  }

  static register() {
    if (!customElements.get("prompt-input")) {
      customElements.define("prompt-input", PromptInput);
    }
    if (!customElements.get("prompt-suggestions")) {
      customElements.define("prompt-suggestions", PromptSuggestions);
    }
    if (!customElements.get("prompt-info")) {
      customElements.define("prompt-info", PromptInfo);
    }
    if (!customElements.get("step-number-input")) {
      customElements.define("step-number-input", StepNumberInput);
    }
    if (!customElements.get("select-input")) {
      customElements.define("select-input", SelectInput);
    }
    if (!customElements.get("prompt-property-form")) {
      customElements.define("prompt-property-form", PromptPropertyForm);
    }
    if (!customElements.get("prompt-interface")) {
      customElements.define("prompt-interface", this);
    }
  }

  initialize(parent: HTMLElement, prompt: Prompt) {
    this.prompt = prompt;
    this.render();
    this.setupComponents();
    parent.appendChild(this);
    return this;
  }

  private render() {
    this.id = "prompt";
    this.innerHTML = `
      <span class="breadcrumbs"></span>
      <prompt-info></prompt-info>
      <div class="result"></div>
      <prompt-input></prompt-input>
      <prompt-suggestions></prompt-suggestions>
    `;

    this.breadcrumbs = this.querySelector(".breadcrumbs")!;
    this.result = this.querySelector(".result")!;
    this.input = this.querySelector("prompt-input")!;
    this.suggestions = this.querySelector("prompt-suggestions")!;
    this.info = this.querySelector("prompt-info")!;
  }

  private setupComponents() {
    // Configure input handling
    this.input.configure({
      onSubmit: () => this.handleSubmit(),
      onBack: () => this.handleSuggestionSelection(COMMANDS.BACK[0], "command"),
      onKeydown: (event) => {
        this.prompt.result = [];
        if (event.code === "ArrowUp") {
          event.preventDefault();
          this.input.value = this.prompt.handleHistory(-1);
        } else if (event.code === "ArrowDown") {
          event.preventDefault();
          this.input.value = this.prompt.handleHistory(1);
        } else if (event.code === "Tab") {
          event.preventDefault();
          this.handleAutoComplete();
        }
      },
      onKeyup: (event) => {
        this.result.classList.remove("invalid");
        if (event.code === "Slash") {
          event.preventDefault();
          const value = this.input.value.split("/").join("");
          if (this.prompt.currentDestination.destinations[value]) {
            this.input.value = value;
            this.handleSubmit();
          }
        }
        this.updateSuggestions();
      },
      onFocus: () => this.updateSuggestions(),
      onBlur: () => {},
      onInputClear: () => this.updateSuggestions(),
    });

    // Configure suggestions handling
    this.suggestions.configure({
      onSelect: (token, type) => this.handleSuggestionSelection(token, type),
    });

    // Setup escape key handler
    document.body.addEventListener("keyup", (e) => {
      if (e.key === "Escape") {
        this.toggle();
      }
    });
  }

  toggle() {
    this.classList.toggle("open");
    if (this.classList.contains("open")) {
      this.input.focus();
    }
  }

  focus() {
    this.input.focus();
  }

  reset(parent: HTMLElement) {
    parent.appendChild(this);
    this.updateSuggestions();
  }

  private handleAutoComplete() {
    const output = this.prompt.getNextSuggestions(this.input.value);
    if (output.valid && output.suggestions) {
      const { destinations, properties, commands } = output.suggestions;
      const values = [...destinations, ...commands, ...properties];
      const currentValue = this.input.value.split(" ");
      if (values[0]) {
        currentValue.pop();
        currentValue.push(values[0]);
        this.input.value = currentValue.join(" ");
        this.updateSuggestions();
      }
    }
  }

  private handleSubmit() {
    const result = this.prompt.handleCommandString(this.input.value);
    if (result.output) {
      this.prompt.result = result.output;
    }
    if (!result.valid) {
      this.result.classList.add("invalid");
    }

    this.input.value = "";
    this.breadcrumbs.innerHTML = this.prompt.destinationKeys.join("/") || "";
    this.renderDestinationInfo();
  }

  private handleSoftSubmit() {
    const result = this.prompt.handleCommandString(this.input.value);
    if (result.output) {
      this.prompt.result = result.output;
    }
    this.renderDestinationInfo();
  }

  private handleSuggestionSelection(value: string, type: string) {
    this.result.classList.remove("invalid");
    const currentValue = this.input.value.split(" ");
    currentValue.pop();
    currentValue.push(value);
    this.input.value = currentValue.join(" ");

    if (type === "command" || type === "destination") {
      this.handleSubmit();
    } else {
      this.updateSuggestions();
    }
    this.focus();
  }

  private updateSuggestions() {
    const lastMatch = this.prompt.getMatchableRegexForLastToken(
      this.input.value
    );
    this.className = this.className.replace(/theme-key-[^ ]+/, "");

    const output = this.prompt.getNextSuggestions(this.input.value);
    const key = this.prompt.lastDestinationKey;

    if (key !== undefined) {
      this.classList.add(`theme-key-${key}`);
    }

    this.result.innerHTML = this.prompt.result.join("");

    this.suggestions.update({
      suggestions: output.suggestions,
      lastMatch,
      currentKey: key,
    });

    if (output.suggestions) {
      const totalCount =
        output.suggestions.destinations.length +
        output.suggestions.commands.length +
        output.suggestions.properties.length;

      if (totalCount === 1) {
        if (output.suggestions.commands.length === 1) {
          this.result.innerHTML = output.suggestions.commandDescriptions[0];
        } else if (output.suggestions.properties.length === 1) {
          this.renderPropertyForm(
            output.suggestions.properties[0],
            output.suggestions.propertyInputs[0],
            output.suggestions.propertyInputsFormatters[0]
          );
        }
      }
    }
  }

  private renderPropertyForm(
    property: string,
    inputs: DestinationPropertyInput[],
    formatter: DestinationPropertyInputFormatter
  ) {
    const form = document.createElement(
      "prompt-property-form"
    ) as PromptPropertyForm;
    form.configure(inputs, formatter, (value) => {
      this.input.value = `${property} ${value}`;
      this.handleSoftSubmit();
    });

    this.result.innerHTML = "";
    this.result.appendChild(form);
  }

  public renderDestinationInfo() {
    this.info.update(this.prompt.currentDestination.info);
  }
}

class PromptPropertyFormState {
  private subscribers: Map<string, Function[]> = new Map();
  private values: Map<string, any> = new Map();

  subscribe(key: string, callback: Function) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }
    this.subscribers.get(key)?.push(callback);

    if (this.values.has(key)) {
      callback(this.values.get(key));
    }

    return () => this.unsubscribe(key, callback);
  }

  unsubscribe(key: string, callback: Function) {
    const callbacks = this.subscribers.get(key) || [];
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  publish(key: string, value: any) {
    this.values.set(key, value);
    const subscribers = this.subscribers.get(key) || [];
    subscribers.forEach((callback) => callback(value));
  }

  getAllValues() {
    return Object.fromEntries(this.values);
  }
}

abstract class BaseFormInput extends HTMLElement {
  protected formState?: PromptPropertyFormState;
  protected key: string = "";

  connectedCallback() {
    this.key = this.getAttribute("key") || "";
    this.setupPromptPropertyFormState();
    this.render();
  }

  setPromptPropertyFormState(formState: PromptPropertyFormState) {
    this.formState = formState;
    this.setupPromptPropertyFormState();
  }

  protected abstract render(): void;
  protected abstract setupPromptPropertyFormState(): void;
}

class StepNumberInput extends BaseFormInput {
  protected setupPromptPropertyFormState() {
    if (!this.formState || !this.key) return;

    this.formState.subscribe(this.key, (value: number) => {
      const input = this.querySelector("input");
      if (input) {
        (input as HTMLInputElement).value = value?.toString() || "";
      }
    });
  }

  protected render() {
    const min = this.getAttribute("min") || "0";
    const max = this.getAttribute("max") || "100";
    const step = this.getAttribute("step") || "1";
    const steps = (this.getAttribute("steps") || step)
      .split(",")
      .map((s) => parseFloat(s));
    const value = this.getAttribute("value") || "";

    this.innerHTML = `
      <div class="field">
        <input type="number" 
          min="${min}" 
          max="${max}" 
          step="${step}"
          value="${value}"
        />
        <div class="control">
          ${steps
            .reverse()
            .map(
              (s) => `<button type="button" data-step="-${s}">-${s}</button>`
            )
            .join("")}
          ${steps
            .reverse()
            .map((s) => `<button type="button" data-step="${s}">${s}</button>`)
            .join("")}
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  private setupEventListeners() {
    const input = this.querySelector("input");
    const buttons = this.querySelectorAll("button");

    input?.addEventListener("change", (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.formState?.publish(this.key, value);
    });

    buttons?.forEach((button) => {
      button.addEventListener("click", () => {
        if (!input) return;

        const step = parseFloat(button.dataset.step || "0");
        const currentValue = parseFloat(input.value || "0");
        const newValue = Math.round((currentValue + step) * 1000) / 1000;

        const min = parseFloat(input.min);
        const max = parseFloat(input.max);

        input.value = Math.min(max, Math.max(min, newValue)).toString();
        input.dispatchEvent(new Event("change"));
      });
    });
  }
}

class SelectInput extends BaseFormInput {
  protected setupPromptPropertyFormState() {
    if (!this.formState || !this.key) return;

    this.formState.subscribe(this.key, (value: string) => {
      const select = this.querySelector("select");
      if (select) {
        (select as HTMLSelectElement).value = value || "";
      }
    });
  }

  protected render() {
    const options = this.getAttribute("options")?.split(",") || [];
    const value = this.getAttribute("value") || "";

    this.innerHTML = `
      <div class="field">
        <select>
          ${options
            .map(
              (opt) => `
            <option value="${opt}" ${opt === value ? "selected" : ""}>
              ${opt || "None"}
            </option>
          `
            )
            .join("")}
        </select>
      </div>
    `;

    const select = this.querySelector("select");
    select?.addEventListener("change", (e) => {
      const value = (e.target as HTMLSelectElement).value;
      this.formState?.publish(this.key, value);
    });
  }
}

class PromptPropertyForm extends HTMLElement {
  private formState: PromptPropertyFormState;
  private inputs: DestinationPropertyInput[] = [];
  private formatter: DestinationPropertyInputFormatter;
  private onChangeCallback?: (formattedValue: string) => void;

  constructor() {
    super();
    this.formState = new PromptPropertyFormState();
    this.formatter = (values: string[]) => values.join(",");
  }

  configure(
    inputs: DestinationPropertyInput[],
    formatter: DestinationPropertyInputFormatter,
    onChange?: (formattedValue: string) => void
  ) {
    this.inputs = inputs;
    this.formatter = formatter;
    this.onChangeCallback = onChange;
    this.setupPromptPropertyFormState();
    this.render();
  }

  private setupPromptPropertyFormState() {
    this.inputs.forEach((_, index) => {
      this.formState.subscribe(`input-${index}`, () => {
        this.handleFormChange();
      });
    });
  }

  private handleFormChange() {
    const values = this.inputs.map(
      (_, index) =>
        this.formState.getAllValues()[`input-${index}`]?.toString() || ""
    );

    const formatted = this.formatter(values);
    this.onChangeCallback?.(formatted);
  }

  private createInputElement(
    input: DestinationPropertyInput,
    index: number
  ): HTMLElement {
    if (input.type === "select") {
      const element = document.createElement("select-input");
      element.setAttribute("key", `input-${index}`);
      element.setAttribute("options", input.options.join(","));
      element.setAttribute("value", input.initialValue());
      (element as any).setPromptPropertyFormState(this.formState);
      return element;
    } else {
      const element = document.createElement("step-number-input");
      element.setAttribute("key", `input-${index}`);
      element.setAttribute("min", input.min.toString());
      element.setAttribute("max", input.max.toString());

      const diff = input.max - input.min;
      let steps: number[];
      if (diff < 3) {
        steps = [0.001, 0.01, 0.05];
      } else if (diff < 25) {
        steps = [1];
      } else {
        steps = [1, 10, 25];
      }

      element.setAttribute("step", steps[0].toString());
      element.setAttribute("steps", steps.join(","));
      element.setAttribute("value", input.initialValue());
      (element as any).setPromptPropertyFormState(this.formState);
      return element;
    }
  }

  private render() {
    this.innerHTML = `<form></form>`;
    const form = this.querySelector("form");
    if (!form) return;

    form.addEventListener("submit", (e) => e.preventDefault());

    this.inputs.forEach((input, index) => {
      const inputElement = this.createInputElement(input, index);
      form.appendChild(inputElement);
    });
  }
}
