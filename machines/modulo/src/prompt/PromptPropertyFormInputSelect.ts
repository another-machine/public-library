import { PromptPropertyFormInputBase } from "./PromptPropertyFormInputBase";

export class PromptPropertyFormInputSelect extends PromptPropertyFormInputBase {
  protected setupPromptPropertyFormState() {
    if (!this.formState || !this.key) return;

    this.render();

    const initialValue = this.getAttribute("value") || "";
    this.formState.publish(this.key, initialValue);

    this.formState.subscribe(this.key, (value: string) => {
      const select = this.querySelector("select");
      if (select) {
        select.value = value || "";
      }
    });
  }

  public connectedCallback() {
    super.connectedCallback();
    this.setupPromptPropertyFormState();
  }

  protected render() {
    const options = this.getAttribute("options")?.split(",") || [];
    const value = this.getAttribute("value") || "";

    this.innerHTML = `
      <select>
        ${options
          .map(
            (opt) =>
              `<option value="${opt}" ${opt === value ? "selected" : ""}>${
                opt || "None"
              }</option>`
          )
          .join("")}
      </select>
    `;

    const select = this.querySelector("select")!;
    select.addEventListener("change", () => {
      const value = select.value;
      this.formState?.publish(this.key, value);
    });
  }
}
