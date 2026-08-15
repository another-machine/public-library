type BaseFormInput = {
  name: string;
  value: any;
  readOnly?: boolean;
  hidden?: boolean;
};

type InputText = BaseFormInput & {
  type: "text";
  value: string;
};

type InputNumber = BaseFormInput & {
  type: "number";
  value: number;
  min?: number;
  max?: number;
  step?: number;
};

type InputRange = BaseFormInput & {
  type: "range";
  value: number;
  min?: number;
  max?: number;
  step?: number;
};

type InputSelect = BaseFormInput & {
  type: "select";
  value: string;
  options: string[];
};

type FormInput = InputText | InputNumber | InputRange | InputSelect;

type FormInputMap<T> = {
  [K in keyof T]: T[K] extends string
    ? InputText | InputSelect
    : T[K] extends number
    ? InputNumber | InputRange
    : never;
};

export function createForm<T extends Record<string, string | number>>({
  form,
  inputs,
  onInput,
  actions = [],
  debounce = 500,
}: {
  form: HTMLFormElement;
  inputs: FormInputMap<T>;
  onInput: (values: T, changed: (keyof T)[]) => void;
  actions?: { name: string; action: (element: HTMLButtonElement) => void }[];
  /**
   * Milliseconds to wait after the last keystroke or drag before committing a
   * value. The default suits a form whose handler is expensive. Set it to 0 for
   * a control driving something already running every frame — a slider that
   * only lands half a second after you let go reads as broken there.
   */
  debounce?: number;
}): {
  values: T;
  setValue: (k: keyof T, value: string | number) => void;
  setFieldHidden: (k: keyof T, hidden: boolean) => void;
} {
  form.addEventListener("submit", (e) => e.preventDefault());
  const values = Object.fromEntries(
    Object.entries(inputs).map(([key, input]) => [key, input.value])
  ) as T;

  const timeouts = new Map<keyof T, ReturnType<typeof setTimeout>>();

  function createDebouncedHandler<K extends keyof T>(
    inputKey: K,
    getValue: () => T[K],
    milliseconds = debounce
  ) {
    return () => {
      if (milliseconds <= 0) {
        values[inputKey] = getValue();
        updateDataAttributes(String(inputKey), values[inputKey]);
        onInput(values, [inputKey]);
        return;
      }
      const existingTimeout = timeouts.get(inputKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      const timeout = setTimeout(() => {
        values[inputKey] = getValue();
        updateDataAttributes(String(inputKey), values[inputKey]);
        onInput(values, [inputKey]);
        timeouts.delete(inputKey);
      }, milliseconds);

      timeouts.set(inputKey, timeout);
    };
  }

  function updateDataAttributes(key: string, value: string | number) {
    const elements =
      form.parentElement?.querySelectorAll<HTMLElement>(
        `[data-value="${key}"]`
      ) || [];
    elements.forEach((element) => {
      element.innerText = `${value}`;
    });
  }

  // A .field row: label and control as siblings, label first. The form itself
  // carries .fieldset-stack in the markup, so a row only has to be a row.
  for (const inputKey in inputs) {
    const input = inputs[inputKey];
    const label = document.createElement("label");
    const row = document.createElement("div");
    row.className = "field";
    row.appendChild(label);
    label.textContent = input.name;
    if (input.hidden) {
      row.hidden = true;
    }
    form.appendChild(row);

    const id = `input-${Math.round(Math.random() * 1000000)}-${input.name
      .replace(/^[a-z0-9]+/i, "-")
      .toLowerCase()}`;
    label.setAttribute("for", id);
    updateDataAttributes(inputKey, input.value);

    if (input.type === "text") {
      const element = document.createElement("input");
      if (input.readOnly) {
        element.readOnly = true;
        element.disabled = true;
      }
      element.id = id;
      element.name = input.name;
      element.value = input.value;
      element.addEventListener(
        "input",
        createDebouncedHandler(
          inputKey,
          () => element.value as T[typeof inputKey]
        )
      );
      row.appendChild(element);
    } else if (input.type === "number" || input.type === "range") {
      const element = document.createElement("input");
      if (input.readOnly) {
        element.readOnly = true;
        element.disabled = true;
      }
      element.id = id;
      element.name = input.name;
      element.type = input.type;
      if (input.min !== undefined) {
        element.setAttribute("min", input.min.toString());
      }
      if (input.max !== undefined) {
        element.setAttribute("max", input.max.toString());
      }
      if (input.step !== undefined) {
        element.setAttribute("step", input.step.toString());
      }
      element.value = input.value.toString();
      element.addEventListener(
        "input",
        createDebouncedHandler(
          inputKey,
          () => parseFloat(element.value) as T[typeof inputKey]
        )
      );
      row.appendChild(element);
    } else if (input.type === "select") {
      const element = document.createElement("select");
      if (input.readOnly) {
        element.disabled = true;
      }
      element.id = id;
      element.name = input.name;
      element.innerHTML = input.options
        .map((option) => `<option value="${option}">${option}</option>`)
        .join("");
      element.value = input.value;
      element.addEventListener(
        "change",
        createDebouncedHandler(
          inputKey,
          () => element.value as T[typeof inputKey],
          0
        )
      );
      row.appendChild(element);
    }
  }

  actions.forEach((action) => {
    const element = document.createElement("button");
    element.type = "button";
    element.innerText = action.name;
    element.addEventListener("click", () => action.action(element));
    form.appendChild(element);
  });

  return { values, setValue, setFieldHidden };

  /**
   * Show or hide a whole field row after setup, for a control that only applies
   * to some other setting — a knob that is visible but inert reads as broken.
   * `hidden` in the input map is the same idea fixed at creation.
   *
   * Any element in the example carrying `data-only="<key>"` is hidden with it,
   * which is how a code sample drops the line for an option that is not in play.
   */
  function setFieldHidden(key: keyof T, hidden: boolean) {
    const control = form.querySelector<HTMLElement>(`[name="${String(key)}"]`);
    control?.closest<HTMLElement>(".field")?.toggleAttribute("hidden", hidden);
    form.parentElement
      ?.querySelectorAll<HTMLElement>(`[data-only="${String(key)}"]`)
      .forEach((el) => el.toggleAttribute("hidden", hidden));
  }

  function setValue(key: keyof T, value: string | number) {
    // @ts-ignore
    values[key] = value;
    inputs[key].value = value;
    const element = form.querySelector(`[name="${String(key)}"]`);
    if (element && "value" in element) {
      element.value = value;
    }
    updateDataAttributes(String(key), values[key]);
    onInput(values, [key]);
  }
}
