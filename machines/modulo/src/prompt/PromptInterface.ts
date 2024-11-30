import {
  DestinationPropertyInput,
  DestinationPropertyInputFormatter,
} from "../Destinations";
import { COMMANDS, Prompt } from "./Prompt";
import { PromptSuggestions } from "./PromptSuggestions";
import { PromptInfo } from "./PromptInfo";
import { PromptPropertyForm } from "./PromptPropertyForm";

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
  private suggestions: PromptSuggestions;
  private info: PromptInfo;
  private propertyForm?: PromptPropertyForm;
  private filterBuffer = "";

  constructor() {
    super();
    this.state = new PromptInterfaceState();
  }

  initialize(parent: HTMLElement, prompt: Prompt) {
    this.prompt = prompt;
    this.render();
    this.setupComponents();
    this.setupGlobalKeyboardListener();
    parent.appendChild(this);
    this.updateSuggestions();
    return this;
  }

  private render() {
    this.id = "prompt";
    this.innerHTML = `
      <prompt-suggestions></prompt-suggestions>
      <prompt-info></prompt-info>
    `;

    this.suggestions = this.querySelector("prompt-suggestions")!;
    this.info = this.querySelector("prompt-info")!;
  }

  private setupComponents() {
    this.suggestions.configure({
      onBack: () => this.handleBack(),
      onSelect: (token, type) => this.handleSuggestionSelection(token, type),
    });

    document.body.addEventListener("keyup", (e) => {
      if (e.key === "Escape") {
        this.toggle();
      }
    });
  }

  private setupGlobalKeyboardListener() {
    document.addEventListener("keydown", (e) => {
      if (!this.classList.contains("open")) return;

      // Check if we're in an input field
      const activeElement = document.activeElement;
      const isInInput =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement;

      if (e.key === "Backspace" && !isInInput) {
        e.preventDefault();
        this.handleBack();
        return;
      }

      // Handle single character inputs for filtering
      if (e.key.length === 1 && !isInInput) {
        // Get current suggestions to check if character would match anything
        const output = this.prompt.getNextSuggestions(
          this.filterBuffer + e.key.toLowerCase()
        );
        const suggestions = output.suggestions;

        if (!suggestions) return;

        // Check if the character would match any available options
        const wouldMatch =
          suggestions.destinations.some((dest) =>
            dest.startsWith(this.filterBuffer + e.key.toLowerCase())
          ) ||
          suggestions.commands.some((cmd) =>
            cmd.startsWith(this.filterBuffer + e.key.toLowerCase())
          ) ||
          suggestions.properties.some((prop) =>
            prop.startsWith(this.filterBuffer + e.key.toLowerCase())
          );

        if (wouldMatch) {
          e.preventDefault();
          this.handleFilterInput(e.key);
        }
      }
    });
  }

  private handleFilterInput(char: string) {
    this.filterBuffer += char.toLowerCase();
    this.updateSuggestions();
  }

  private handleBack() {
    if (this.filterBuffer) {
      this.filterBuffer = this.filterBuffer.slice(0, -1);
      this.updateSuggestions();
    } else {
      this.handleSuggestionSelection(COMMANDS.BACK[0], "command");
      this.clearPropertyForm();
    }
  }

  toggle() {
    this.classList.toggle("open");
    if (this.classList.contains("open")) {
      this.filterBuffer = "";
      this.updateSuggestions();
    }
  }

  reset(parent: HTMLElement) {
    parent.appendChild(this);
    this.updateSuggestions();
  }

  private handleSuggestionSelection(value: string, type: string) {
    if (type === "command" || type === "destination") {
      const result = this.prompt.handleCommandString(value);
      if (result.output) {
        console.log("Command output:", result.output);
      }
      this.filterBuffer = "";
      this.info.updateBreadcrumbs(this.prompt.destinationKeys.join("/") || "");
      this.renderDestinationInfo();
      this.clearPropertyForm();
    } else if (type === "property") {
      const output = this.prompt.getNextSuggestions(value);
      if (output.suggestions?.properties.includes(value)) {
        const index = output.suggestions.properties.indexOf(value);
        this.renderPropertyForm(
          value,
          output.suggestions.propertyInputs[index],
          output.suggestions.propertyInputsFormatters[index]
        );
      }
    }

    this.updateSuggestions();
  }

  private updateSuggestions() {
    const output = this.prompt.getNextSuggestions(this.filterBuffer);
    const key = this.prompt.lastDestinationKey;

    this.className = this.className.replace(/theme-key-[^ ]+/, "");
    if (key !== undefined) {
      this.classList.add(`theme-key-${key}`);
    }

    this.suggestions.update({
      suggestions: output.suggestions,
      lastMatch: new RegExp(`^(${this.filterBuffer})`),
      currentKey: key,
      filterText: this.filterBuffer,
    });
  }

  private clearPropertyForm() {
    if (this.propertyForm) {
      this.propertyForm.remove();
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
      const result = this.prompt.handleCommandString(`${property} ${value}`);
      if (result.output) {
        console.log("Command output:", result.output);
      }
      this.renderDestinationInfo();
    });

    this.clearPropertyForm();
    this.insertBefore(form, this.info);
    this.propertyForm = form;
  }

  public renderDestinationInfo() {
    this.info.update(this.prompt.currentDestination.info);
  }
}
