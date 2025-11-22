import { StegaCassette } from "../../../packages/amplib-steganography/src";

export class Encoder {
  audioContext: AudioContext;
  fullAudioBuffer: AudioBuffer | null = null;
  previewSource: AudioBufferSourceNode | null = null;
  generatedSource: AudioBufferSourceNode | null = null;
  sampleRate: number = 44100;
  baseBpm: number = 120;
  basePitch: number = 0;
  lastEncodedData: {
    canvas: HTMLCanvasElement;
    sampleRate: number;
    bitDepth: 8 | 16 | 24;
    channels: 1 | 2;
  } | null = null;

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
    const sampleRateInput = document.getElementById(
      "encoder-sample-rate"
    ) as HTMLInputElement;
    const sampleRateDisplay = document.getElementById("sample-rate-display")!;
    const bitDepthInput = document.getElementById(
      "encoder-bit-depth"
    ) as HTMLSelectElement;
    const previewPlayBtn = document.getElementById("preview-play")!;
    const previewStopBtn = document.getElementById("preview-stop")!;
    const generatedControls = document.getElementById("generated-controls")!;
    const playGeneratedBtn = document.getElementById("play-generated-btn")!;
    const stopGeneratedBtn = document.getElementById("stop-generated-btn")!;
    const downloadGeneratedBtn = document.getElementById(
      "download-generated-btn"
    )!;

    sampleRateInput.addEventListener("input", () => {
      sampleRateDisplay.innerText = sampleRateInput.value;
    });

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
      const targetSampleRate = parseInt(sampleRateInput.value);
      const targetBitDepth = parseInt(bitDepthInput.value) as 8 | 16 | 24;

      if (!imageFile) {
        alert("Please select an image");
        return;
      }

      if (end <= start) {
        alert("End time must be greater than start time");
        return;
      }

      const image = await this.loadImage(imageFile);

      // Calculate adjusted BPM and Pitch based on sample rate ratio
      const originalSampleRate = this.fullAudioBuffer.sampleRate;
      const ratio = targetSampleRate / originalSampleRate;

      const adjustedBpm = bpm * ratio;
      const pitchShift = 12 * Math.log2(ratio);
      // Modulo 12 logic: ((n % m) + m) % m
      const adjustedPitch = (((pitch + pitchShift) % 12) + 12) % 12;

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
        sampleRate: targetSampleRate,
        bitDepth: targetBitDepth,
        encoding: "additive",
        encodeMetadata: true,
        borderWidth: 1,
        music: { bpm: adjustedBpm, semitones: adjustedPitch },
      });

      this.lastEncodedData = {
        canvas: encodedCanvas,
        sampleRate: targetSampleRate,
        bitDepth: targetBitDepth,
        channels: slicedBuffers.length as 1 | 2,
      };

      const dataUrl = encodedCanvas.toDataURL();
      resultImg.src = dataUrl;

      generatedControls.style.display = "block";
      resultImg.style.display = "block";
    });

    playGeneratedBtn.addEventListener("click", () => {
      this.playGenerated();
    });

    stopGeneratedBtn.addEventListener("click", () => {
      this.stopGenerated();
    });

    downloadGeneratedBtn.addEventListener("click", () => {
      if (!this.lastEncodedData) return;
      const link = document.createElement("a");
      link.download = `stega-loop-${Date.now()}.png`;
      link.href = this.lastEncodedData.canvas.toDataURL();
      link.click();
    });
  }

  playGenerated() {
    if (!this.lastEncodedData) return;
    this.stopGenerated();

    const { canvas, sampleRate, bitDepth, channels } = this.lastEncodedData;

    const decodedBuffers = StegaCassette.decode({
      source: canvas,
      bitDepth,
      channels,
      encoding: "additive",
      borderWidth: 1,
    });

    const audioBuffer = this.audioContext.createBuffer(
      channels,
      decodedBuffers[0].length,
      sampleRate
    );

    for (let i = 0; i < channels; i++) {
      audioBuffer.copyToChannel(decodedBuffers[i], i);
    }

    this.generatedSource = this.audioContext.createBufferSource();
    this.generatedSource.buffer = audioBuffer;
    this.generatedSource.loop = true;
    this.generatedSource.connect(this.audioContext.destination);
    this.generatedSource.start();
  }

  stopGenerated() {
    if (this.generatedSource) {
      this.generatedSource.stop();
      this.generatedSource = null;
    }
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

    (document.getElementById("encoder-bpm") as HTMLInputElement).value = "120";
    (document.getElementById("encoder-pitch") as HTMLInputElement).value = "0";
    (document.getElementById("encoder-sample-rate") as HTMLInputElement).value =
      this.fullAudioBuffer.sampleRate.toString();
    document.getElementById("sample-rate-display")!.innerText =
      this.fullAudioBuffer.sampleRate.toString();

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
