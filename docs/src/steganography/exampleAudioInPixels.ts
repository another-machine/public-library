import {
  Stegassette,
  loadAudioBuffersFromAudioUrl,
} from "../../../packages/amplib-steganography/src";
import { createForm } from "../createForm";

// Canvas chrome — the frame around the data, not the data. A stylesheet can't
// reach inside a canvas, so these resolve a theme token through a probe element
// and fall back to the literal when the page sets no tokens. The rgb() fills
// further down are the encoded pixels themselves and stay literal always.
function themeColor(token: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = `var(${token}, ${fallback})`;
  document.documentElement.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || fallback;
}

const COLOR_SHAPE = themeColor("--ht-ink-dim", "#333");
const COLOR_BACKGROUND = themeColor("--ht-sunken", "#eee");
const COLOR_PLAYHEAD = themeColor("--ht-ink", "#6e1152");
const SIZE_LINE = 3;

/** How many samples the strip shows at once. */
const WINDOW_SAMPLES = 64;

/**
 * Where a sample's bytes land in the encoded image.
 *
 * The encode is deliberately degenerate so the pixels *are* the payload: a
 * black cover under `combine: "xor"` leaves every key channel at 0, and
 * `a ^ 0 === a`, so each data channel holds one raw PCM byte verbatim. Any
 * other cover would show the payload blended with the image instead, which is
 * the normal case but not what this section is trying to make visible.
 */
interface PixelMap {
  /** Traversal order: interior pixel index → linear interior coordinate. */
  path: Uint32Array;
  /** Byte offset of the audio payload within the interior stream. */
  dataOffset: number;
  bytesPerPixel: number;
  bytesPerSample: number;
  /** Interior width/height and border, for turning a path value into x/y. */
  interiorWidth: number;
  border: number;
  /** Cached pixel bytes of the whole encoded canvas. */
  pixels: Uint8ClampedArray;
  canvasWidth: number;
}

