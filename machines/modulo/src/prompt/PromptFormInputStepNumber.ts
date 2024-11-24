import { PromptFormInputBase } from "./PromptFormInputBase";

export class PromptFormInputStepNumber extends PromptFormInputBase {
  protected setupPromptPropertyFormState() {
    if (!this.formState || !this.key) return;

    this.formState.subscribe(this.key, (value: number) => {
      const input = this.querySelector("input");
      if (input) {
        (input as HTMLInputElement).value = value?.toString() || "";
      }
    });
  }

  protected render() {
    const min = this.getAttribute("min") || "0";
    const max = this.getAttribute("max") || "100";
    const step = this.getAttribute("step") || "1";
    const steps = (this.getAttribute("steps") || step)
      .split(",")
      .map((s) => parseFloat(s));
    const value = this.getAttribute("value") || "";

    this.innerHTML = `
      <div class="field">
        <input type="number" 
          min="${min}" 
          max="${max}" 
          step="${step}"
          value="${value}"
        />
        <div class="control">
          ${steps
            .reverse()
            .map(
              (s) => `<button type="button" data-step="-${s}">-${s}</button>`
            )
            .join("")}
          ${steps
            .reverse()
            .map((s) => `<button type="button" data-step="${s}">${s}</button>`)
            .join("")}
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  private setupEventListeners() {
    const input = this.querySelector("input");
    const buttons = this.querySelectorAll("button");

    input?.addEventListener("change", (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.formState?.publish(this.key, value);
    });

    buttons?.forEach((button) => {
      button.addEventListener("click", () => {
        if (!input) return;

        const step = parseFloat(button.dataset.step || "0");
        const currentValue = parseFloat(input.value || "0");
        const newValue = Math.round((currentValue + step) * 1000) / 1000;

        const min = parseFloat(input.min);
        const max = parseFloat(input.max);

        input.value = Math.min(max, Math.max(min, newValue)).toString();
        input.dispatchEvent(new Event("change"));
      });
    });
  }
}
