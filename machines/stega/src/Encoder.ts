import {
  StegaCassette,
  createDropReader,
} from "../../../packages/amplib-steganography/src";

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

  // State for absolute trim times
  absoluteTrimStart: number = 0;
  absoluteTrimEnd: number = 0;

  // State for dropped image
  droppedImage: HTMLImageElement | null = null;

  // Callback to stop preview from outside setupListeners
  stopPreviewFn: (() => void) | null = null;

  constructor() {
    this.audioContext = new AudioContext();
    this.setupListeners();
  }

  setupListeners() {
    const dropZone = document.getElementById("encoder-drop")!;
    const fileBtn = document.getElementById("encoder-file-btn")!;
    const fileName = document.getElementById("encoder-file-name")!;
    const fileInput = document.getElementById(
      "encoder-input"
    ) as HTMLInputElement;

    const imageDropZone = document.getElementById("encoder-image-drop")!;
    const imageBtn = document.getElementById("encoder-image-btn")!;
    const imageName = document.getElementById("encoder-image-name")!;
    const imageInput = document.getElementById(
      "encoder-image-input"
    ) as HTMLInputElement;

    const controls = document.getElementById("encoder-controls")!;
    const bpmInput = document.getElementById("encoder-bpm") as HTMLInputElement;
    const pitchInput = document.getElementById(
      "encoder-pitch"
    ) as HTMLInputElement;
    // imageInput is already declared above
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
    const encodingTilingInput = document.getElementById(
      "encoder-tiling"
    ) as HTMLSelectElement;
    const borderWidthInput = document.getElementById(
      "encoder-border-width"
    ) as HTMLInputElement;
    const directionSelect = document.getElementById(
      "encoder-direction"
    ) as HTMLSelectElement;
    const resampleSelect = document.getElementById(
      "encoder-resample"
    ) as HTMLSelectElement;
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
    const waveformCanvas = document.getElementById(
      "waveform-canvas"
    ) as HTMLCanvasElement;
    const waveformCanvasFine = document.getElementById(
      "waveform-canvas-fine"
    ) as HTMLCanvasElement;

    let animationFrameId: number | null = null;
    let playbackStartTime: number = 0;

    const drawCoarseWaveform = (playbackTime?: number) => {
      if (!this.fullAudioBuffer) return;
      const ctx = waveformCanvas.getContext("2d");
      if (!ctx) return;

      const width = (waveformCanvas.width = waveformCanvas.clientWidth);
      const height = (waveformCanvas.height = waveformCanvas.clientHeight);
      const data = this.fullAudioBuffer.getChannelData(0);
      const step = Math.ceil(data.length / width);
      const amp = height / 2;

      ctx.clearRect(0, 0, width, height);

      // Calculate zoom region
      const zoomMin = parseFloat(zoomSliderStart.min);
      const zoomMax = parseFloat(zoomSliderStart.max);
      const zoomValStart = parseFloat(zoomSliderStart.value);
      const zoomValEnd = parseFloat(zoomSliderEnd.value);
      const zoomPercentStart = (zoomValStart - zoomMin) / (zoomMax - zoomMin);
      const zoomPercentEnd = (zoomValEnd - zoomMin) / (zoomMax - zoomMin);

      const zoomStartX = zoomPercentStart * width;
      const zoomEndX = zoomPercentEnd * width;

      // Draw waveform
      ctx.fillStyle = "#444";
      for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
          const datum = data[i * step + j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
        ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
      }

      // Draw dark overlay on areas outside zoom region
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      // Left side
      if (zoomStartX > 0) {
        ctx.fillRect(0, 0, zoomStartX, height);
      }
      // Right side
      if (zoomEndX < width) {
        ctx.fillRect(zoomEndX, 0, width - zoomEndX, height);
      }

      // Draw Playback Line
      if (playbackTime !== undefined) {
        const duration = this.fullAudioBuffer.duration;
        const x = (playbackTime / duration) * width;
        ctx.fillStyle = "#fff";
        ctx.fillRect(x, 0, 1, height);
      }
    };

    const drawFineWaveform = (playbackTime?: number) => {
      if (!this.fullAudioBuffer) return;
      const ctx = waveformCanvasFine.getContext("2d");
      if (!ctx) return;

      const width = (waveformCanvasFine.width = waveformCanvasFine.clientWidth);
      const height = (waveformCanvasFine.height =
        waveformCanvasFine.clientHeight);

      // Calculate Zoom Window Absolute Times
      const duration = this.fullAudioBuffer.duration;
      const zoomMin = parseFloat(zoomSliderStart.min);
      const zoomMax = parseFloat(zoomSliderStart.max);
      const zoomValStart = parseFloat(zoomSliderStart.value);
      const zoomValEnd = parseFloat(zoomSliderEnd.value);
      const zoomPercentStart = (zoomValStart - zoomMin) / (zoomMax - zoomMin);
      const zoomPercentEnd = (zoomValEnd - zoomMin) / (zoomMax - zoomMin);

      const zoomWindowStart = duration * zoomPercentStart;
      const zoomWindowEnd = duration * zoomPercentEnd;

      // Get Data Slice
      const data = this.fullAudioBuffer.getChannelData(0);
      const sampleRate = this.fullAudioBuffer.sampleRate;
      const startIndex = Math.floor(zoomWindowStart * sampleRate);
      const endIndex = Math.floor(zoomWindowEnd * sampleRate);
      const sliceLength = endIndex - startIndex;

      if (sliceLength <= 0) return;

      const step = sliceLength / width;
      const amp = height / 2;

      ctx.clearRect(0, 0, width, height);

      // Calculate trim region in zoom window coordinates
      const trimStart = this.absoluteTrimStart;
      const trimEnd = this.absoluteTrimEnd;
      const zoomDuration = zoomWindowEnd - zoomWindowStart;

      let trimStartX = 0;
      let trimEndX = width;

      if (zoomDuration > 0) {
        trimStartX = ((trimStart - zoomWindowStart) / zoomDuration) * width;
        trimEndX = ((trimEnd - zoomWindowStart) / zoomDuration) * width;
      }

      // Draw waveform
      ctx.fillStyle = "#444";
      for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;

        const startSample = Math.floor(startIndex + i * step);
        const endSample = Math.floor(startIndex + (i + 1) * step);

        // Ensure we check at least one sample
        const effectiveEnd = Math.max(startSample + 1, endSample);

        for (let j = startSample; j < effectiveEnd; j++) {
          if (j >= data.length) break;
          const datum = data[j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }

        // Handle case where no samples were processed (e.g. out of bounds)
        if (min > max) {
          if (startSample >= data.length) break;
          // Fallback to single sample
          const datum = data[startSample];
          min = datum;
          max = datum;
        }

        ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
      }

      // Draw dark overlay on areas outside trim region
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      // Left side
      if (trimStartX > 0) {
        ctx.fillRect(0, 0, trimStartX, height);
      }
      // Right side
      if (trimEndX < width) {
        ctx.fillRect(trimEndX, 0, width - trimEndX, height);
      }

      // Draw Playback Line
      if (playbackTime !== undefined) {
        if (playbackTime >= zoomWindowStart && playbackTime <= zoomWindowEnd) {
          const x = ((playbackTime - zoomWindowStart) / zoomDuration) * width;
          ctx.fillStyle = "#fff";
          ctx.fillRect(x, 0, 1, height);
        }
      }
    };

    const drawWaveforms = (playbackTime?: number) => {
      drawCoarseWaveform(playbackTime);
      drawFineWaveform(playbackTime);
    };

    const stopPreview = () => {
      if (this.previewSource) {
        this.previewSource.stop();
        this.previewSource = null;
      }
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      drawWaveforms(); // Clear playback line
    };

    this.stopPreviewFn = stopPreview;

    const playPreview = (start: number, end: number) => {
      if (!this.fullAudioBuffer) return;
      stopPreview();

      this.previewSource = this.audioContext.createBufferSource();
      this.previewSource.buffer = this.fullAudioBuffer;
      this.previewSource.loop = true;
      this.previewSource.loopStart = start;
      this.previewSource.loopEnd = end;
      this.previewSource.connect(this.audioContext.destination);

      // Start at the beginning of the loop
      this.previewSource.start(0, start);

      // Animation Loop
      playbackStartTime = this.audioContext.currentTime;
      const animate = () => {
        if (!this.previewSource) return;

        const now = this.audioContext.currentTime;
        const elapsed = now - playbackStartTime;
        const duration = end - start;
        const currentPos = start + (elapsed % duration);

        drawWaveforms(currentPos);
        animationFrameId = requestAnimationFrame(animate);
      };
      animate();
    };

    const updateSliderUI = (source: "zoom" | "trim" | "manual" = "manual") => {
      if (!this.fullAudioBuffer) return;
      const duration = this.fullAudioBuffer.duration;

      // Zoom Slider Logic
      const zoomMin = parseFloat(zoomSliderStart.min);
      const zoomMax = parseFloat(zoomSliderStart.max);
      let zoomValStart = parseFloat(zoomSliderStart.value);
      let zoomValEnd = parseFloat(zoomSliderEnd.value);

      if (zoomValStart > zoomValEnd) {
        if (source === "zoom") {
          zoomValStart = zoomValEnd;
          zoomSliderStart.value = zoomValStart.toString();
        }
      }

      const zoomPercentStart = (zoomValStart - zoomMin) / (zoomMax - zoomMin);
      const zoomPercentEnd = (zoomValEnd - zoomMin) / (zoomMax - zoomMin);

      zoomHighlight.style.left = zoomPercentStart * 100 + "%";
      zoomHighlight.style.width =
        (zoomPercentEnd - zoomPercentStart) * 100 + "%";

      // Calculate Zoom Window Absolute Times
      const zoomWindowStart = duration * zoomPercentStart;
      const zoomWindowEnd = duration * zoomPercentEnd;
      const zoomWindowDuration = zoomWindowEnd - zoomWindowStart;

      if (source === "zoom") {
        let newTrimSliderStart =
          ((this.absoluteTrimStart - zoomWindowStart) / zoomWindowDuration) *
          100;
        let newTrimSliderEnd =
          ((this.absoluteTrimEnd - zoomWindowStart) / zoomWindowDuration) * 100;

        // Clamp slider values to 0-100 range
        if (newTrimSliderStart < 0) newTrimSliderStart = 0;
        if (newTrimSliderStart > 100) newTrimSliderStart = 100;
        if (newTrimSliderEnd < 0) newTrimSliderEnd = 0;
        if (newTrimSliderEnd > 100) newTrimSliderEnd = 100;

        trimSliderStart.value = newTrimSliderStart.toString();
        trimSliderEnd.value = newTrimSliderEnd.toString();
      } else if (source === "trim") {
        let trimValStart = parseFloat(trimSliderStart.value);
        let trimValEnd = parseFloat(trimSliderEnd.value);

        if (trimValStart > trimValEnd) {
          trimValStart = trimValEnd;
          trimSliderStart.value = trimValStart.toString();
        }

        this.absoluteTrimStart =
          zoomWindowStart + zoomWindowDuration * (trimValStart / 100);
        this.absoluteTrimEnd =
          zoomWindowStart + zoomWindowDuration * (trimValEnd / 100);
      }

      // Update Trim Highlight
      const trimMin = parseFloat(trimSliderStart.min);
      const trimMax = parseFloat(trimSliderStart.max);
      const trimValStart = parseFloat(trimSliderStart.value);
      const trimValEnd = parseFloat(trimSliderEnd.value);

      const trimPercentStart =
        ((trimValStart - trimMin) / (trimMax - trimMin)) * 100;
      const trimPercentEnd =
        ((trimValEnd - trimMin) / (trimMax - trimMin)) * 100;

      trimHighlight.style.left = trimPercentStart + "%";
      trimHighlight.style.width = trimPercentEnd - trimPercentStart + "%";

      // Update Inputs
      trimStartInput.value = this.absoluteTrimStart.toFixed(3);
      trimEndInput.value = this.absoluteTrimEnd.toFixed(3);

      drawWaveforms();
    };

    // Zoom Listeners
    zoomSliderStart.addEventListener("input", () => {
      if (
        parseFloat(zoomSliderStart.value) >= parseFloat(zoomSliderEnd.value)
      ) {
        zoomSliderStart.value = zoomSliderEnd.value;
      }
      updateSliderUI("zoom");
    });

    zoomSliderStart.addEventListener("change", () => {
      if (!this.fullAudioBuffer) return;
      const duration = this.fullAudioBuffer.duration;
      const zoomMin = parseFloat(zoomSliderStart.min);
      const zoomMax = parseFloat(zoomSliderStart.max);
      const zoomValStart = parseFloat(zoomSliderStart.value);
      const zoomValEnd = parseFloat(zoomSliderEnd.value);
      const zoomPercentStart = (zoomValStart - zoomMin) / (zoomMax - zoomMin);
      const zoomPercentEnd = (zoomValEnd - zoomMin) / (zoomMax - zoomMin);
      const zoomWindowStart = duration * zoomPercentStart;
      const zoomWindowEnd = duration * zoomPercentEnd;

      // Clamp absoluteTrim values to stay within zoom window
      if (this.absoluteTrimStart < zoomWindowStart) {
        this.absoluteTrimStart = zoomWindowStart;
      }
      if (this.absoluteTrimStart > zoomWindowEnd) {
        this.absoluteTrimStart = zoomWindowEnd;
      }
      if (this.absoluteTrimEnd < zoomWindowStart) {
        this.absoluteTrimEnd = zoomWindowStart;
      }
      if (this.absoluteTrimEnd > zoomWindowEnd) {
        this.absoluteTrimEnd = zoomWindowEnd;
      }

      updateSliderUI("zoom");
    });

    zoomSliderEnd.addEventListener("input", () => {
      if (
        parseFloat(zoomSliderEnd.value) <= parseFloat(zoomSliderStart.value)
      ) {
        zoomSliderEnd.value = zoomSliderStart.value;
      }
      updateSliderUI("zoom");
    });

    zoomSliderEnd.addEventListener("change", () => {
      if (!this.fullAudioBuffer) return;
      const duration = this.fullAudioBuffer.duration;
      const zoomMin = parseFloat(zoomSliderStart.min);
      const zoomMax = parseFloat(zoomSliderStart.max);
      const zoomValStart = parseFloat(zoomSliderStart.value);
      const zoomValEnd = parseFloat(zoomSliderEnd.value);
      const zoomPercentStart = (zoomValStart - zoomMin) / (zoomMax - zoomMin);
      const zoomPercentEnd = (zoomValEnd - zoomMin) / (zoomMax - zoomMin);
      const zoomWindowStart = duration * zoomPercentStart;
      const zoomWindowEnd = duration * zoomPercentEnd;

      // Clamp absoluteTrim values to stay within zoom window
      if (this.absoluteTrimStart < zoomWindowStart) {
        this.absoluteTrimStart = zoomWindowStart;
      }
      if (this.absoluteTrimStart > zoomWindowEnd) {
        this.absoluteTrimStart = zoomWindowEnd;
      }
      if (this.absoluteTrimEnd < zoomWindowStart) {
        this.absoluteTrimEnd = zoomWindowStart;
      }
      if (this.absoluteTrimEnd > zoomWindowEnd) {
        this.absoluteTrimEnd = zoomWindowEnd;
      }

      updateSliderUI("zoom");
    });

    // Trim Listeners
    const restartIfPlaying = () => {
      if (this.previewSource) {
        playPreview(this.absoluteTrimStart, this.absoluteTrimEnd);
      }
    };

    trimSliderStart.addEventListener("input", () => {
      if (
        parseFloat(trimSliderStart.value) >= parseFloat(trimSliderEnd.value)
      ) {
        trimSliderStart.value = trimSliderEnd.value;
      }
      updateSliderUI("trim");
      restartIfPlaying();
    });

    trimSliderEnd.addEventListener("input", () => {
      if (
        parseFloat(trimSliderEnd.value) <= parseFloat(trimSliderStart.value)
      ) {
        trimSliderEnd.value = trimSliderStart.value;
      }
      updateSliderUI("trim");
      restartIfPlaying();
    });

    // Sync number inputs back to sliders
    const handleManualInput = () => {
      if (!this.fullAudioBuffer) return;
      const duration = this.fullAudioBuffer.duration;
      let start = parseFloat(trimStartInput.value);
      let end = parseFloat(trimEndInput.value);

      if (start < 0) start = 0;
      if (end > duration) end = duration;
      if (start > end) start = end;

      this.absoluteTrimStart = start;
      this.absoluteTrimEnd = end;

      // Reset Zoom to 0-100
      zoomSliderStart.value = "0";
      zoomSliderEnd.value = "100";

      // Set Trim relative to full duration
      const startPercent = (start / duration) * 100;
      const endPercent = (end / duration) * 100;

      trimSliderStart.value = startPercent.toString();
      trimSliderEnd.value = endPercent.toString();

      updateSliderUI("trim");
    };

    trimStartInput.addEventListener("change", handleManualInput);
    trimEndInput.addEventListener("change", handleManualInput);

    sampleRateInput.addEventListener("input", () => {
      sampleRateNumberInput.value = sampleRateInput.value;
    });

    sampleRateNumberInput.addEventListener("input", () => {
      sampleRateInput.value = sampleRateNumberInput.value;
    });

    // Audio Input Logic
    fileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    dropZone.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        fileName.innerText = file.name;
        this.handleAudioFile(file);
      }
    });

    createDropReader({
      element: dropZone,
      onSuccess: ({ audioElements }) => {
        if (audioElements.length > 0) {
          const audio = audioElements[0];
          // Extract filename from src if possible, or just say "Dropped Audio"
          // Since we load from URL, we might not get the original filename easily unless we parse the blob URL or something, which is not useful.
          // But createDropReader handles files.
          // Wait, createDropReader returns elements.
          // If I want the file name, I should probably modify createDropReader or just use the drop event directly if I need the file object for name.
          // But for now let's just set a generic name or try to get it.
          fileName.innerText = "Dropped Audio";
          this.loadAudioFromUrl(audio.src);
        }
      },
      onDragEnter: () => dropZone.classList.add("drag-over"),
      onDragLeave: () => dropZone.classList.remove("drag-over"),
      onDrop: () => dropZone.classList.remove("drag-over"),
      types: ["audio/*"],
    });

    // Image Input Logic
    imageBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      imageInput.click();
    });

    imageDropZone.addEventListener("click", () => imageInput.click());

    imageInput.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        imageName.innerText = file.name;
      }
    });

    createDropReader({
      element: imageDropZone,
      onSuccess: ({ imageElements }) => {
        if (imageElements.length > 0) {
          imageName.innerText = "Dropped Image";
          this.droppedImage = imageElements[0];
        }
      },
      onDragEnter: () => imageDropZone.classList.add("drag-over"),
      onDragLeave: () => imageDropZone.classList.remove("drag-over"),
      onDrop: () => imageDropZone.classList.remove("drag-over"),
      types: ["image/*"],
    });

    previewPlayBtn.addEventListener("click", () => {
      playPreview(this.absoluteTrimStart, this.absoluteTrimEnd);
    });

    previewStopBtn.addEventListener("click", () => stopPreview());

    encodeBtn.addEventListener("click", async () => {
      if (!this.fullAudioBuffer) return;

      const bpm = parseFloat(bpmInput.value);
      const pitch = parseFloat(pitchInput.value);
      const imageFile = imageInput.files?.[0];
      const start = this.absoluteTrimStart;
      const end = this.absoluteTrimEnd;
      const targetSampleRate = parseInt(sampleRateInput.value);
      const targetChannels = parseInt(channelsInput.value);
      const targetBitDepth = parseInt(bitDepthInput.value) as 8 | 16 | 24;
      const targetEncodingTiling = encodingTilingInput.value as any;
      const targetEncodingEncoding = encodingInput.value as any;
      const targetEncoding =
        targetEncodingTiling === "none"
          ? targetEncodingEncoding
          : [targetEncodingEncoding, targetEncodingTiling].join("-");
      const targetBorderWidth = parseInt(borderWidthInput.value);
      const shouldResample = resampleSelect.value === "resample";
      const shouldReverse = directionSelect.value === "reverse";

      if (!imageFile && !this.droppedImage) {
        alert("Please select an image");
        return;
      }

      if (end <= start) {
        alert("End time must be greater than start time");
        return;
      }

      const image = imageFile
        ? await this.loadImage(imageFile)
        : this.droppedImage!;

      // Calculate adjusted BPM and Pitch based on sample rate ratio
      const originalSampleRate = this.fullAudioBuffer.sampleRate;
      let adjustedBpm = bpm;
      let adjustedPitch = pitch;

      if (!shouldResample) {
        // If not resampling, adjust BPM and pitch for the sample rate change
        const ratio = targetSampleRate / originalSampleRate;
        adjustedBpm = bpm * ratio;
        const pitchShift = 12 * Math.log2(ratio);
        adjustedPitch = (((pitch + pitchShift) % 12) + 12) % 12;
      }

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
      let slicedBuffers: Float32Array[] = [];

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

      // 3. Resample if needed
      if (shouldResample && targetSampleRate !== originalSampleRate) {
        const duration = slicedBuffers[0].length / originalSampleRate;
        const newLength = Math.floor(duration * targetSampleRate);

        // Create temporary audio buffer for resampling
        const tempAudioBuffer = this.audioContext.createBuffer(
          slicedBuffers.length,
          slicedBuffers[0].length,
          originalSampleRate
        );

        for (let i = 0; i < slicedBuffers.length; i++) {
          const channelData = tempAudioBuffer.getChannelData(i);
          channelData.set(slicedBuffers[i]);
        }

        // Resample using OfflineAudioContext
        const offlineCtx = new OfflineAudioContext(
          targetChannels,
          newLength,
          targetSampleRate
        );
        const source = offlineCtx.createBufferSource();
        source.buffer = tempAudioBuffer;
        source.connect(offlineCtx.destination);
        source.start();

        const resampledBuffer = await offlineCtx.startRendering();

        // Extract resampled buffers
        slicedBuffers = [];
        for (let i = 0; i < targetChannels; i++) {
          slicedBuffers.push(resampledBuffer.getChannelData(i).slice());
        }
      }

      // 4. Reverse buffers if requested
      if (shouldReverse) {
        slicedBuffers = slicedBuffers.map((buffer) => {
          const reversed = new Float32Array(buffer.length);
          for (let i = 0; i < buffer.length; i++) {
            reversed[i] = buffer[buffer.length - 1 - i];
          }
          return reversed;
        });
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

      generatedControls.classList.remove("hidden");
      resultImg.classList.remove("hidden");
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

    const tapBpmBtn = document.getElementById("detect-bpm-btn")!;
    let tapTimes: number[] = [];

    tapBpmBtn.addEventListener("click", () => {
      const now = Date.now();
      tapTimes.push(now);

      // Keep only the last 8 taps
      if (tapTimes.length > 8) {
        tapTimes.shift();
      }

      // Need at least 2 taps to calculate BPM
      if (tapTimes.length >= 2) {
        const intervals: number[] = [];
        for (let i = 1; i < tapTimes.length; i++) {
          intervals.push(tapTimes[i] - tapTimes[i - 1]);
        }

        // Calculate average interval in milliseconds
        const avgInterval =
          intervals.reduce((a, b) => a + b, 0) / intervals.length;

        // Convert to BPM (60000 ms per minute)
        const bpm = Math.round(60000 / avgInterval);
        bpmInput.value = bpm.toString();

        tapBpmBtn.innerText = `Tap (${tapTimes.length})`;
      } else {
        tapBpmBtn.innerText = "Tap (1)";
      }

      // Reset after 2 seconds of no taps
      setTimeout(() => {
        if (Date.now() - now >= 2000) {
          tapTimes = [];
          tapBpmBtn.innerText = "Tap";
        }
      }, 2000);
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
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    this.setAudioBuffer(audioBuffer);
  }

  async loadAudioFromUrl(url: string) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    this.setAudioBuffer(audioBuffer);
  }

  setAudioBuffer(audioBuffer: AudioBuffer) {
    if (this.stopPreviewFn) this.stopPreviewFn();
    this.fullAudioBuffer = audioBuffer;

    const dropZone = document.getElementById("encoder-drop")!;
    const controls = document.getElementById("encoder-controls")!;

    // Don't hide drop zone, just show controls
    controls.classList.remove("hidden");

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

    this.absoluteTrimStart = 0;
    this.absoluteTrimEnd = duration;

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

    // Trigger waveform draw
    zoomSliderStart.dispatchEvent(new Event("input"));
  }

  loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = URL.createObjectURL(file);
    });
  }
}
