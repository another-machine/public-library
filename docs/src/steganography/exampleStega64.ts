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
  borderWidth: number;
  aspectRatio: string;
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
      encoding: {
        name: "encoding",
        type: "select",
        value: "base64",
        options: ["base64", "raw"],
      },
      encodeMetadata: {
        type: "select",
        options: ["true", "false"],
        value: "true",
        name: "encodeMetadata",
      },
      minWidth: { name: "minWidth", type: "number", value: 16, min: 16 },
      minHeight: { name: "minHeight", type: "number", value: 16, min: 16 },
      borderWidth: { name: "borderWidth", type: "number", value: 1, min: 0 },
      aspectRatio: {
        type: "select",
        options: ["undefined", "1", "1.7778", "1.3334"],
        value: "undefined",
        name: "aspectRatio",
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
      borderWidth: data.borderWidth,
      encoding: data.encoding,
      encodeMetadata: data.encodeMetadata === "true",
      aspectRatio:
        data.aspectRatio === "undefined"
          ? undefined
          : parseFloat(data.aspectRatio),
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
          borderWidth: meta?.borderWidth || data.borderWidth,
        }),
        null,
        2
      );
    }
  }
}
