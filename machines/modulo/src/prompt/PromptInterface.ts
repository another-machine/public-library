import {
  DestinationPropertyInput,
  DestinationPropertyInputFormatter,
} from "../destinations/Destination";
import { COMMANDS, Prompt } from "./Prompt";
import { PromptSuggestions } from "./PromptSuggestions";
import { PromptOutput } from "./PromptOutput";
import { PromptPropertyForm } from "./PromptPropertyForm";

export class PromptInterface extends HTMLElement {
  private output: PromptOutput;
  private prompt: Prompt;
  private suggestions: PromptSuggestions;
  private propertyForm?: PromptPropertyForm;
  private filterBuffer = "";

  constructor() {
    super();
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
      <prompt-output></prompt-output>
    `;

    this.suggestions = this.querySelector("prompt-suggestions")!;
    this.output = this.querySelector("prompt-output")!;
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

      if (e.shiftKey || e.metaKey || e.altKey || e.ctrlKey) {
        return;
      }

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

      if (e.key.length === 1 && !isInInput) {
        const output = this.prompt.getNextSuggestions(
          this.filterBuffer + e.key.toLowerCase()
        );
        const suggestions = output.suggestions;

        if (!suggestions) return;

        const wouldMatch =
          suggestions.destinations.some((dest) =>
            dest.startsWith(this.filterBuffer + e.key.toLowerCase())
          ) ||
          suggestions.commands.some((cmd) =>
            cmd.startsWith(this.filterBuffer + e.key.toLowerCase())
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

  handleBack() {
    if (this.prompt.destinationKeys.length === 0) {
      this.toggle();
    } else if (this.filterBuffer) {
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
      this.output.updateBreadcrumbs(
        this.prompt.destinationKeys.join("/") || ""
      );
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

    this.updateTheme(`${key}`);

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
    this.insertBefore(form, this.output);
    this.propertyForm = form;
  }

  public renderDestinationInfo() {
    this.output.update(this.prompt.currentDestination.info);
  }

  public updateTheme(theme: string) {
    this.className = this.className.replace(/theme-key-[^ ]+/, "");
    if (theme !== undefined) {
      this.classList.add(`theme-key-${theme}`);
    }
  }
}
