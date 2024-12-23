import { Stega64 } from "../../../packages/amplib-steganography/src";

export default async function example({
  onResult,
}: {
  onResult: (canvas: HTMLCanvasElement) => void;
}) {
  const output = document.getElementById("image-two")!;
  const source = document.getElementById("image-one")!.querySelector("img")!;
  const message = document.querySelector<HTMLInputElement>("#message")!;
  const minWidth = document.querySelector<HTMLInputElement>("#min-width")!;
  const minHeight = document.querySelector<HTMLInputElement>("#min-height")!;

  const encode = () => {
    const result = Stega64.encode({
      source,
      messages: [message.value],
      minHeight: parseInt(minHeight.value),
      minWidth: parseInt(minWidth.value),
      encoding: "base64",
      encodeMetadata: true,
    });
    output.innerHTML = "";
    output.appendChild(result);
    outputResult(result);
    onResult(result);
  };
  let timeout;
  [message, minWidth, minHeight].forEach((item) => {
    const update = () => {
      document
        .querySelectorAll<HTMLElement>(`[data-value="${item.id}"]`)
        .forEach((a) => (a.innerText = item.value));
    };
    item.addEventListener("input", () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        update();
        encode();
      }, 500);
    });
    update();
  });

  source.onload = () => encode();

  async function outputResult(source: HTMLCanvasElement) {
    const decode = document.querySelector('[data-output="decode"]')!;
    decode.innerHTML = JSON.stringify(
      Stega64.decode({ source, encoding: "base64" }),
      null,
      2
    );
  }
}
