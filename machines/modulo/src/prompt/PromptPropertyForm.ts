import {
  DestinationPropertyInput,
  DestinationPropertyInputFormatter,
} from "../destinations/Destination";
import { PromptPropertyFormInputRange } from "./PromptPropertyFormInputRange.ts";
import { PromptPropertyFormInputSelect } from "./PromptPropertyFormInputSelect.ts";
import { PromptPropertyFormInputStepNumber } from "./PromptPropertyFormInputStepNumber.ts";
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

    // This may not be necessary
    // requestAnimationFrame(() => {
    //   this.handleFormChange();
    // });
  }

  private setupPromptPropertyFormState() {
    this.inputs.forEach((input, index) => {
      this.formState.subscribe(`input-${index}`, input.initialValue(), () => {
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
      const element = document.createElement(
        "prompt-form-input-select"
      ) as PromptPropertyFormInputSelect;
      element.setAttribute("key", `input-${index}`);
      element.setAttribute("options", input.options.join(","));
      element.setAttribute("value", input.initialValue());
      if (input.label) {
        element.setAttribute("label", input.label);
      }
      element.setPromptPropertyFormState(this.formState);
      return element;
    } else if (input.type === "number") {
      const element = document.createElement(
        "prompt-form-input-step-number"
      ) as PromptPropertyFormInputStepNumber;
      element.setAttribute("key", `input-${index}`);
      element.setAttribute("min", input.min.toString());
      element.setAttribute("max", input.max.toString());
      const diff = input.max - input.min;
      const steps: number[] = input.steps || [];
      if (!steps.length) {
        if (diff < 3) {
          steps.push(0.001, 0.01, 0.05);
        } else if (diff < 25) {
          steps.push(1);
        } else if (diff < 300) {
          steps.push(1, 10, 25);
        } else if (diff < 1000) {
          steps.push(1, 10, 100);
        } else {
          steps.push(10, 100, 1000);
        }
      }
      element.setAttribute("step", steps[0].toString());
      element.setAttribute("steps", steps.join(","));
      element.setAttribute("value", input.initialValue());
      if (input.label) {
        element.setAttribute("label", input.label);
      }
      element.setPromptPropertyFormState(this.formState);
      return element;
    } else {
      // if (input.type === "range")
      const element = document.createElement(
        "prompt-form-input-range"
      ) as PromptPropertyFormInputRange;
      element.setAttribute("key", `input-${index}`);
      element.setAttribute("min", input.min.toString());
      element.setAttribute("max", input.max.toString());
      const diff = input.max - input.min;
      const step = input.step || (diff < 3 ? 0.001 : 1);
      element.setAttribute("step", step.toString());
      element.setAttribute("value", input.initialValue());
      if (input.label) {
        element.setAttribute("label", input.label);
      }
      element.setPromptPropertyFormState(this.formState);
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
