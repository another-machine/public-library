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

export class PromptInterface {
  $div: HTMLDivElement;
  $input: HTMLInputElement;
  $actions: HTMLDivElement;
  $back: HTMLButtonElement;
  $breadcrumbs: HTMLSpanElement;
  $info: HTMLDivElement;
  $result: HTMLDivElement;
  keydownBackspacing = false;
  prompt: Prompt;

  constructor(parent: HTMLElement, prompt: Prompt) {
    this.prompt = prompt;
    this.$div = document.createElement("div");
    this.$div.id = "prompt";
    this.$div.innerHTML = `
    <span class="breadcrumbs"></span>
    <div class="info"></div>
    <div class="result"></div>
    <div class="actions"></div>
    <div class="input"><button>&lt;</button><input type="text" /></div>
    `;
    parent.appendChild(this.$div);
    this.$input = this.$div.querySelector("input") as HTMLInputElement;
    this.$back = this.$div.querySelector(".input button") as HTMLButtonElement;
    this.$breadcrumbs = this.$div.querySelector(
      ".breadcrumbs"
    ) as HTMLSpanElement;
    this.$actions = this.$div.querySelector(".actions") as HTMLDivElement;
    this.$info = this.$div.querySelector(".info") as HTMLDivElement;
    this.$result = this.$div.querySelector(".result") as HTMLDivElement;
    this.$breadcrumbs.innerHTML = "";
    this.$input.addEventListener("blur", this.handleBlur.bind(this));
    this.$input.addEventListener("focus", this.handleFocus.bind(this));
    this.$input.addEventListener("keydown", this.handleKeydown.bind(this));
    this.$input.addEventListener("keyup", this.handleKeyup.bind(this));
    this.$back.addEventListener("click", () => {
      if (this.$input.value === "") {
        this.handleSuggestionSelection(COMMANDS.BACK[0], "command");
      } else {
        this.$input.value = "";
        this.updateSuggestions();
      }
    });
    document.body.addEventListener("keyup", (e) => {
      if (e.key === "Escape") {
        this.$div.classList.toggle("open");
        if (this.$div.classList.contains("open")) {
          this.$input.focus();
        }
      }
    });
  }

  focus() {
    this.$input.focus();
  }

  reset(parent: HTMLElement) {
    parent.appendChild(this.$div);
    this.updateSuggestions();
  }

  handleAutoComplete() {
    const string = this.$input.value;
    const output = this.prompt.getNextSuggestions(string);
    if (output.valid && output.suggestions) {
      const { destinations, properties, commands } = output.suggestions;
      const values = [...destinations, ...commands, ...properties];
      const currentValue = string.split(" ");
      if (values[0]) {
        currentValue.pop();
        currentValue.push(values[0]);
        this.$input.value = currentValue.join(" ");
        this.updateSuggestions();
      }
    } else {
      console.log("nada");
    }
  }

  handleBlur(_event: FocusEvent) {
    // this is too quick, kills before buttons can be clicked
    // this.$actions.innerHTML = "";
  }

  handleFocus(_event: FocusEvent) {
    this.updateSuggestions();
  }

  handleKeydown(event: KeyboardEvent) {
    this.prompt.result = [];
    if (event.code === "ArrowUp") {
      event.preventDefault();
      const history = this.prompt.handleHistory(-1);
      this.$input.value = history;
    } else if (event.code === "ArrowDown") {
      event.preventDefault();
      const history = this.prompt.handleHistory(1);
      this.$input.value = history;
    } else if (event.code === "Tab") {
      event.preventDefault();
      this.handleAutoComplete();
    } else if (event.code === "Backspace" && !this.$input.value) {
      this.keydownBackspacing = true;
    }
  }

  handleKeyup(event: KeyboardEvent) {
    this.$result.classList.remove("invalid");
    if (event.code === "Enter") {
      event.preventDefault();
      this.handleSubmit();
    } else if (event.code === "Slash") {
      event.preventDefault();
      const value = this.$input.value.split("/").join("");
      if (this.prompt.currentDestination.destinations[value]) {
        this.$input.value = this.$input.value.split("/").join("");
        this.handleSubmit();
      }
    } else if (this.keydownBackspacing) {
      this.handleSuggestionSelection(COMMANDS.BACK[0], "command");
    }
    this.keydownBackspacing = false;
    this.updateSuggestions();
  }

  handleSubmit() {
    const result = this.prompt.handleCommandString(this.$input.value);
    if (result.output) {
      this.prompt.result = result.output;
    }
    if (!result.valid) {
      this.$result.classList.add("invalid");
    }

    this.$input.value = "";
    const { destinationKeys } = this.prompt;
    this.$breadcrumbs.innerHTML = destinationKeys.join("/") || "";
    this.renderDestinationInfo();
  }

  handleSoftSubmit() {
    const result = this.prompt.handleCommandString(this.$input.value);
    if (result.output) {
      this.prompt.result = result.output;
    }
    this.renderDestinationInfo();
  }

  handleSuggestionSelection(value: string, type: string) {
    this.$result.classList.remove("invalid");
    const string = this.$input.value;
    const currentValue = string.split(" ");
    currentValue.pop();
    currentValue.push(value);
    this.$input.value = currentValue.join(" ");
    if (type === "command" || type === "destination") {
      this.handleSubmit();
    } else {
      this.updateSuggestions();
    }
    this.focus();
  }

