import { PromptOutput } from "./Prompt";

export class PromptSuggestions extends HTMLElement {
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
