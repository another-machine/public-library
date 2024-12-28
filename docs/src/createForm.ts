type BaseFormInput = {
  name: string;
  value: any;
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
}: {
  form: HTMLFormElement;
  inputs: FormInputMap<T>;
  onInput: (values: T, changed: (keyof T)[]) => void;
  actions?: { name: string; action: (element: HTMLButtonElement) => void }[];
}) {
  form.addEventListener("submit", (e) => e.preventDefault());
  const values = Object.fromEntries(
    Object.entries(inputs).map(([key, input]) => [key, input.value])
  ) as T;

  const timeouts = new Map<keyof T, number>();

  function createDebouncedHandler<K extends keyof T>(
    inputKey: K,
    getValue: () => T[K]
  ) {
    return () => {
      const existingTimeout = timeouts.get(inputKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      const timeout = setTimeout(() => {
        values[inputKey] = getValue();
        updateDataAttributes(String(inputKey), values[inputKey]);
        onInput(values, [inputKey]);
        timeouts.delete(inputKey);
      }, 500);

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

  for (const inputKey in inputs) {
    const input = inputs[inputKey];
    const label = document.createElement("label");
    label.innerHTML = `<span>${input.name}</span>`;
    form.appendChild(label);

    const id = `input-${Math.round(Math.random() * 1000000)}-${input.name
      .replace(/^[a-z0-9]+/i, "-")
      .toLowerCase()}`;
    label.setAttribute("for", id);
    updateDataAttributes(inputKey, input.value);

    if (input.type === "text") {
      const element = document.createElement("input");
      element.id = id;
      element.value = input.value;
      element.addEventListener(
        "input",
        createDebouncedHandler(
          inputKey,
          () => element.value as T[typeof inputKey]
        )
      );
      label.appendChild(element);
    } else if (input.type === "number" || input.type === "range") {
      const element = document.createElement("input");
      element.id = id;
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
          () => parseInt(element.value) as T[typeof inputKey]
        )
      );
      label.appendChild(element);
    } else if (input.type === "select") {
      const element = document.createElement("select");
      element.id = id;
      element.innerHTML = input.options
        .map((option) => `<option value="${option}">${option}</option>`)
        .join("");
      element.value = input.value;
      element.addEventListener(
        "change",
        createDebouncedHandler(
          inputKey,
          () => element.value as T[typeof inputKey]
        )
      );
      label.appendChild(element);
    }
  }

  actions.forEach((action) => {
    const element = document.createElement("button");
    element.type = "button";
    element.innerText = action.name;
    element.addEventListener("click", () => action.action(element));
    form.appendChild(element);
  });

  return values;
}
