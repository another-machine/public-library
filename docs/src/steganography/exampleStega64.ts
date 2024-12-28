import { Stega64 } from "../../../packages/amplib-steganography/src";
import { createForm } from "../createForm";

type FormData = {
  message: string;
  minHeight: number;
  minWidth: number;
};

export default async function example({
  onResult,
}: {
  onResult: (canvas: HTMLCanvasElement) => void;
}) {
  const section = document.getElementById("example-stega64")!;
  const source = section
    .querySelector("figure:nth-of-type(1)")!
    .querySelector("img")!;
  const output = section.querySelector("figure:nth-of-type(2)")!;
  const form = section.querySelector("form")!;

  const values = createForm<FormData>({
    form,
    inputs: {
      message: { name: "message", type: "text", value: "Hello world" },
      minWidth: { name: "minWidth", type: "number", value: 16, min: 16 },
      minHeight: { name: "minHeight", type: "number", value: 10, min: 10 },
    },
    onInput: run,
    actions: [],
  });
  source.onload = () => run(values);

  function run(data: FormData) {
    const result = Stega64.encode({
      source,
      messages: [data.message],
      minHeight: data.minHeight,
      minWidth: data.minWidth,
      encoding: "base64",
      encodeMetadata: true,
    });
    output.innerHTML = "";
    output.appendChild(result);
    onResult(result);
    const decode = document.querySelector('[data-output="decode"]')!;
    decode.innerHTML = JSON.stringify(
      Stega64.decode({ source: result, encoding: "base64" }),
      null,
      2
    );
  }
}
