import { Destination } from "./Destinations";

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
    destinationDescriptions: string[];
    destinations: string[];
    propertyDescriptions: string[];
    properties: string[];
    commandDescriptions: string[];
    commands: string[];
  };
  info?: string[];
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
      destinationDescriptions,
      commands,
      commandDescriptions,
      properties,
      propertyDescriptions,
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
    const filteredDestinationDescriptions = filteredDestinations.map(
      (key) => destinationDescriptions[key]
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
    const filteredPropertyDescriptions = filteredProperties.map(
      (key) => propertyDescriptions[key]
    );

    const info = [currentDestination.description];
    return {
      valid: true,
      info,
      suggestions: {
        destinationKeys: filteredDestinationKeys,
        destinationDescriptions: filteredDestinationDescriptions,
        destinations: filteredDestinations,
        commandDescriptions: filteredCommandDescriptions,
        commands: filteredCommands,
        propertyDescriptions: filteredPropertyDescriptions,
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
  $span: HTMLSpanElement;
  $actions: HTMLDivElement;
  $info: HTMLDivElement;
  keydownBackspacing = false;
  prompt: Prompt;

  constructor(parent: HTMLElement, prompt: Prompt) {
    this.prompt = prompt;
    this.$div = document.createElement("div");
    this.$div.id = "prompt";
    this.$div.innerHTML = `
    <div class="input">
    <span></span>
    <input type="text" />
    </div>
    <div class="actions">
    </div>
    <div class="info"></div>
    `;
    parent.appendChild(this.$div);
    this.$input = this.$div.querySelector("input") as HTMLInputElement;
    this.$span = this.$div.querySelector("span") as HTMLSpanElement;
    this.$actions = this.$div.querySelector(".actions") as HTMLDivElement;
    this.$info = this.$div.querySelector(".info") as HTMLDivElement;
    this.$span.innerHTML = "$";
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
    this.$info.classList.remove("invalid");
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
      this.$info.classList.add("invalid");
    }

    this.$input.value = "";
    const { destinationKeys } = this.prompt;
    this.$span.innerHTML = destinationKeys.join("/") || "$";
  }

  handleSuggestionSelection(value: string, type: string) {
    this.$info.classList.remove("invalid");
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
    this.$info.innerHTML = (
      this.prompt.result.length ? this.prompt.result : output.info || []
    )
      .map((a) => `<span>${a}</span>`)
      .join("");

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
        this.$info.innerHTML = "Nothing.";
      }
      output.suggestions.destinations.forEach((a, i) => {
        const button = makeToken(a, "destination", "", "/");
        const key = output.suggestions!.destinationKeys[i];
        if (key !== undefined) {
          button.classList.add(`theme-key-${key}`);
        }
        if (totalCount === 1) {
          this.$info.innerHTML = output.suggestions!.destinationDescriptions[i];
        }
      });
      output.suggestions.commands.forEach((a, i) => {
        makeToken(a, "command");
        if (totalCount === 1) {
          this.$info.innerHTML = output.suggestions!.commandDescriptions[i];
        }
      });
      output.suggestions.properties.forEach((a, i) => {
        makeToken(a, "property");
        if (totalCount === 1) {
          this.$info.innerHTML = output.suggestions!.propertyDescriptions[i];
        }
      });
    }
  }
}
