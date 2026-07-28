import { COMMANDS, Prompt } from "./Prompt";
import { PromptSuggestions } from "./PromptSuggestions";
import { PromptOutput } from "./PromptOutput";
import { PromptLedger } from "./PromptLedger";

export class PromptInterface extends HTMLElement {
  private output: PromptOutput;
  private prompt: Prompt;
  private suggestions: PromptSuggestions;
  private ledger: PromptLedger;
  private filterBuffer = "";
  private onToggle?: (open: boolean) => void;

  public initialize(
    parent: HTMLElement,
    prompt: Prompt,
    callbacks?: {
      onToggle?: (open: boolean) => void;
      onTouch?: (label: string, value: string) => void;
    }
  ) {
    this.prompt = prompt;
    this.onToggle = callbacks?.onToggle;
    this.render();
    this.setupComponents();
    this.setupGlobalKeyboardListener();
    parent.appendChild(this);
    this.ledger.initialize(prompt, callbacks?.onTouch);
    this.updateSuggestions();
    this.renderBreadcrumbs();
    return this;
  }

  public handleBack() {
    if (this.prompt.destinationKeys.length === 0) {
      this.toggle();
    } else if (this.filterBuffer) {
      this.filterBuffer = this.filterBuffer.slice(0, -1);
      this.updateSuggestions();
    } else {
      this.handleSuggestionSelection(COMMANDS.BACK[0], "command");
    }
  }

  public renderDestinationInfo() {
    if (this.classList.contains("open")) {
      this.ledger.refreshValues();
    }
  }

  public reset(parent: HTMLElement) {
    parent.appendChild(this);
    this.ledger.render();
    this.updateSuggestions();
    this.renderBreadcrumbs();
  }

  public toggle() {
    this.classList.toggle("open");
    const open = this.classList.contains("open");
    if (open) {
      this.filterBuffer = "";
      this.ledger.render();
      this.updateSuggestions();
      this.renderBreadcrumbs();
    }
    if (this.onToggle) this.onToggle(open);
  }

  public updateTheme(theme: string) {
    this.className = this.className.replace(/theme-key-[^ ]+/, "");
    if (theme !== undefined) {
      this.classList.add(`theme-key-${theme}`);
    }
  }

  private render() {
    this.id = "prompt";
    this.innerHTML = `
      <prompt-suggestions></prompt-suggestions>
      <prompt-output></prompt-output>
      <prompt-ledger></prompt-ledger>
    `;
    this.output = this.querySelector("prompt-output")!;
    this.output.initialize();
    this.suggestions = this.querySelector("prompt-suggestions")!;
    this.ledger = this.querySelector("prompt-ledger")!;
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

  private handleSuggestionSelection(value: string, type: string) {
    if (type === "command" || type === "destination") {
      const result = this.prompt.handleCommandString(value);
      if (result.output) {
        console.log("Command output:", result.output);
      }
      this.filterBuffer = "";
      this.renderBreadcrumbs();
      this.ledger.render();
    }

    this.updateSuggestions();
  }

  private renderBreadcrumbs() {
    this.output.updateBreadcrumbs(this.prompt.destinationKeys.join("/") || "");
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
}
