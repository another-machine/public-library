import { PromptOutput } from "./Prompt";

export class PromptSuggestions extends HTMLElement {
  private lastMatch: RegExp | null = null;
  private back: HTMLButtonElement;
  private onBack: () => void;
  private onSelect: (token: string, type: string) => void;

  configure({
    onBack,
    onSelect,
  }: {
    onBack: () => void;
    onSelect: (token: string, type: string) => void;
  }) {
    this.onBack = onBack;
    this.onSelect = onSelect;
  }

  update({
    suggestions,
    lastMatch,
    currentKey,
    filterText,
  }: {
    suggestions: PromptOutput["suggestions"];
    lastMatch: RegExp;
    currentKey?: string;
    filterText: string;
  }) {
    this.lastMatch = lastMatch;
    this.innerHTML = `<button>${currentKey ? "&lt;" : "&times;"}</button>`;
    this.back = this.querySelector("button")!;
    this.back.addEventListener("click", () => this.onBack());

    if (!suggestions) return;

    // Properties are edited directly in the ledger, so only destinations and
    // commands appear as chips.
    const filteredDestinations = suggestions.destinations.filter(
      (dest) => !filterText || dest.startsWith(filterText)
    );
    const filteredCommands = suggestions.commands.filter(
      (cmd) => !filterText || cmd.startsWith(filterText)
    );

    const totalCount = filteredDestinations.length + filteredCommands.length;

    if (totalCount === 0) {
      return;
    }

    if (filterText && totalCount === 1) {
      const matchingItem = filteredDestinations[0] || filteredCommands[0];
      const type = filteredDestinations[0] ? "destination" : "command";

      this.onSelect(matchingItem, type);
    } else {
      // Render filtered suggestions
      filteredDestinations.forEach((dest, i) => {
        const button = this.makeToken(dest, "destination", "", "/");
        const key =
          suggestions.destinationKeys[suggestions.destinations.indexOf(dest)];
        if (key !== undefined) {
          button.classList.add(`theme-key-${key}`);
        }
        this.appendChild(button);
      });

      filteredCommands.forEach((cmd) => {
        this.appendChild(this.makeToken(cmd, "command"));
      });
    }
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
      this.onSelect(token, type);
    });
    return button;
  }
}
