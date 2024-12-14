import {
  createDropReader,
  createFileReader,
  loadAudioBufferFromAudioUrl,
  playDecodedAudioBuffer,
  StegaCassette,
} from "../../../packages/amplib-steganography/src";

const main = document.querySelector("main")!;
const image = document.getElementById("image")!;
const audio = document.getElementById("audio")!;

const inputAudio = document.getElementById("input-audio") as HTMLInputElement;
const inputImage = document.getElementById("input-image") as HTMLInputElement;

const inputSampleRate = document.getElementById(
  "sample-rate"
) as HTMLInputElement;
const buttonConvert = document.getElementById("convert") as HTMLButtonElement;
const buttonPlay = document.getElementById("play") as HTMLButtonElement;
const divResult = document.getElementById("result") as HTMLDivElement;
buttonPlay.disabled = true;

buttonConvert.addEventListener("click", async () => {
  const imageValue = image.querySelector("img");
  const audioValue = audio.querySelector("audio");
  if (imageValue && audioValue) {
    const audioContext = new AudioContext();
    const sampleRate = parseInt(inputSampleRate.value);
    const url = audioValue.getAttribute("src");
    if (!url) {
      return;
    }
    buttonPlay.disabled = false;
    const audioBuffer = await loadAudioBufferFromAudioUrl({
      url,
      sampleRate,
      audioContext,
    });
    const result = StegaCassette.encode({
      source: imageValue,
      audioBuffer,
    });
    divResult.innerHTML = "";
    divResult.appendChild(result);
  }
});

buttonPlay.addEventListener("click", async () => {
  const audioContext = new AudioContext();
  const sampleRate = parseInt(inputSampleRate.value);
  const imageResult = divResult.querySelector("canvas");
  if (imageResult) {
    const audioBuffer = StegaCassette.decode({ source: imageResult });
    const stop = await playDecodedAudioBuffer({
      audioBuffer,
      audioContext,
      sampleRate,
    });
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
  element: inputImage,
  onSuccess: (result) => {
    image.innerHTML = "";
    image.appendChild(result);
  },
});
createFileReader({
  element: inputAudio,
  onSuccess: (result) => {
    audio.innerHTML = "";
    audio.appendChild(result);
    // audio.controls = true;
  },
});
