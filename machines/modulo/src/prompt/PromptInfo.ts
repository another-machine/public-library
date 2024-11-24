import { DestinationInfo } from "../Destinations";

export class PromptInfo extends HTMLElement {
  update(info: DestinationInfo | string) {
    this.innerHTML = this.formatInfo(info);
  }

  private formatInfo(info: DestinationInfo | string): string {
    if (typeof info === "string") {
      return `<span>${info}</span>`;
    }

    const label = info.label || "";
    const content = info.content();

    return `${label ? `<span>${label}</span>` : ""}<pre>${content}</pre>`;
  }
}
