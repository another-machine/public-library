import {
  StegaCassette,
  loadAudioBuffersFromAudioUrl,
} from "../../../packages/amplib-steganography/src";
import { createForm } from "../createForm";

const COLOR_SHAPE = "#333";
const COLOR_BACKGROUND = "#eee";
const COLOR_PLAYHEAD = "#6e1152";
const SIZE_LINE = 3;

export default async function example() {
  const section = document.getElementById("example-visualization")!;
  const audio = section.querySelector("audio")!;
  const form = section.querySelector("form")!;
  const fullWaveformCanvas = section.querySelector(
    "#viz-full-waveform"
  ) as HTMLCanvasElement;
  const waveform64Canvas = section.querySelector(
    "#viz-waveform-64"
  ) as HTMLCanvasElement;
  const lines64Canvas = section.querySelector(
    "#viz-lines-64"
  ) as HTMLCanvasElement;
  const pixels64Canvas = section.querySelector(
    "#viz-pixels-64"
  ) as HTMLCanvasElement;

  const audioContext = new AudioContext();
  let originalAudioBuffers: Float32Array[] = [];
  let resampledAudioBuffers: Float32Array[] = [];
  let audioSource: AudioBufferSourceNode | null = null;
  let startTime = 0;
  let pauseTime = 0;
  let isPlaying = false;
  let isDragging = false;
  let manualProgress = 0;

  const state = {
    bitDepth: "24",
    sampleRate: 48000,
    playbackRate: "1",
  };

  let waveformImageData: ImageData | null = null;
  let encodedCanvas: HTMLCanvasElement | null = null;

  const { setValue } = createForm<{
    bitDepth: string;
    sampleRate: number;
    playbackRate: string;
    pixels: number;
    milliseconds: number;
    samplesPerPixel: string;
    dimension: string;
  }>({
    form,
    actions: [
      {
        name: "Toggle Audio",
        action: async (element) => {
          if (isPlaying) {
            pause();
          } else {
            play();
          }
        },
      },
    ],
    inputs: {
      bitDepth: {
        type: "select",
        options: ["8", "16", "24"],
        value: state.bitDepth,
        name: "bitDepth",
      },
      sampleRate: {
        type: "range",
        min: 3000,
        max: 48000,
        value: state.sampleRate,
        name: "sampleRate",
      },
      playbackRate: {
        type: "select",
        options: ["0.0001", "0.001", "0.01", "0.1", "1", "2"],
        value: state.playbackRate,
        name: "playbackRate",
      },
      pixels: {
        type: "number",
        value: 64,
        name: "pixels",
        hidden: true,
      },
      milliseconds: {
        type: "number",
        value: 1,
        name: "milliseconds",
        hidden: true,
      },
      samplesPerPixel: {
        type: "text",
        value: "1 sample",
        hidden: true,
        name: "samplesPerPixel",
      },
      dimension: { type: "text", value: "8", hidden: true, name: "dimension" },
    },
    onInput: async (values, changed) => {
      state.bitDepth = values.bitDepth;
      state.sampleRate = values.sampleRate;
      state.playbackRate = values.playbackRate;
      if (changed.includes("bitDepth")) {
        setValue(
          "pixels",
          values.bitDepth === "24" ? 64 : values.bitDepth === "16" ? 43 : 22
        );
        setValue(
          "samplesPerPixel",
          values.bitDepth === "24"
            ? "1 sample"
            : values.bitDepth === "16"
            ? "1.5 samples"
            : "3 samples"
        );
        setValue(
          "dimension",
          values.bitDepth === "24" ? "8" : values.bitDepth === "16" ? "7" : "5"
        );
      }
      if (changed.includes("sampleRate")) {
        setValue("milliseconds", ((64 / values.sampleRate) * 1000).toFixed(1));
      }
      await update();
    },
  });

  // Hide original audio element
  audio.style.display = "none";
  audio.removeAttribute("controls");

  // Initial load
  await update();
  loop();

  // Setup drag handler for seeking
  fullWaveformCanvas.style.cursor = "ew-resize";

  const handleSeek = (e: MouseEvent) => {
    const rect = fullWaveformCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, x / rect.width));

    if (isPlaying) {
      play(progress);
    } else {
      manualProgress = progress;
      const duration = resampledAudioBuffers[0].length / state.sampleRate;
      pauseTime = progress * duration;
    }
  };

  fullWaveformCanvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    handleSeek(e);
  });

  window.addEventListener("mousemove", (e) => {
    if (isDragging) {
      handleSeek(e);
    }
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  async function update() {
    const url = audio.getAttribute("src")!;

    // Stop current playback if any
    if (audioSource) {
      audioSource.stop();
      audioSource = null;
    }
    isPlaying = false;
    pauseTime = 0;

    // Load original audio only if not loaded yet
    if (originalAudioBuffers.length === 0) {
      originalAudioBuffers = await loadAudioBuffersFromAudioUrl({
        url,
        audioContext,
        channels: 1, // Example is mono
        sampleRate: audioContext.sampleRate, // Use native sample rate
      });
      drawFullWaveform(); // Only redraw if original changed
    }

    // Create resampled version for playback
    resampledAudioBuffers = await loadAudioBuffersFromAudioUrl({
      url,
      audioContext,
      channels: 1,
      sampleRate: state.sampleRate,
    });

    // Encode using StegaCassette with solid encoding
    const blackCanvas = createBlackCanvas();
    encodedCanvas = StegaCassette.encode({
      source: blackCanvas,
      audioBuffers: resampledAudioBuffers,
      sampleRate: state.sampleRate,
      bitDepth: parseInt(state.bitDepth) as 8 | 16 | 24,
      encoding: "solid",
      encodeMetadata: false,
      aspectRatio: 1, // Square
      borderWidth: 0,
    });

    // Append to figure element for styling
    const figure = section.querySelector("#viz-source-encoded")!;
    const canvas = figure.querySelector("canvas");
    if (canvas) {
      canvas.remove();
    }
    figure.appendChild(encodedCanvas);
  }

  function createBlackCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 100, 100);
    return canvas;
  }

  function loop() {
    requestAnimationFrame(loop);
    if (!originalAudioBuffers.length || !resampledAudioBuffers.length) return;

    let progress = 0;
    if (isPlaying) {
      const elapsed = audioContext.currentTime - startTime;
      const duration = resampledAudioBuffers[0].length / state.sampleRate;
      const playbackRate = parseFloat(state.playbackRate);
      // Apply playback rate to progress calculation
      progress = ((elapsed * playbackRate) % duration) / duration;
    } else {
      const duration = resampledAudioBuffers[0].length / state.sampleRate;
      progress = isDragging ? manualProgress : pauseTime / duration;
    }

    drawPlayhead(progress);
    drawSubVisualizations(progress);
  }

  function drawFullWaveform() {
    const canvas = fullWaveformCanvas;
    const ctx = canvas.getContext("2d")!;
    const width = canvas.clientWidth * 2;
    const height = canvas.clientHeight * 2;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = COLOR_BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    if (!originalAudioBuffers.length) return;

    const data = originalAudioBuffers[0];
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.beginPath();
    ctx.moveTo(0, amp);
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const index = i * step + j;
        if (index >= data.length) break;
        const datum = data[index];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.lineTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.strokeStyle = COLOR_SHAPE;
    ctx.stroke();
  }

  function drawPlayhead(progress: number) {
    const canvas = fullWaveformCanvas;
    const ctx = canvas.getContext("2d")!;
    const width = canvas.width;
    const height = canvas.height;

    // Save waveform image data on first draw
    if (!waveformImageData && originalAudioBuffers.length) {
      drawFullWaveform();
      waveformImageData = ctx.getImageData(0, 0, width, height);
    }

    // Restore saved waveform instead of redrawing
    if (waveformImageData) {
      ctx.putImageData(waveformImageData, 0, 0);
    }

    const x = progress * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.strokeStyle = COLOR_PLAYHEAD;
    ctx.lineWidth = SIZE_LINE;
    ctx.stroke();
  }

  function drawSubVisualizations(progress: number) {
    if (!resampledAudioBuffers.length || !encodedCanvas) return;

    const data = resampledAudioBuffers[0];
    const totalSamples = data.length;
    // Current sample is at slot 0
    const currentSampleIndex = Math.min(
      Math.floor(progress * totalSamples),
      totalSamples - 1
    );
    const samples = new Float32Array(64);

    // Fill 64 samples starting from current position
    for (let i = 0; i < 64; i++) {
      if (currentSampleIndex + i < totalSamples) {
        samples[i] = data[currentSampleIndex + i];
      } else {
        samples[i] = 0;
      }
    }

    drawWaveform64(samples);
    const pixels = getPixelsFromEncodedCanvas(currentSampleIndex);
    drawLines64(pixels);
    drawPixels64(pixels);
  }

  function getPixelsFromEncodedCanvas(
    startSampleIndex: number
  ): { r: number; g: number; b: number }[] {
    if (!encodedCanvas) return [];

    const ctx = encodedCanvas.getContext("2d")!;
    const bitDepth = parseInt(state.bitDepth) as 8 | 16 | 24;

    // Calculate how many pixels represent 64 samples
    let pixelCount: number;
    if (bitDepth === 24) {
      pixelCount = 64; // 1 sample per pixel
    } else if (bitDepth === 16) {
      pixelCount = Math.ceil((64 / 3) * 2); // 3 samples per 2 pixels
    } else {
      pixelCount = Math.ceil(64 / 3); // 3 samples per pixel
    }

    // Calculate starting pixel index (skip first pixel as it's used for reference)
    let startPixelIndex: number;
    if (bitDepth === 24) {
      startPixelIndex = startSampleIndex + 1; // +1 to skip reference pixel
    } else if (bitDepth === 16) {
      startPixelIndex = Math.floor((startSampleIndex / 3) * 2) + 1;
    } else {
      startPixelIndex = Math.floor(startSampleIndex / 3) + 1;
    }

    // Get pixels from canvas (solid encoding uses left-to-right, top-to-bottom)
    const pixels: { r: number; g: number; b: number }[] = [];
    const imageData = ctx.getImageData(
      0,
      0,
      encodedCanvas.width,
      encodedCanvas.height
    );
    const data = imageData.data;

    for (
      let i = 0;
      i < pixelCount && i < encodedCanvas.width * encodedCanvas.height;
      i++
    ) {
      const pixelIndex = startPixelIndex + i;
      const dataIndex = pixelIndex * 4;

      if (dataIndex + 2 < data.length) {
        pixels.push({
          r: data[dataIndex],
          g: data[dataIndex + 1],
          b: data[dataIndex + 2],
        });
      }
    }

    return pixels;
  }

  function drawWaveform64(samples: Float32Array) {
    const canvas = waveform64Canvas;
    const ctx = canvas.getContext("2d")!;
    const width = canvas.clientWidth * 2;
    const height = canvas.clientHeight * 2;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = COLOR_BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    const step = width / 64;
    const halfStep = step * 0.5;
    const amp = height / 2;

    ctx.beginPath();
    ctx.moveTo(halfStep, amp);
    for (let i = 0; i < 64; i++) {
      const x = i * step + halfStep;
      const y = (1 - samples[i]) * amp; // Invert y because canvas y goes down
      ctx.lineTo(x, y);
    }
    ctx.lineWidth = SIZE_LINE;
    ctx.strokeStyle = COLOR_SHAPE;
    ctx.stroke();

    // Draw points
    ctx.fillStyle = COLOR_SHAPE;
    for (let i = 0; i < 64; i++) {
      const x = i * step + halfStep;
      const y = (1 - samples[i]) * amp;
      ctx.fillRect(x - SIZE_LINE / 2, y - SIZE_LINE, SIZE_LINE, SIZE_LINE * 2);
    }
  }

  function drawLines64(pixels: { r: number; g: number; b: number }[]) {
    const canvas = lines64Canvas;
    const ctx = canvas.getContext("2d")!;
    const width = canvas.clientWidth * 2;
    const height = canvas.clientHeight * 2;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = COLOR_BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    const count = pixels.length;
    const step = width / count;

    // Top third for separate RGB channels (3 rows)
    const topThirdHeight = height / 3;
    const channelHeight = topThirdHeight / 3;

    // Draw R, G, B channels separately
    for (let i = 0; i < count; i++) {
      const { r, g, b } = pixels[i];

      // Red channel
      ctx.fillStyle = `rgb(${r}, 0, 0)`;
      ctx.fillRect(i * step, 0, step, channelHeight);

      // Green channel
      ctx.fillStyle = `rgb(0, ${g}, 0)`;
      ctx.fillRect(i * step, channelHeight, step, channelHeight);

      // Blue channel
      ctx.fillStyle = `rgb(0, 0, ${b})`;
      ctx.fillRect(i * step, channelHeight * 2, step, channelHeight);
    }

    // Bottom 2/3 for combined color columns
    const combinedStartY = topThirdHeight;
    const combinedHeight = height - topThirdHeight;

    for (let i = 0; i < count; i++) {
      const { r, g, b } = pixels[i];
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(i * step, combinedStartY, step, combinedHeight);
    }
  }
  function drawPixels64(pixels: { r: number; g: number; b: number }[]) {
    const canvas = pixels64Canvas;
    const ctx = canvas.getContext("2d")!;
    const width = canvas.clientWidth * 2;
    const height = canvas.clientHeight * 2;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = COLOR_BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    // If 24-bit, 64 samples = 64 pixels. 8x8 is perfect.
    // If 8-bit, 64 samples = 22 pixels. 5x5 is 25.
    // If 16-bit, 64 samples = 43 pixels. 7x7 is 49.

    const count = pixels.length;
    const gridSize = Math.ceil(Math.sqrt(count));
    const cellSize = width / gridSize;

    for (let i = 0; i < count; i++) {
      const x = (i % gridSize) * cellSize;
      const y = Math.floor(i / gridSize) * cellSize;
      const { r, g, b } = pixels[i];
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x, y, cellSize, cellSize);
    }
  }

  function play(seekProgress?: number) {
    if (audioSource) {
      audioSource.stop();
    }

    // Apply bit depth quantization
    const quantizedBuffer = applyBitDepth(
      resampledAudioBuffers[0],
      parseInt(state.bitDepth) as 8 | 16 | 24
    );

    // Create AudioBuffer at the current sample rate
    const buffer = audioContext.createBuffer(
      1,
      quantizedBuffer.length,
      state.sampleRate
    );
    const channelData = buffer.getChannelData(0);
    channelData.set(quantizedBuffer);

    // Create source
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = buffer;
    audioSource.loop = true;
    audioSource.playbackRate.value = parseFloat(state.playbackRate);
    audioSource.connect(audioContext.destination);

    // Set start time and position
    const startOffset =
      seekProgress !== undefined
        ? seekProgress * (quantizedBuffer.length / state.sampleRate)
        : pauseTime;

    const playbackRate = parseFloat(state.playbackRate);
    audioSource.start(0, startOffset);
    // Adjust startTime to account for playback rate
    startTime = audioContext.currentTime - startOffset / playbackRate;
    isPlaying = true;
  }

  function pause() {
    if (audioSource) {
      const elapsed = audioContext.currentTime - startTime;
      const playbackRate = parseFloat(state.playbackRate);
      // Adjust pauseTime to account for playback rate
      pauseTime = elapsed * playbackRate;
      audioSource.stop();
      audioSource = null;
    }
    isPlaying = false;
  }

  function applyBitDepth(
    samples: Float32Array,
    bitDepth: 8 | 16 | 24
  ): Float32Array {
    const result = new Float32Array(samples.length);
    const maxValue =
      bitDepth === 8 ? 127.5 : bitDepth === 16 ? 32767.5 : 8388607.5;

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      // Convert to integer and back to simulate bit depth
      const intValue = Math.floor((sample + 1) * maxValue);
      result[i] = intValue / maxValue - 1;
    }

    return result;
  }
}
