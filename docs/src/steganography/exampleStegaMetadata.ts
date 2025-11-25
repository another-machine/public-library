import {
  StegaMetadata,
  StegaCassette,
  createDropReader,
  createFileReader,
  playDecodedAudioBuffers,
} from "../../../packages/amplib-steganography/src";

export default function example() {
  const section = document.getElementById("stega-metadata")!;
  const dropArea = section.querySelector(".drop-reader") as HTMLElement;
  const chooseButton = section.querySelector(".choose-image") as HTMLElement;
  const figure = section.querySelector("figure")!;
  const output = section.querySelector('[data-output="metadata"]')!;
  const button = section.querySelector(".play-audio") as HTMLElement;
  const audioContext = new AudioContext();
  let stop = () => {};

  let currentSource: HTMLImageElement | HTMLCanvasElement | null = null;
  let currentMetadata: StegaMetadata.StegaMetadata | null = null;

  const fileInput = document.createElement("input");
  fileInput.style.display = "none";
  section.appendChild(fileInput);

  createFileReader({
    element: fileInput,
    onSuccess: (element) => {
      handleSource(element);
    },
    types: ["image/*"],
  });

  chooseButton.addEventListener("click", () => {
    fileInput.click();
  });

  createDropReader({
    element: dropArea,
    onSuccess: ({ imageElements }) => {
      if (imageElements.length > 0) {
        handleSource(imageElements[0]);
      }
    },
    types: ["image/*"],
  });

  function handleSource(element: HTMLImageElement | HTMLAudioElement) {
    if (element instanceof HTMLImageElement) {
      figure.innerHTML = "";
      figure.appendChild(element);
      currentSource = element;

      // Wait for image to load if needed, but createDropReader usually returns loaded image
      const metadata = StegaMetadata.decode({ source: element });
      currentMetadata = metadata;
      output.innerHTML = JSON.stringify(
        metadata || { error: "No metadata found" },
        null,
        2
      );

      if (
        metadata &&
        (metadata.type === StegaMetadata.StegaContentType.AUDIO ||
          metadata.type === StegaMetadata.StegaContentType.MUSIC)
      ) {
        button.removeAttribute("disabled");
        button.innerText = "Play Audio";
      } else {
        button.setAttribute("disabled", "true");
      }
    }
  }

  button.addEventListener("click", async () => {
    if (button.getAttribute("data-playing")) {
      stop();
      button.removeAttribute("data-playing");
      button.innerText = "Play Audio";
      return;
    }

    if (!currentSource || !currentMetadata) return;

    if (
      currentMetadata.type === StegaMetadata.StegaContentType.AUDIO ||
      currentMetadata.type === StegaMetadata.StegaContentType.MUSIC
    ) {
      button.setAttribute("data-playing", "true");
      button.innerText = "Stop Audio";

      const audioBuffers = StegaCassette.decode({
        source: currentSource,
        bitDepth: currentMetadata.bitDepth,
        channels: currentMetadata.channels,
        encoding: currentMetadata.encoding,
        borderWidth: currentMetadata.borderWidth,
      });

      const audio = await playDecodedAudioBuffers({
        audioBuffers,
        audioContext,
        sampleRate: currentMetadata.sampleRate,
      });

      stop = () => audio.stop();

      audio.onended = () => {
        button.removeAttribute("data-playing");
        button.innerText = "Play Audio";
      };
    }
  });
}
