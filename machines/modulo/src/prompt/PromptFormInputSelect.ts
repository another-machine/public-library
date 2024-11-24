import { PromptFormInputBase } from "./PromptFormInputBase";

export class PromptFormInputSelect extends PromptFormInputBase {
  protected setupPromptPropertyFormState() {
    if (!this.formState || !this.key) return;

    this.formState.subscribe(this.key, (value: string) => {
      const select = this.querySelector("select");
      if (select) {
        (select as HTMLSelectElement).value = value || "";
      }
    });
  }

  protected render() {
    const options = this.getAttribute("options")?.split(",") || [];
    const value = this.getAttribute("value") || "";

    this.innerHTML = `
      <div class="field">
        <select>
          ${options
            .map(
              (opt) => `
            <option value="${opt}" ${opt === value ? "selected" : ""}>
              ${opt || "None"}
            </option>
          `
            )
            .join("")}
        </select>
      </div>
    `;

    const select = this.querySelector("select");
    select?.addEventListener("change", (e) => {
      const value = (e.target as HTMLSelectElement).value;
      this.formState?.publish(this.key, value);
    });
  }
}
