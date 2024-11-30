export class PromptInput extends HTMLElement {
  private input: HTMLInputElement | null = null;
  private backButton: HTMLButtonElement | null = null;
  private keydownBackspacing = false;
  private pendingConfig: {
    onSubmit: () => void;
    onBack: () => void;
    onKeydown: (event: KeyboardEvent) => void;
    onKeyup: (event: KeyboardEvent) => void;
    onFocus: () => void;
    onBlur: () => void;
    onInputClear: () => void;
  } | null = null;

  connectedCallback() {
    this.render();
    if (this.pendingConfig) {
      this.setupEventListeners(this.pendingConfig);
      this.pendingConfig = null;
    }
  }

  private render() {
    this.innerHTML = `
      <div class="input">
        <button>&lt;</button>
        <input type="text" />
      </div>
    `;
    this.input = this.querySelector("input");
    this.backButton = this.querySelector("button");
  }

  configure(config: {
    onSubmit: () => void;
    onBack: () => void;
    onKeydown: (event: KeyboardEvent) => void;
    onKeyup: (event: KeyboardEvent) => void;
    onFocus: () => void;
    onBlur: () => void;
    onInputClear: () => void;
  }) {
    if (!this.isConnected) {
      this.pendingConfig = config;
      return;
    }
    this.setupEventListeners(config);
  }

  private setupEventListeners(config: {
    onSubmit: () => void;
    onBack: () => void;
    onKeydown: (event: KeyboardEvent) => void;
    onKeyup: (event: KeyboardEvent) => void;
    onFocus: () => void;
    onBlur: () => void;
    onInputClear: () => void;
  }) {
    if (!this.input || !this.backButton) {
      console.error("PromptInput: Elements not found");
      return;
    }

    const {
      onSubmit,
      onBack,
      onKeydown,
      onKeyup,
      onFocus,
      onBlur,
      onInputClear,
    } = config;

    this.input.addEventListener("keydown", (e) => {
      if (e.code === "Backspace" && !this.input?.value) {
        this.keydownBackspacing = true;
      }
      onKeydown(e);
    });

    this.input.addEventListener("keyup", (e) => {
      if (e.code === "Enter") {
        e.preventDefault();
        onSubmit();
      } else if (this.keydownBackspacing) {
        onBack();
      }
      this.keydownBackspacing = false;
      onKeyup(e);
    });

    this.input.addEventListener("focus", () => onFocus());
    this.input.addEventListener("blur", () => onBlur());

    this.backButton.addEventListener("click", () => {
      if (this.input?.value === "") {
        onBack();
      }
      if (this.input) {
        this.input.value = "";
        onInputClear();
      }
    });
  }

  focus() {
    this.input?.focus();
  }

  get value() {
    return this.input?.value ?? "";
  }

  set value(val: string) {
    if (this.input) {
      this.input.value = val;
    }
  }
}
