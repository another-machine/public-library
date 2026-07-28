import { PromptOutput } from "./PromptOutput";
import { PromptInterface } from "./PromptInterface";
import { PromptLedger } from "./PromptLedger";
import { PromptSuggestions } from "./PromptSuggestions";

export default function register() {
  if (customElements.get("prompt-suggestions")) return;
  customElements.define("prompt-suggestions", PromptSuggestions);
  customElements.define("prompt-output", PromptOutput);
  customElements.define("prompt-ledger", PromptLedger);
  customElements.define("prompt-interface", PromptInterface);
}
