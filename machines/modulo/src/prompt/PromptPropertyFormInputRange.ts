import { PromptPropertyFormInputBase } from "./PromptPropertyFormInputBase";

export class PromptPropertyFormInputRange extends PromptPropertyFormInputBase {
  private inputTimeout?: number;

  protected setupPromptPropertyFormState() {
    if (!this.formState || !this.key) return;

    // this.render();

    const initialValue = parseFloat(this.getAttribute("value") || "0");
    this.formState.publish(this.key, initialValue);

    // this.formState.subscribe(
    //   this.key,
    //   initialValue.toString(),
    //   (value: number) => {
    //     const inputRange = this.querySelector<HTMLInputElement>(
    //       "input[type='range']"
    //     );
    //     if (inputRange) {
    //       inputRange.value = value?.toString() || "";
    //     }
    //     const inputNumber = this.querySelector<HTMLInputElement>(
    //       "input[type='number']"
    //     );
    //     if (inputNumber) {
    //       inputNumber.value = value?.toString() || "";
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
    const value = this.getAttribute("value") || "";

    this.innerHTML = `
      <input type="number"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${value}"
      />
      <input type="range"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${value}"
      />
    `;

    this.setupEventListeners();
  }

  private setupEventListeners() {
    const inputRange = this.querySelector<HTMLInputElement>(
      "input[type='range']"
    )!;
    const inputNumber = this.querySelector<HTMLInputElement>(
      "input[type='number']"
    )!;
    inputRange.addEventListener("input", () => {
      if (this.inputTimeout) {
        clearTimeout(this.inputTimeout);
      }
      this.inputTimeout = setTimeout(() => {
        const value = Math.round(parseFloat(inputRange.value) * 10000) / 10000;
        inputNumber.value = value.toString();
        this.formState?.publish(this.key, value);
      }, 100);
    });
    inputNumber.addEventListener("input", () => {
      if (this.inputTimeout) {
        clearTimeout(this.inputTimeout);
      }
      this.inputTimeout = setTimeout(() => {
        const value = Math.round(parseFloat(inputNumber.value) * 10000) / 10000;
        inputRange.value = value.toString();
        this.formState?.publish(this.key, value);
      }, 100);
    });
  }
}
