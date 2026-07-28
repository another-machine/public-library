export class PromptOutput extends HTMLElement {
  private breadcrumbs: HTMLSpanElement;

  public initialize() {
    this.innerHTML = `<span></span>`;
    this.breadcrumbs = this.querySelector("span")!;
  }

  public updateBreadcrumbs(path: string) {
    this.breadcrumbs.innerHTML = path;
  }
}
