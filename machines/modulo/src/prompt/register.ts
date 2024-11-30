import { PromptPropertyFormInputRange } from "./PromptPropertyFormInputRange";
import { PromptPropertyFormInputSelect } from "./PromptPropertyFormInputSelect";
import { PromptPropertyFormInputStepNumber } from "./PromptPropertyFormInputStepNumber";
import { PromptOutput } from "./PromptOutput";
import { PromptInterface } from "./PromptInterface";
import { PromptPropertyForm } from "./PromptPropertyForm";
import { PromptSuggestions } from "./PromptSuggestions";

export default function register() {
  customElements.define("prompt-suggestions", PromptSuggestions);
  customElements.define("prompt-output", PromptOutput);
  customElements.define(
    "prompt-form-input-range",
    PromptPropertyFormInputRange
  );
  customElements.define(
    "prompt-form-input-step-number",
    PromptPropertyFormInputStepNumber
  );
  customElements.define(
    "prompt-form-input-select",
    PromptPropertyFormInputSelect
  );
  customElements.define("prompt-property-form", PromptPropertyForm);
  customElements.define("prompt-interface", PromptInterface);
}