export default async function example() {
  const section = document.getElementById("example-audio-in-pixels")!;
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
    bitsPerSample: "24",
    sampleRate: 48000,
    playbackRate: "1",
  };

  let waveformImageData: ImageData | null = null;
  let pixelMap: PixelMap | null = null;

  const { setValue } = createForm<{
    bitsPerSample: string;
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
        action: async () => {
          if (isPlaying) {
            pause();
          } else {
            play();
          }
        },
      },
    ],
    inputs: {
      bitsPerSample: {
        type: "select",
        options: ["8", "16", "24"],
        value: state.bitsPerSample,
        name: "bitsPerSample",
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
        // Derived, not a literal: createForm writes every input's initial value
        // into its [data-value] spans, so a placeholder would show as fact
        // until the first sampleRate change.
        value: Number(((WINDOW_SAMPLES / state.sampleRate) * 1000).toFixed(1)),
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
      state.bitsPerSample = values.bitsPerSample;
      state.sampleRate = values.sampleRate;
      state.playbackRate = values.playbackRate;
      if (changed.includes("bitsPerSample")) {
        // 3 bytes per pixel, so the window's pixel count follows the sample width.
        const bytesPerSample = Number(values.bitsPerSample) / 8;
        const pixelCount = Math.ceil((WINDOW_SAMPLES * bytesPerSample) / 3);
        setValue("pixels", pixelCount);
        setValue(
          "samplesPerPixel",
          values.bitsPerSample === "24"
            ? "1 sample"
            : values.bitsPerSample === "16"
            ? "1.5 samples"
            : "3 samples"
        );
        setValue("dimension", String(Math.ceil(Math.sqrt(pixelCount))));
      }
      if (changed.includes("sampleRate")) {
        setValue(
          "milliseconds",
          ((WINDOW_SAMPLES / values.sampleRate) * 1000).toFixed(1)
        );
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

    const bitsPerSample = parseInt(state.bitsPerSample) as 8 | 16 | 24;
    const encoded = Stegassette.encode({
      source: createBlackCanvas(),
      entries: [
        Stegassette.buildAudioEntry({
          channels: resampledAudioBuffers,
          sampleRate: state.sampleRate,
          bitsPerSample,
          name: "example.pcm",
        }),
      ],
      combine: "xor",
      keymap: "adjacent",
      traversal: "raster",
      border: 1,
      aspectRatio: 1,
    });

    pixelMap = buildPixelMap(encoded, bitsPerSample);

    // Append to figure element for styling
    const figure = section.querySelector("#viz-source-encoded")!;
    figure.querySelector("canvas")?.remove();
    figure.appendChild(encoded);
  }

  /**
   * Read back everything needed to locate a sample in the encoded image.
   * The options come from the image itself rather than from the encode call —
   * a STGC image is self-describing, and reading it that way keeps this honest.
   */
  function buildPixelMap(
    encoded: HTMLCanvasElement,
    bitsPerSample: 8 | 16 | 24
  ): PixelMap {
    const { entries, opts } = Stegassette.decode({ source: encoded });
    if (!entries.length) throw new Error("encoded image carried no entries");
    const border = opts.borderWidth;
    const interiorWidth = encoded.width - 2 * border;
    const interiorHeight = encoded.height - 2 * border;
    const context = encoded.getContext("2d")!;

    return {
      path: Stegassette.getPathIndices(
        interiorWidth,
        interiorHeight,
        opts.traversal,
        opts.params ?? {}
      ),
      dataOffset: entries[0].dataOffset,
      bytesPerPixel: opts.plan?.bytesPerPixel ?? 3,
      bytesPerSample: bitsPerSample / 8,
      interiorWidth,
      border,
      pixels: context.getImageData(0, 0, encoded.width, encoded.height).data,
      canvasWidth: encoded.width,
    };
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
    if (!resampledAudioBuffers.length || !pixelMap) return;

    const data = resampledAudioBuffers[0];
    const totalSamples = data.length;
    // Current sample is at slot 0
    const currentSampleIndex = Math.min(
      Math.floor(progress * totalSamples),
      totalSamples - 1
    );
    const samples = new Float32Array(WINDOW_SAMPLES);

    // Fill the window starting from the current position
    for (let i = 0; i < WINDOW_SAMPLES; i++) {
      const index = currentSampleIndex + i;
      samples[i] = index < totalSamples ? data[index] : 0;
    }

    drawWaveform64(samples);
    const pixels = getPixelsForSampleWindow(currentSampleIndex);
    drawLines64(pixels);
    drawPixels64(pixels);
  }

  /**
   * The pixels covering WINDOW_SAMPLES samples starting at `startSampleIndex`,
   * followed through the traversal path the header declared.
   */
  function getPixelsForSampleWindow(
    startSampleIndex: number
  ): { r: number; g: number; b: number }[] {
    if (!pixelMap) return [];
    const {
      path,
      dataOffset,
      bytesPerPixel,
      bytesPerSample,
      interiorWidth,
      border,
      pixels,
      canvasWidth,
    } = pixelMap;

    const startByte = dataOffset + startSampleIndex * bytesPerSample;
    const startPixel = Math.floor(startByte / bytesPerPixel);
    const pixelCount = Math.ceil((WINDOW_SAMPLES * bytesPerSample) / 3);

    const out: { r: number; g: number; b: number }[] = [];
    for (let i = 0; i < pixelCount; i++) {
      const pathIndex = startPixel + i;
      if (pathIndex >= path.length) break;
      const v = path[pathIndex];
      const x = (v % interiorWidth) + border;
      const y = ((v / interiorWidth) | 0) + border;
      const offset = (y * canvasWidth + x) * 4;
      out.push({
        r: pixels[offset],
        g: pixels[offset + 1],
        b: pixels[offset + 2],
      });
    }
    return out;
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

    const step = width / WINDOW_SAMPLES;
    const halfStep = step * 0.5;
    const amp = height / 2;

    ctx.beginPath();
    ctx.moveTo(halfStep, amp);
    for (let i = 0; i < WINDOW_SAMPLES; i++) {
      const x = i * step + halfStep;
      const y = (1 - samples[i]) * amp; // Invert y because canvas y goes down
      ctx.lineTo(x, y);
    }
    ctx.lineWidth = SIZE_LINE;
    ctx.strokeStyle = COLOR_SHAPE;
    ctx.stroke();

    // Draw points
    ctx.fillStyle = COLOR_SHAPE;
    for (let i = 0; i < WINDOW_SAMPLES; i++) {
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
    if (!count) return;
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

    // 24-bit: 64 samples = 64 pixels, so 8×8 is exact.
    // 16-bit: 43 pixels into 7×7. 8-bit: 22 pixels into 5×5.
    const count = pixels.length;
    if (!count) return;
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
    const quantizedBuffer = applyBitsPerSample(
      resampledAudioBuffers[0],
      parseInt(state.bitsPerSample) as 8 | 16 | 24
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

  function applyBitsPerSample(
    samples: Float32Array,
    bitsPerSample: 8 | 16 | 24
  ): Float32Array {
    const result = new Float32Array(samples.length);
    const maxValue =
      bitsPerSample === 8 ? 127.5 : bitsPerSample === 16 ? 32767.5 : 8388607.5;

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      // Convert to integer and back to simulate bit depth
      const intValue = Math.floor((sample + 1) * maxValue);
      result[i] = intValue / maxValue - 1;
    }

    return result;
  }
}
