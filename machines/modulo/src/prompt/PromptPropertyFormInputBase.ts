import { PromptPropertyFormState } from "./PromptPropertyFormState.ts";

export abstract class PromptPropertyFormInputBase extends HTMLElement {
  protected formState?: PromptPropertyFormState;
  protected key: string = "";

  connectedCallback() {
    this.key = this.getAttribute("key") || "";
    this.setupPromptPropertyFormState();
    this.render();
  }

  setPromptPropertyFormState(formState: PromptPropertyFormState) {
    this.formState = formState;
    this.setupPromptPropertyFormState();
  }

  protected abstract render(): void;
  protected abstract setupPromptPropertyFormState(): void;
}
