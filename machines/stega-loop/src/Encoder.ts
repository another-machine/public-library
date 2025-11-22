import {
  StegaCassette,
  loadAudioBuffersFromAudioUrl,
} from "../../../packages/amplib-steganography/src";

export class Encoder {
  audioContext: AudioContext;
  audioBuffers: Float32Array[] | null = null;
  sampleRate: number = 44100;

  constructor() {
    this.audioContext = new AudioContext();
    this.setupListeners();
  }

  setupListeners() {
    const dropZone = document.getElementById("encoder-drop")!;
    const fileInput = document.getElementById(
      "encoder-input"
    ) as HTMLInputElement;
    const controls = document.getElementById("encoder-controls")!;
    const bpmInput = document.getElementById("encoder-bpm") as HTMLInputElement;
    const pitchInput = document.getElementById(
      "encoder-pitch"
    ) as HTMLInputElement;
    const imageInput = document.getElementById(
      "encoder-image-input"
    ) as HTMLInputElement;
    const encodeBtn = document.getElementById("encode-btn")!;
    const resultImg = document.getElementById(
      "encoded-image"
    ) as HTMLImageElement;

    dropZone.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.handleAudioFile(file);
    });

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", () =>
      dropZone.classList.remove("drag-over")
    );

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      const file = e.dataTransfer?.files[0];
      if (file && file.type.startsWith("audio/")) {
        this.handleAudioFile(file);
      }
    });

    encodeBtn.addEventListener("click", async () => {
      if (!this.audioBuffers) return;

      const bpm = parseFloat(bpmInput.value);
      const pitch = parseFloat(pitchInput.value);
      const imageFile = imageInput.files?.[0];

      if (!imageFile) {
        alert("Please select an image");
        return;
      }

      const image = await this.loadImage(imageFile);

      const encodedCanvas = StegaCassette.encode({
        source: image,
        audioBuffers: this.audioBuffers,
        sampleRate: this.sampleRate,
        bitDepth: 16,
        encoding: "additive",
        encodeMetadata: true,
        borderWidth: 1,
        music: { bpm, semitones: pitch },
      });

      resultImg.src = encodedCanvas.toDataURL();
      resultImg.style.display = "block";
    });
  }

  async handleAudioFile(file: File) {
    const url = URL.createObjectURL(file);
    this.audioBuffers = await loadAudioBuffersFromAudioUrl({
      url,
      audioContext: this.audioContext,
      channels: 2,
    });

    document.getElementById("encoder-controls")!.style.display = "block";
    document.getElementById("encoder-drop")!.innerText = `Loaded: ${file.name}`;
  }

  loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = URL.createObjectURL(file);
    });
  }
}
