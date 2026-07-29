import { Prompt } from "./Prompt";
import { PromptLedger } from "./PromptLedger";

export class PromptInterface extends HTMLElement {
  private prompt!: Prompt;
  private ledger!: PromptLedger;
  private onToggle?: (open: boolean) => void;

  public initialize(
    parent: HTMLElement,
    prompt: Prompt,
    callbacks?: {
      onToggle?: (open: boolean) => void;
      onChange?: () => void;
    }
  ) {
    this.prompt = prompt;
    this.onToggle = callbacks?.onToggle;
    this.id = "prompt";
    this.innerHTML = `<prompt-ledger></prompt-ledger>`;
    this.ledger = this.querySelector("prompt-ledger")!;
    this.setupKeyboard();
    parent.appendChild(this);
    this.ledger.initialize(prompt, callbacks?.onChange, () => this.toggle());
    return this;
  }

  /** Re-read the destination tree — used after it is rebuilt. */
  public refresh() {
    this.ledger.render();
  }

  /** Kept for destination commands that restructure the tree as a side effect. */
  public handleBack() {
    this.refresh();
  }

  public renderDestinationInfo() {
    if (this.classList.contains("open")) {
      this.ledger.refreshValues();
    }
  }

  public reset(parent: HTMLElement) {
    parent.appendChild(this);
    this.ledger.render();
  }

  public toggle() {
    this.classList.toggle("open");
    const open = this.classList.contains("open");
    if (open) this.ledger.render();
    if (this.onToggle) this.onToggle(open);
  }

  private setupKeyboard() {
    document.body.addEventListener("keyup", (e) => {
      if (e.key === "Escape") this.toggle();
    });

    document.addEventListener("keydown", (e) => {
      if (!this.classList.contains("open")) return;
      if (e.shiftKey || e.metaKey || e.altKey || e.ctrlKey) return;

      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement
      ) {
        return;
      }

      // A single letter jumps to the first matching tab, keeping the
      // type-to-navigate feel of the old prompt.
      if (e.key.length === 1 && /[a-z0-9]/i.test(e.key)) {
        if (this.ledger.selectByPrefix(e.key.toLowerCase())) {
          e.preventDefault();
        }
      }
    });
  }
}
