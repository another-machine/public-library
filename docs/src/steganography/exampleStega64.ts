import {
  Stega64,
  StegaMetadata,
} from "../../../packages/amplib-steganography/src";
import { Stega64Encoding } from "../../../packages/amplib-steganography/src/Stega64";
import { createForm } from "../createForm";

type FormData = {
  encoding: Stega64Encoding;
  encodeMetadata: string;
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
      encoding: {
        name: "encoding",
        type: "select",
        value: "base64",
        options: ["base64", "none"],
      },
      encodeMetadata: {
        type: "select",
        options: ["true", "false"],
        value: "true",
        name: "encodeMetadata",
      },
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
      encoding: data.encoding,
      encodeMetadata: data.encodeMetadata === "true",
    });
    output.innerHTML = "";
    output.appendChild(result);
    onResult(result);
    const decode = document.querySelector('[data-output="decode"]')!;
    const meta = StegaMetadata.decode({ source: result });
    if (!meta || meta.type === StegaMetadata.StegaContentType.STRING) {
      decode.innerHTML = JSON.stringify(
        Stega64.decode({
          source: result,
          encoding: meta?.encoding || data.encoding,
        }),
        null,
        2
      );
    }
  }
}
