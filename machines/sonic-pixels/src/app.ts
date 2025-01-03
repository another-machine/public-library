import {
  createDropReader,
  createFileReader,
  loadAudioBuffersFromAudioUrl,
  playDecodedAudioBuffers,
  StegaCassette,
  StegaMetadata,
} from "../../../packages/amplib-steganography/src";

const main = document.querySelector("main")!;
const image = document.getElementById("image")!;
const audio = document.getElementById("audio")!;

const inputAudio = document.getElementById("input-audio") as HTMLInputElement;
const inputImage = document.getElementById("input-image") as HTMLInputElement;
const inputEncoded = document.getElementById(
  "input-encoded"
) as HTMLInputElement;

const inputSampleRate = document.getElementById(
  "sample-rate"
) as HTMLInputElement;
const buttonConvert = document.getElementById("convert") as HTMLButtonElement;
const buttonPlay = document.getElementById("play") as HTMLButtonElement;
const selectAspectRatio = document.getElementById(
  "aspect-ratio"
) as HTMLSelectElement;
const selectBitDepth = document.getElementById(
  "bit-depth"
) as HTMLSelectElement;
const selectChannels = document.getElementById("channels") as HTMLSelectElement;
const divResult = document.getElementById("result") as HTMLDivElement;
buttonPlay.disabled = true;

function getAspectRatio() {
  const value = selectAspectRatio.value;
  if (value === "natural") {
    return undefined;
  }
  return parseFloat(value);
}

function getBitDepth(): 8 | 16 | 24 {
  switch (selectBitDepth.value) {
    case "8":
      return 8;
    case "16":
      return 16;
    case "24":
      return 24;
    default:
      return 8;
  }
}

buttonConvert.addEventListener("click", async () => {
  const imageValue = image.querySelector("img");
  const audioValue = audio.querySelector("audio");
  const channels = parseInt(selectChannels.value) as 1 | 2;
  const aspectRatio = getAspectRatio();
  const bitDepth = getBitDepth();
  if (imageValue && audioValue) {
    const audioContext = new AudioContext();
    const sampleRate = parseInt(inputSampleRate.value);
    const url = audioValue.getAttribute("src");
    if (!url) {
      return;
    }
    buttonPlay.disabled = false;
    const metadata: StegaMetadata.StegaMetadataAudio = {
      type: StegaMetadata.StegaContentType.AUDIO,
      sampleRate,
      bitDepth,
      encoding: "additive",
      channels,
      borderWidth: 1,
    };
    const audioBuffers = await loadAudioBuffersFromAudioUrl({
      url,
      sampleRate: metadata.sampleRate,
      audioContext,
      channels: metadata.channels,
    });
    const source = StegaCassette.encode({
      source: imageValue,
      audioBuffers,
      sampleRate: metadata.sampleRate,
      aspectRatio,
      bitDepth: metadata.bitDepth,
      encoding: metadata.encoding,
    });
    divResult.innerHTML = "";
    const result = StegaMetadata.encode({ source, metadata });
    const image = new Image();
    image.src = result.toDataURL();
    divResult.appendChild(image);
  }
});

buttonPlay.addEventListener("click", async () => {
  const audioContext = new AudioContext();
  const imageResult = divResult.querySelector<
    HTMLCanvasElement | HTMLImageElement
  >("canvas, img");
  if (imageResult) {
    const metadata = StegaMetadata.decode({ source: imageResult });
    if (!metadata || metadata.type === StegaMetadata.StegaContentType.AUDIO) {
      const audioBuffers = StegaCassette.decode({
        source: imageResult,
        bitDepth: metadata?.bitDepth || getBitDepth(),
        channels:
          metadata?.channels || (parseInt(selectChannels.value) as 2 | 1),
        encoding: metadata?.encoding || "additive",
      });
      const stop = await playDecodedAudioBuffers({
        audioBuffers,
        audioContext,
        sampleRate: metadata?.sampleRate || parseInt(inputSampleRate.value),
      });
    }
  }
});

createDropReader({
  element: main,
  onSuccess: ({ audioElements, imageElements }) => {
    if (audioElements[0]) {
      audio.innerHTML = "";
      audio.appendChild(audioElements[0]);
      audioElements[0].controls = true;
    }
    if (imageElements[0]) {
      image.innerHTML = "";
      image.appendChild(imageElements[0]);
    }
  },
  onFailure: (message) => {
    console.error("Drop error:", message);
  },
  onDragEnter: () => {
    main.classList.add("droppable");
  },
  onDragLeave: () => {
    main.classList.remove("droppable");
  },
  onDrop: () => {
    main.classList.remove("droppable");
  },
});

createFileReader({
  element: inputEncoded,
  types: ["image/*"],
  onSuccess: (result) => {
    buttonPlay.disabled = false;
    divResult.innerHTML = "";
    divResult.appendChild(result);
  },
});
createFileReader({
  element: inputImage,
  types: ["image/*"],
  onSuccess: (result) => {
    image.innerHTML = "";
    image.appendChild(result);
  },
});
createFileReader({
  element: inputAudio,
  types: ["audio/*"],
  onSuccess: (result) => {
    audio.innerHTML = "";
    audio.appendChild(result);
    // audio.controls = true;
  },
});
