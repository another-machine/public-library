import { StegaCassette } from "../../../packages/amplib-steganography/src";
import {
  DetectBPM,
  DetectTone,
} from "../../../packages/amplib-music-detection/src";

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
    const sampleRateNumberInput = document.getElementById(
      "encoder-sample-rate-input"
    ) as HTMLInputElement;
    const channelsInput = document.getElementById(
      "encoder-channels"
    ) as HTMLSelectElement;
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
    const zoomSliderStart = document.getElementById(
      "zoom-slider-start"
    ) as HTMLInputElement;
    const zoomSliderEnd = document.getElementById(
      "zoom-slider-end"
    ) as HTMLInputElement;
    const zoomHighlight = document.getElementById("zoom-highlight")!;

    const trimSliderStart = document.getElementById(
      "trim-slider-start"
    ) as HTMLInputElement;
    const trimSliderEnd = document.getElementById(
      "trim-slider-end"
    ) as HTMLInputElement;
    const trimHighlight = document.getElementById("trim-highlight")!;

    const updateSliderUI = () => {
      // Zoom Slider Logic
      const zoomMin = parseFloat(zoomSliderStart.min);
      const zoomMax = parseFloat(zoomSliderStart.max);
      let zoomValStart = parseFloat(zoomSliderStart.value);
      let zoomValEnd = parseFloat(zoomSliderEnd.value);

      if (zoomValStart > zoomValEnd) {
        zoomSliderStart.value = zoomValEnd.toString();
        zoomValStart = zoomValEnd;
      }

      const zoomPercentStart =
        ((zoomValStart - zoomMin) / (zoomMax - zoomMin)) * 100;
      const zoomPercentEnd =
        ((zoomValEnd - zoomMin) / (zoomMax - zoomMin)) * 100;

      zoomHighlight.style.left = zoomPercentStart + "%";
      zoomHighlight.style.width = zoomPercentEnd - zoomPercentStart + "%";

      // Trim Slider Logic (Relative to Zoom)
      const trimMin = parseFloat(trimSliderStart.min);
      const trimMax = parseFloat(trimSliderStart.max);
      let trimValStart = parseFloat(trimSliderStart.value);
      let trimValEnd = parseFloat(trimSliderEnd.value);

      if (trimValStart > trimValEnd) {
        trimSliderStart.value = trimValEnd.toString();
        trimValStart = trimValEnd;
      }

      const trimPercentStart =
        ((trimValStart - trimMin) / (trimMax - trimMin)) * 100;
      const trimPercentEnd =
        ((trimValEnd - trimMin) / (trimMax - trimMin)) * 100;

      trimHighlight.style.left = trimPercentStart + "%";
      trimHighlight.style.width = trimPercentEnd - trimPercentStart + "%";

      // Calculate Absolute Times
      if (this.fullAudioBuffer) {
        const duration = this.fullAudioBuffer.duration;

        // Zoom Window (Absolute Times)
        const zoomWindowStart = duration * (zoomPercentStart / 100);
        const zoomWindowEnd = duration * (zoomPercentEnd / 100);
        const zoomWindowDuration = zoomWindowEnd - zoomWindowStart;

        // Trim Times (Absolute, based on Zoom Window)
        const absoluteStart =
          zoomWindowStart + zoomWindowDuration * (trimPercentStart / 100);
        const absoluteEnd =
          zoomWindowStart + zoomWindowDuration * (trimPercentEnd / 100);

        trimStartInput.value = absoluteStart.toFixed(3);
        trimEndInput.value = absoluteEnd.toFixed(3);
      }
    };

    // Zoom Listeners
    zoomSliderStart.addEventListener("input", () => {
      if (
        parseFloat(zoomSliderStart.value) >= parseFloat(zoomSliderEnd.value)
      ) {
        zoomSliderStart.value = zoomSliderEnd.value;
      }
      updateSliderUI();
    });

    zoomSliderEnd.addEventListener("input", () => {
      if (
        parseFloat(zoomSliderEnd.value) <= parseFloat(zoomSliderStart.value)
      ) {
        zoomSliderEnd.value = zoomSliderStart.value;
      }
      updateSliderUI();
    });

    // Trim Listeners
    const restartIfPlaying = () => {
      if (this.previewSource) {
        const start = parseFloat(trimStartInput.value);
        const end = parseFloat(trimEndInput.value);
        this.playPreview(start, end);
      }
    };

    trimSliderStart.addEventListener("input", () => {
      if (
        parseFloat(trimSliderStart.value) >= parseFloat(trimSliderEnd.value)
      ) {
        trimSliderStart.value = trimSliderEnd.value;
      }
      updateSliderUI();
      restartIfPlaying();
    });

    trimSliderEnd.addEventListener("input", () => {
      if (
        parseFloat(trimSliderEnd.value) <= parseFloat(trimSliderStart.value)
      ) {
        trimSliderEnd.value = trimSliderStart.value;
      }
      updateSliderUI();
      restartIfPlaying();
    });

    // Sync number inputs back to sliders (Complex due to relative zoom)
    // For now, let's reset zoom to full if user manually types time, to keep it simple
    const handleManualInput = () => {
      if (!this.fullAudioBuffer) return;
      const duration = this.fullAudioBuffer.duration;
      let start = parseFloat(trimStartInput.value);
      let end = parseFloat(trimEndInput.value);

      if (start < 0) start = 0;
      if (end > duration) end = duration;
      if (start > end) start = end;

      // Reset Zoom to 0-100
      zoomSliderStart.value = "0";
      zoomSliderEnd.value = "100";

      // Set Trim relative to full duration
      const startPercent = (start / duration) * 100;
      const endPercent = (end / duration) * 100;

      trimSliderStart.value = startPercent.toString();
      trimSliderEnd.value = endPercent.toString();

      updateSliderUI();
    };

    trimStartInput.addEventListener("change", handleManualInput);
    trimEndInput.addEventListener("change", handleManualInput);

    sampleRateInput.addEventListener("input", () => {
      sampleRateNumberInput.value = sampleRateInput.value;
    });

    sampleRateNumberInput.addEventListener("input", () => {
      sampleRateInput.value = sampleRateNumberInput.value;
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
      const targetChannels = parseInt(channelsInput.value);
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

      // 1. Extract raw slices from source
      const tempBuffers: Float32Array[] = [];
      for (let i = 0; i < this.fullAudioBuffer.numberOfChannels; i++) {
        const channelData = this.fullAudioBuffer.getChannelData(i);
        const safeEnd = Math.min(endSample, channelData.length);
        const safeStart = Math.min(startSample, safeEnd);
        tempBuffers.push(channelData.slice(safeStart, safeEnd));
      }

      // 2. Process channels based on selection
      const slicedBuffers: Float32Array[] = [];

      if (targetChannels === 1) {
        // Mono Mixdown
        if (tempBuffers.length > 0) {
          const len = tempBuffers[0].length;
          const mix = new Float32Array(len);
          for (let i = 0; i < len; i++) {
            let sum = 0;
            for (let c = 0; c < tempBuffers.length; c++) {
              sum += tempBuffers[c][i];
            }
            mix[i] = sum / tempBuffers.length;
          }
          slicedBuffers.push(mix);
        }
      } else {
        // Stereo (or 2 channels)
        if (tempBuffers.length === 1) {
          // Mono source -> Stereo output (duplicate)
          slicedBuffers.push(tempBuffers[0]);
          slicedBuffers.push(new Float32Array(tempBuffers[0]));
        } else if (tempBuffers.length >= 2) {
          // Stereo source -> Stereo output
          slicedBuffers.push(tempBuffers[0]);
          slicedBuffers.push(tempBuffers[1]);
        }
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

    const detectBpmBtn = document.getElementById("detect-bpm-btn")!;
    const detectKeyBtn = document.getElementById("detect-key-btn")!;

    detectBpmBtn.addEventListener("click", async () => {
      if (!this.fullAudioBuffer) return;
      const originalText = detectBpmBtn.innerText;
      detectBpmBtn.innerText = "...";
      const detector = new DetectBPM({ audioContext: this.audioContext });
      const bpm = await detector.analyzeBPM(this.fullAudioBuffer);
      if (bpm > 0) {
        bpmInput.value = bpm.toString();
      } else {
        alert("Could not detect BPM");
      }
      detectBpmBtn.innerText = originalText;
    });

    detectKeyBtn.addEventListener("click", async () => {
      if (!this.fullAudioBuffer) return;
      const originalText = detectKeyBtn.innerText;
      detectKeyBtn.innerText = "...";
      const detector = new DetectTone({ audioContext: this.audioContext });
      const key = await detector.analyzeKey(this.fullAudioBuffer);
      if (key) {
        const root = key.split(" ")[0];
        const notes = [
          "C",
          "C#",
          "D",
          "D#",
          "E",
          "F",
          "F#",
          "G",
          "G#",
          "A",
          "A#",
          "B",
        ];
        const index = notes.indexOf(root);
        if (index !== -1) {
          pitchInput.value = index.toString();
        }
      } else {
        alert("Could not detect Key");
      }
      detectKeyBtn.innerText = originalText;
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

    const zoomSliderStart = document.getElementById(
      "zoom-slider-start"
    ) as HTMLInputElement;
    const zoomSliderEnd = document.getElementById(
      "zoom-slider-end"
    ) as HTMLInputElement;
    const zoomHighlight = document.getElementById("zoom-highlight")!;

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
    trimEndInput.value = duration.toFixed(3);

    // Reset Zoom Sliders (0-100%)
    zoomSliderStart.value = "0";
    zoomSliderEnd.value = "100";
    zoomHighlight.style.left = "0%";
    zoomHighlight.style.width = "100%";

    // Reset Trim Sliders (0-100% of Zoom Window)
    trimSliderStart.value = "0";
    trimSliderEnd.value = "100";
    trimHighlight.style.left = "0%";
    trimHighlight.style.width = "100%";

    (document.getElementById("encoder-bpm") as HTMLInputElement).value = "120";
    (document.getElementById("encoder-pitch") as HTMLInputElement).value = "0";
    (document.getElementById("encoder-sample-rate") as HTMLInputElement).value =
      this.fullAudioBuffer.sampleRate.toString();
    (
      document.getElementById("encoder-sample-rate-input") as HTMLInputElement
    ).value = this.fullAudioBuffer.sampleRate.toString();
    // document.getElementById("sample-rate-display")!.innerText =
    //   this.fullAudioBuffer.sampleRate.toString();

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
