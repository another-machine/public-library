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
    encoding: any;
    borderWidth: number;
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
    const encodingInput = document.getElementById(
      "encoder-encoding"
    ) as HTMLSelectElement;
    const borderWidthInput = document.getElementById(
      "encoder-border-width"
    ) as HTMLInputElement;
    const previewPlayBtn = document.getElementById("preview-play")!;
    const previewStopBtn = document.getElementById("preview-stop")!;
    const generatedControls = document.getElementById("generated-controls")!;
    const playGeneratedBtn = document.getElementById("play-generated-btn")!;
    const stopGeneratedBtn = document.getElementById("stop-generated-btn")!;
    const downloadGeneratedBtn = document.getElementById(
      "download-generated-btn"
    )!;

    // Dual Range Slider Logic
    const trimSliderStart = document.getElementById(
      "trim-slider-start"
    ) as HTMLInputElement;
    const trimSliderEnd = document.getElementById(
      "trim-slider-end"
    ) as HTMLInputElement;
    const trimHighlight = document.getElementById("trim-highlight")!;

    const updateSliderUI = () => {
      const min = parseFloat(trimSliderStart.min);
      const max = parseFloat(trimSliderStart.max);
      const valStart = parseFloat(trimSliderStart.value);
      const valEnd = parseFloat(trimSliderEnd.value);

      // Ensure start doesn't cross end
      if (valStart > valEnd) {
        trimSliderStart.value = valEnd.toString();
        return;
      }

      const percentStart = ((valStart - min) / (max - min)) * 100;
      const percentEnd = ((valEnd - min) / (max - min)) * 100;

      trimHighlight.style.left = percentStart + "%";
      trimHighlight.style.width = percentEnd - percentStart + "%";

      trimStartInput.value = valStart.toFixed(2);
      trimEndInput.value = valEnd.toFixed(2);
    };

    trimSliderStart.addEventListener("input", () => {
      if (
        parseFloat(trimSliderStart.value) >= parseFloat(trimSliderEnd.value)
      ) {
        trimSliderStart.value = trimSliderEnd.value;
      }
      updateSliderUI();
    });

    trimSliderEnd.addEventListener("input", () => {
      if (
        parseFloat(trimSliderEnd.value) <= parseFloat(trimSliderStart.value)
      ) {
        trimSliderEnd.value = trimSliderStart.value;
      }
      updateSliderUI();
    });

    // Sync number inputs back to sliders
    trimStartInput.addEventListener("change", () => {
      trimSliderStart.value = trimStartInput.value;
      updateSliderUI();
    });

    trimEndInput.addEventListener("change", () => {
      trimSliderEnd.value = trimEndInput.value;
      updateSliderUI();
    });

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
      const targetEncoding = encodingInput.value as any;
      const targetBorderWidth = parseInt(borderWidthInput.value);

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
        encoding: targetEncoding,
        encodeMetadata: true,
        borderWidth: targetBorderWidth,
        music: { bpm: adjustedBpm, semitones: adjustedPitch },
      });

      this.lastEncodedData = {
        canvas: encodedCanvas,
        sampleRate: targetSampleRate,
        bitDepth: targetBitDepth,
        channels: slicedBuffers.length as 1 | 2,
        encoding: targetEncoding,
        borderWidth: targetBorderWidth,
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

    const { canvas, sampleRate, bitDepth, channels, encoding, borderWidth } =
      this.lastEncodedData;

    const decodedBuffers = StegaCassette.decode({
      source: canvas,
      bitDepth,
      channels,
      encoding,
      borderWidth,
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
    const trimSliderStart = document.getElementById(
      "trim-slider-start"
    ) as HTMLInputElement;
    const trimSliderEnd = document.getElementById(
      "trim-slider-end"
    ) as HTMLInputElement;
    const trimHighlight = document.getElementById("trim-highlight")!;

    const duration = this.fullAudioBuffer.duration;

    // Update inputs
    trimStartInput.value = "0";
    trimEndInput.value = duration.toFixed(2);

    // Update sliders
    trimSliderStart.max = duration.toString();
    trimSliderEnd.max = duration.toString();
    trimSliderStart.value = "0";
    trimSliderEnd.value = duration.toString();

    // Update highlight
    trimHighlight.style.left = "0%";
    trimHighlight.style.width = "100%";

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