  updateSuggestions() {
    const lastMatch = this.prompt.getMatchableRegexForLastToken(
      this.$input.value
    );
    this.$div.className = this.$div.className.replace(/theme-key-[^ ]+/, "");
    const output = this.prompt.getNextSuggestions(this.$input.value);
    const key = this.prompt.lastDestinationKey;
    if (key !== undefined) {
      this.$div.classList.add(`theme-key-${key}`);
    }
    this.$result.innerHTML = this.prompt.result.join("");

    this.$actions.innerHTML = "";
    const makeToken = (
      token: string,
      type: string,
      prefix = "",
      suffix = ""
    ) => {
      const button = document.createElement("button");
      button.innerHTML = [
        prefix,
        token.replace(lastMatch, "<strong>$1</strong>"),
        suffix,
      ].join("");
      button.setAttribute("prompt-token", token);
      button.setAttribute("prompt-type", type);
      this.$actions.appendChild(button);
      button.addEventListener("click", (_e) => {
        const token = button.getAttribute("prompt-token") || "";
        const type = button.getAttribute("prompt-type") || "";
        this.handleSuggestionSelection(token, type);
      });
      return button;
    };
    if (output.suggestions) {
      const totalCount =
        output.suggestions.destinations.length +
        output.suggestions.commands.length +
        output.suggestions.properties.length;
      if (totalCount === 0) {
        this.$result.innerHTML = "Nothing.";
      }
      output.suggestions.destinations.forEach((a, i) => {
        const button = makeToken(a, "destination", "", "/");
        const key = output.suggestions!.destinationKeys[i];
        if (key !== undefined) {
          button.classList.add(`theme-key-${key}`);
        }
        // This eagerly shows destination info. not sure if thats necessary
        // if (totalCount === 1) {
        //   const info = output.suggestions!.destinationInfos[i];
        //   this.$info.innerHTML = this.formatInfo(info);
        // }
      });
      output.suggestions.commands.forEach((a, i) => {
        makeToken(a, "command");
        if (totalCount === 1) {
          this.$result.innerHTML = output.suggestions!.commandDescriptions[i];
        }
      });
      output.suggestions.properties.forEach((a, i) => {
        makeToken(a, "property");
        if (totalCount === 1) {
          this.renderInputs(
            a,
            output.suggestions!.propertyInputs[i],
            output.suggestions!.propertyInputsFormatters[i]
          );
        }
      });
    }
  }

  public renderInputs(
    property: string,
    inputs: DestinationPropertyInput[],
    formatter: DestinationPropertyInputFormatter
  ) {
    this.$result.innerHTML = "<form></form>";
    const $form = this.$result.querySelector("form") as HTMLFormElement;
    const $inputs: (HTMLInputElement | HTMLSelectElement)[] = [];
    inputs.forEach((input) => {
      const $field = document.createElement("div");
      $field.className = "field";
      $form.appendChild($field);
      if (input.type === "select") {
        const $select = document.createElement("select");
        $inputs.push($select);
        $select.innerHTML = input.options
          .map(
            (option) => `<option value="${option}">${option || "None"}</option>`
          )
          .join("\n");
        $select.value = input.initialValue();
        $select.addEventListener("change", () => {
          this.$input.value = [
            property,
            formatter($inputs.map((a) => a.value)),
          ].join(" ");
          this.prompt.handleCommandString(this.$input.value);
          this.handleSoftSubmit();
        });
        $field.appendChild($select);
      } else {
        const stepsOptions = {
          sm: [0.001, 0.01, 0.05],
          md: [1],
          lg: [1, 10, 25],
        };
        const $control = document.createElement("div");
        const $input = document.createElement("input");
        $inputs.push($input);
        const diff = input.max - input.min;
        const steps =
          diff < 3
            ? stepsOptions.sm
            : diff < 10
            ? stepsOptions.md
            : stepsOptions.lg;
        $input.setAttribute("type", "number");
        $input.setAttribute("step", steps[0].toString());
        $input.setAttribute("min", input.min.toString());
        $input.setAttribute("max", input.max.toString());
        $input.value = input.initialValue();
        $input.addEventListener("change", () => {
          this.$input.value = [
            property,
            formatter($inputs.map((a) => a.value)),
          ].join(" ");
          this.prompt.handleCommandString(this.$input.value);
          this.handleSoftSubmit();
        });
        $field.appendChild($input);
        $field.appendChild($control);

        const createButton = (step: number) => {
          const $button = document.createElement("button");
          $button.setAttribute("type", "button");
          $control.appendChild($button);
          $button.innerText = step.toString();
          $button.addEventListener("click", () => {
            const val = parseFloat($input.value);
            $input.value = (
              Math.round(
                Math.min(input.max, Math.max(input.min, val + step)) * 10000
              ) / 10000
            ).toString();
            this.$input.value = [
              property,
              formatter($inputs.map((a) => a.value)),
            ].join(" ");
            this.prompt.handleCommandString(this.$input.value);
            this.handleSoftSubmit();
          });
        };

        steps.reverse().forEach((step) => createButton(step * -1));
        steps.reverse().forEach((step) => createButton(step));
      }
    });
  }

  public renderDestinationInfo() {
    this.$info.innerHTML = this.formatInfo(this.prompt.currentDestination.info);
  }

  private formatInfo(info: DestinationInfo | string) {
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
