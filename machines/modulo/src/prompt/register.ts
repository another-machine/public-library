import { PromptFormInputSelect } from "./PromptFormInputSelect";
import { PromptFormInputStepNumber } from "./PromptFormInputStepNumber";
import { PromptInfo } from "./PromptInfo";
import { PromptInput } from "./PromptInput";
import { PromptInterface } from "./PromptInterface";
import { PromptPropertyForm } from "./PromptPropertyForm";
import { PromptSuggestions } from "./PromptSuggestions";

export default function register() {
  customElements.define("prompt-input", PromptInput);
  customElements.define("prompt-suggestions", PromptSuggestions);
  customElements.define("prompt-info", PromptInfo);
  customElements.define(
    "prompt-form-input-step-number",
    PromptFormInputStepNumber
  );
  customElements.define("prompt-form-input-select", PromptFormInputSelect);
  customElements.define("prompt-property-form", PromptPropertyForm);
  customElements.define("prompt-interface", PromptInterface);
}
