import { PromptInterface } from "./PromptInterface";
import { PromptLedger } from "./PromptLedger";

export default function register() {
  if (customElements.get("prompt-ledger")) return;
  customElements.define("prompt-ledger", PromptLedger);
  customElements.define("prompt-interface", PromptInterface);
}
