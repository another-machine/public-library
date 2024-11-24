import {
  DestinationPropertyInput,
  DestinationPropertyInputFormatter,
} from "../Destinations";
import { COMMANDS, Prompt } from "./Prompt";
import { PromptSuggestions } from "./PromptSuggestions";
import { PromptFormInputSelect } from "./PromptFormInputSelect";
import { PromptInfo } from "./PromptInfo";
import { PromptInput } from "./PromptInput";
import { PromptPropertyForm } from "./PromptPropertyForm";
import { PromptFormInputStepNumber } from "./PromptFormInputStepNumber";

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

export class PromptInterface extends HTMLElement {
  private state: PromptInterfaceState;
  private prompt: Prompt;
  private input: PromptInput;
  private suggestions: PromptSuggestions;
  private info: PromptInfo;
  private breadcrumbs: HTMLSpanElement;
  private propertyForm?: PromptPropertyForm;

  constructor() {
    super();
    this.state = new PromptInterfaceState();
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
      <prompt-input></prompt-input>
      <prompt-suggestions></prompt-suggestions>
      <span class="breadcrumbs"></span>
      <prompt-info></prompt-info>
    `;

    this.breadcrumbs = this.querySelector(".breadcrumbs")!;
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
      console.log("Command output:", result.output);
    }
    if (!result.valid) {
      console.log("Invalid command");
    }

    this.input.value = "";
    this.breadcrumbs.innerHTML = this.prompt.destinationKeys.join("/") || "";
    this.renderDestinationInfo();
    if (this.propertyForm) {
      this.propertyForm.remove();
    }
  }

  private handleSoftSubmit() {
    const result = this.prompt.handleCommandString(this.input.value);
    if (result.output) {
      console.log("Command output:", result.output);
    }
    this.renderDestinationInfo();
  }

  private handleSuggestionSelection(value: string, type: string) {
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
          console.log(
            "Command description:",
            output.suggestions.commandDescriptions[0]
          );
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

    if (this.propertyForm) {
      this.propertyForm.remove();
    }
    this.insertBefore(form, this.breadcrumbs);
    this.propertyForm = form;
  }

  public renderDestinationInfo() {
    this.info.update(this.prompt.currentDestination.info);
  }
}
