import { PromptPropertyFormInputBase } from "./PromptPropertyFormInputBase";

export class PromptPropertyFormInputStepNumber extends PromptPropertyFormInputBase {
  protected setupPromptPropertyFormState() {
    if (!this.formState || !this.key) return;

    // First render the element
    // this.render();

    // Then publish initial value and set up subscription
    const initialValue = parseFloat(this.getAttribute("value") || "0");
    this.formState.publish(this.key, initialValue);

    // this.formState.subscribe(
    //   this.key,
    //   initialValue.toString(),
    //   (value: number) => {
    //     const input = this.querySelector("input");
    //     if (input) {
    //       input.value = value?.toString() || "";
    //     }
    //   }
    // );
  }

  public connectedCallback() {
    super.connectedCallback();
    // this.setupPromptPropertyFormState();
  }

  protected render() {
    const min = this.getAttribute("min") || "0";
    const max = this.getAttribute("max") || "100";
    const step = this.getAttribute("step") || "1";
    const steps = (this.getAttribute("steps") || step)
      .split(",")
      .map((s) => parseFloat(s));
    const value = this.getAttribute("value") || "";

    const renderStepButton = (step: number, count: number, string: string) =>
      `<button type="button" data-step="${step}">${"".padStart(
        count,
        string
      )}</button>`;

    const buttonsMinus = steps
      .reverse()
      .map((s, i) => renderStepButton(-s, steps.length - i, "-"))
      .join("");

    const buttonsAdd = steps
      .reverse()
      .map((s, i) => renderStepButton(s, i + 1, "+"))
      .join("");

    this.innerHTML = `
      <div class="control">
        ${buttonsMinus}
      </div>
      <input type="number"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${value}"
      />
      <div class="control">
        ${buttonsAdd}
      </div>
    `;

    this.setupEventListeners();
  }

  private setupEventListeners() {
    const input = this.querySelector("input")!;
    const buttons = this.querySelectorAll("button");

    input.addEventListener("change", () => {
      const value = parseFloat(input.value);
      this.formState?.publish(this.key, value);
    });

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const step = parseFloat(button.dataset.step || "0");
        const currentValue = parseFloat(input.value || "0");
        const newValue = Math.round((currentValue + step) * 10000) / 10000;
        const min = parseFloat(input.min);
        const max = parseFloat(input.max);
        input.value = Math.min(max, Math.max(min, newValue)).toString();
        input.dispatchEvent(new Event("change"));
      });
    });
  }
}
