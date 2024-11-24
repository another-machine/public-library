import {
  DestinationPropertyInput,
  DestinationPropertyInputFormatter,
} from "../Destinations";
import { PromptPropertyFormState } from "./PromptPropertyFormState.ts";

export class PromptPropertyForm extends HTMLElement {
  private formState: PromptPropertyFormState;
  private inputs: DestinationPropertyInput[] = [];
  private formatter: DestinationPropertyInputFormatter;
  private onChangeCallback?: (formattedValue: string) => void;

  constructor() {
    super();
    this.formState = new PromptPropertyFormState();
    this.formatter = (values: string[]) => values.join(",");
  }

  configure(
    inputs: DestinationPropertyInput[],
    formatter: DestinationPropertyInputFormatter,
    onChange?: (formattedValue: string) => void
  ) {
    this.inputs = inputs;
    this.formatter = formatter;
    this.onChangeCallback = onChange;
    this.setupPromptPropertyFormState();
    this.render();
  }

  private setupPromptPropertyFormState() {
    this.inputs.forEach((_, index) => {
      this.formState.subscribe(`input-${index}`, () => {
        this.handleFormChange();
      });
    });
  }

  private handleFormChange() {
    const values = this.inputs.map(
      (_, index) =>
        this.formState.getAllValues()[`input-${index}`]?.toString() || ""
    );

    const formatted = this.formatter(values);
    this.onChangeCallback?.(formatted);
  }

  private createInputElement(
    input: DestinationPropertyInput,
    index: number
  ): HTMLElement {
    if (input.type === "select") {
      const element = document.createElement("prompt-form-input-select");
      element.setAttribute("key", `input-${index}`);
      element.setAttribute("options", input.options.join(","));
      element.setAttribute("value", input.initialValue());
      (element as any).setPromptPropertyFormState(this.formState);
      return element;
    } else {
      const element = document.createElement("prompt-form-input-step-number");
      element.setAttribute("key", `input-${index}`);
      element.setAttribute("min", input.min.toString());
      element.setAttribute("max", input.max.toString());

      const diff = input.max - input.min;
      let steps: number[];
      if (diff < 3) {
        steps = [0.001, 0.01, 0.05];
      } else if (diff < 25) {
        steps = [1];
      } else {
        steps = [1, 10, 25];
      }

      element.setAttribute("step", steps[0].toString());
      element.setAttribute("steps", steps.join(","));
      element.setAttribute("value", input.initialValue());
      (element as any).setPromptPropertyFormState(this.formState);
      return element;
    }
  }

  private render() {
    this.innerHTML = `<form></form>`;
    const form = this.querySelector("form");
    if (!form) return;

    form.addEventListener("submit", (e) => e.preventDefault());

    this.inputs.forEach((input, index) => {
      const inputElement = this.createInputElement(input, index);
      form.appendChild(inputElement);
    });
  }
}