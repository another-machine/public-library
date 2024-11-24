import { DestinationInfo } from "../Destinations";

export class PromptInfo extends HTMLElement {
  private breadcrumbs: HTMLSpanElement;
  private pre: HTMLPreElement;

  constructor() {
    super();
    this.innerHTML = `
      <span></span>
      <pre></pre>
    `;
    this.breadcrumbs = this.querySelector("span")!;
    this.pre = this.querySelector("pre")!;
  }

  updateBreadcrumbs(path: string) {
    this.breadcrumbs.innerHTML = path;
  }

  update(info: DestinationInfo) {
    this.pre.innerHTML = info.content();
  }
}
