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
      const [value] = args;
      if (value) {
        return property.onSet(command, args, this);
      } else {
        return property.onGet(command, args, this);
      }
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
  $breadcrumbs: HTMLSpanElement;
  $info: HTMLDivElement;
  $description: HTMLDivElement;
  keydownBackspacing = false;
  prompt: Prompt;

  constructor(parent: HTMLElement, prompt: Prompt) {
    this.prompt = prompt;
    this.$div = document.createElement("div");
    this.$div.id = "prompt";
    this.$div.innerHTML = `
    <span class="breadcrumbs"></span>
    <div class="info"></div>
    <div class="description"></div>
    <div class="actions"></div>
    <div class="input"><input type="text" /></div>
    `;
    parent.appendChild(this.$div);
    this.$input = this.$div.querySelector("input") as HTMLInputElement;
    this.$breadcrumbs = this.$div.querySelector(
      ".breadcrumbs"
    ) as HTMLSpanElement;
    this.$actions = this.$div.querySelector(".actions") as HTMLDivElement;
    this.$info = this.$div.querySelector(".info") as HTMLDivElement;
    this.$description = this.$div.querySelector(
      ".description"
    ) as HTMLDivElement;
    this.$breadcrumbs.innerHTML = "";
    this.$input.addEventListener("blur", this.handleBlur.bind(this));
    this.$input.addEventListener("focus", this.handleFocus.bind(this));
    this.$input.addEventListener("keydown", this.handleKeydown.bind(this));
    this.$input.addEventListener("keyup", this.handleKeyup.bind(this));
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
    this.$description.classList.remove("invalid");
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
      this.$description.classList.add("invalid");
    }

    this.$input.value = "";
    const { destinationKeys } = this.prompt;
    this.$breadcrumbs.innerHTML = destinationKeys.join("/") || "";
    this.renderDestinationInfo();
  }

  handleSuggestionSelection(value: string, type: string) {
    this.$description.classList.remove("invalid");
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
    this.$description.innerHTML = this.prompt.result.join("");

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
        this.$description.innerHTML = "Nothing.";
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
          this.$description.innerHTML =
            output.suggestions!.commandDescriptions[i];
        }
      });
      output.suggestions.properties.forEach((a, i) => {
        makeToken(a, "property");
        if (totalCount === 1) {
          this.renderInputs(
            output.suggestions!.propertyInputs[i],
            output.suggestions!.propertyInputsFormatters[i]
          );
        }
      });
    }
  }

  public renderInputs(
    inputs: DestinationPropertyInput[],
    formatter: DestinationPropertyInputFormatter
  ) {
    this.$description.innerHTML = "<form></form>";
    const $form = this.$description.querySelector("form") as HTMLFormElement;
    const $inputs = inputs.map((input) => {
      const $field = document.createElement("div");
      $form.appendChild($field);
      if (input.type === "select") {
        const $select = document.createElement("select");
        $select.innerHTML = input.options
          .map(
            (option) => `<option value="${option}">${option || "None"}</option>`
          )
          .join("\n");
        $select.value = input.initialValue();
        $field.appendChild($select);
        return $select;
      } else {
        const $control = document.createElement("div");
        const $input = document.createElement("input");
        const diff = input.max - input.min;
        const steps = [diff < 3 ? 0.001 : 1];
        if (diff < 3) {
          steps.push(0.01, 0.1);
        }
        if (diff > 10) {
          steps.push(5);
        }
        if (diff > 50) {
          steps.push(10);
        }
        if (diff > 100) {
          steps.push(25);
        }
        $input.setAttribute("type", "number");
        $input.setAttribute("step", steps[0].toString());
        $input.setAttribute("min", input.min.toString());
        $input.setAttribute("max", input.max.toString());
        $input.value = input.initialValue();
        $field.appendChild($input);
        $field.appendChild($control);
        steps.forEach((step) => {
          const $buttonMinus = document.createElement("button");
          $buttonMinus.setAttribute("type", "button");
          $control.appendChild($buttonMinus);
          $buttonMinus.innerText = `-${step}`;
          $buttonMinus.addEventListener("click", () => {
            const val = parseFloat($input.value);
            $input.value = Math.max(input.min, val - step).toString();
          });
          const $buttonAdd = document.createElement("button");
          $buttonAdd.setAttribute("type", "button");
          $control.appendChild($buttonAdd);
          $buttonAdd.innerText = `+${step}`;
          $buttonAdd.addEventListener("click", () => {
            const val = parseFloat($input.value);
            $input.value = Math.min(input.max, val + step).toString();
          });
        });
        return $input;
      }
    });
    const $buttonSubmit = document.createElement("button");
    $buttonSubmit.setAttribute("type", "submit");
    $buttonSubmit.innerText = "Update";
    $form.appendChild($buttonSubmit);
    $form.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = formatter($inputs.map(($input) => $input.value));
      console.log(value);
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
