import { StegaCassette } from "../../../packages/amplib-steganography/src";

export class Encoder {
  audioContext: AudioContext;
  fullAudioBuffer: AudioBuffer | null = null;
  previewSource: AudioBufferSourceNode | null = null;
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

    const trimStartInput = document.getElementById(
      "trim-start"
    ) as HTMLInputElement;
    const trimEndInput = document.getElementById(
      "trim-end"
    ) as HTMLInputElement;
    const previewPlayBtn = document.getElementById("preview-play")!;
    const previewStopBtn = document.getElementById("preview-stop")!;

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

    previewPlayBtn.addEventListener("click", () => {
      const start = parseFloat(trimStartInput.value);
      const end = parseFloat(trimEndInput.value);
      this.playPreview(start, end);
    });

    previewStopBtn.addEventListener("click", () => this.stopPreview());

    encodeBtn.addEventListener("click", async () => {
      if (!this.fullAudioBuffer) return;

      const bpm = parseFloat(bpmInput.value);
      const pitch = parseFloat(pitchInput.value);
      const imageFile = imageInput.files?.[0];
      const start = parseFloat(trimStartInput.value);
      const end = parseFloat(trimEndInput.value);

      if (!imageFile) {
        alert("Please select an image");
        return;
      }

      if (end <= start) {
        alert("End time must be greater than start time");
        return;
      }

      const image = await this.loadImage(imageFile);

      // Slice the buffer
      const sampleRate = this.fullAudioBuffer.sampleRate;
      const startSample = Math.floor(start * sampleRate);
      const endSample = Math.floor(end * sampleRate);
      const length = endSample - startSample;

      const slicedBuffers: Float32Array[] = [];
      for (let i = 0; i < this.fullAudioBuffer.numberOfChannels; i++) {
        const channelData = this.fullAudioBuffer.getChannelData(i);
        // Ensure we don't go out of bounds
        const safeEnd = Math.min(endSample, channelData.length);
        const safeStart = Math.min(startSample, safeEnd);
        slicedBuffers.push(channelData.slice(safeStart, safeEnd));
      }

      const encodedCanvas = StegaCassette.encode({
        source: image,
        audioBuffers: slicedBuffers,
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
    const arrayBuffer = await file.arrayBuffer();
    this.fullAudioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    const trimStartInput = document.getElementById(
      "trim-start"
    ) as HTMLInputElement;
    const trimEndInput = document.getElementById(
      "trim-end"
    ) as HTMLInputElement;

    trimStartInput.value = "0";
    trimEndInput.value = this.fullAudioBuffer.duration.toFixed(2);

    document.getElementById("encoder-controls")!.style.display = "block";
    document.getElementById("encoder-drop")!.innerText = `Loaded: ${file.name}`;
  }

  playPreview(start: number, end: number) {
    if (!this.fullAudioBuffer) return;
    this.stopPreview();

    this.previewSource = this.audioContext.createBufferSource();
    this.previewSource.buffer = this.fullAudioBuffer;
    this.previewSource.loop = true;
    this.previewSource.loopStart = start;
    this.previewSource.loopEnd = end;
    this.previewSource.connect(this.audioContext.destination);

    // Start at the beginning of the loop
    this.previewSource.start(0, start);
  }

  stopPreview() {
    if (this.previewSource) {
      this.previewSource.stop();
      this.previewSource = null;
    }
  }

  loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = URL.createObjectURL(file);
    });
  }
}
