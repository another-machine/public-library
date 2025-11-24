import {
  StegaCassette,
  StegaMetadata,
  createDropReader,
} from "../../../packages/amplib-steganography/src";
import { AudioEngine } from "./AudioEngine";
import { LoopMetadata } from "./types";

export class Mixer {
  audioEngine: AudioEngine;
  visuals: {
    canvas: HTMLCanvasElement;
    source: HTMLImageElement;
    track: any;
  }[] = [];

  constructor(audioEngine: AudioEngine) {
    this.audioEngine = audioEngine;
    this.setupListeners();
    this.startAnimationLoop();
  }

  startAnimationLoop() {
    let lastTime = Date.now();
    const loop = () => {
      const now = Date.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      this.visuals.forEach((item) => {
        const { canvas, track } = item;
        const dataArray = new Uint8Array(track.analyserNode.frequencyBinCount);
        track.analyserNode.getByteFrequencyData(dataArray);

        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;

        // Map volume to opacity (0.3 to 1 range)
        const opacity = average / 255;
        canvas.style.setProperty("--opacity", opacity.toString());
      });
      requestAnimationFrame(loop);
    };
    loop();
  }

  setupListeners() {
    const dropZone = document.getElementById("mixer-drop")!;
    const addBtn = document.getElementById("mixer-add-btn")!;

    // Create hidden input for button
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.multiple = true;
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    fileInput.addEventListener("change", async () => {
      if (fileInput.files) {
        for (let i = 0; i < fileInput.files.length; i++) {
          const file = fileInput.files[i];
          if (file.type.startsWith("image/")) {
            await this.handleImageFile(file);
          }
        }
      }
      fileInput.value = "";
    });

    createDropReader({
      element: dropZone,
      onSuccess: async ({ imageElements }) => {
        for (const image of imageElements) {
          await this.handleImage(image);
        }
      },
      onDragEnter: () => dropZone.classList.add("drag-over"),
      onDragLeave: () => dropZone.classList.remove("drag-over"),
      onDrop: () => dropZone.classList.remove("drag-over"),
      types: ["image/*"],
    });
  }

  async handleImageFile(file: File) {
    const image = await this.loadImage(file);
    await this.handleImage(image);
  }

  async handleImage(image: HTMLImageElement) {
    // Decode metadata
    const metadata = StegaMetadata.decode({ source: image });
    if (
      !metadata ||
      (metadata.type !== StegaMetadata.StegaContentType.AUDIO &&
        metadata.type !== StegaMetadata.StegaContentType.MUSIC)
    ) {
      console.error("Invalid metadata");
      return;
    }

    // Decode audio
    const audioBuffers = StegaCassette.decode({
      source: image,
      bitDepth: metadata.bitDepth,
      channels: metadata.channels,
      encoding: metadata.encoding,
      borderWidth: metadata.borderWidth,
    });

    // Create AudioBuffer
    const audioBuffer = this.audioEngine.audioContext.createBuffer(
      audioBuffers.length,
      audioBuffers[0].length,
      metadata.sampleRate
    );
    for (let i = 0; i < audioBuffers.length; i++) {
      audioBuffer.copyToChannel(audioBuffers[i], i);
    }

    // Get custom metadata
    let loopMetadata: LoopMetadata = { bpm: 120, pitch: 0 };
    if (metadata.type === StegaMetadata.StegaContentType.MUSIC) {
      loopMetadata = { bpm: metadata.bpm, pitch: metadata.semitones };
    }

    // Set global values if this is the first track
    if (this.visuals.length === 0) {
      this.audioEngine.setGlobalBpm(loopMetadata.bpm);
      this.audioEngine.setGlobalPitch(loopMetadata.pitch);

      const globalBpmInput = document.getElementById(
        "global-bpm"
      ) as HTMLInputElement;
      const globalPitchInput = document.getElementById(
        "global-pitch"
      ) as HTMLInputElement;

      if (globalBpmInput) globalBpmInput.value = loopMetadata.bpm.toString();
      if (globalPitchInput)
        globalPitchInput.value = loopMetadata.pitch.toString();
    }

    // Add to engine
    const track = await this.audioEngine.addTrack(audioBuffer, loopMetadata);

    this.addTrackUI(image, loopMetadata, track);
  }

  loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = URL.createObjectURL(file);
    });
  }

  addTrackUI(image: HTMLImageElement, metadata: LoopMetadata, track: any) {
    const tracksDiv = document.getElementById("tracks")!;
    const trackControlsList = document.getElementById("track-controls-list")!;

    const div = document.createElement("div");
    div.className = "track";

    // Create Canvas
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight);

    // Store visual
    this.visuals.push({ canvas, source: image, track });

    // --- Create Control Panel Item ---
    const controlItem = document.createElement("div");
    controlItem.className = "track-control-item";
    controlItem.style.marginBottom = "15px";
    controlItem.style.paddingBottom = "15px";
    controlItem.style.borderBottom = "1px solid var(--input-border)";
    controlItem.style.display = "flex";
    controlItem.style.gap = "10px";

    // Tiny Preview
    const previewCanvas = document.createElement("canvas");
    const aspectRatio = image.width / image.height;
    const previewWidth = 50;
    const previewHeight = previewWidth / aspectRatio;

    previewCanvas.width = previewWidth;
    previewCanvas.height = previewHeight;
    previewCanvas.style.width = "50px";
    previewCanvas.style.height = "auto";
    previewCanvas.style.alignSelf = "flex-start";

    const pCtx = previewCanvas.getContext("2d")!;
    pCtx.drawImage(image, 0, 0, previewWidth, previewHeight);
    controlItem.appendChild(previewCanvas);

    // Controls Container
    const controlsContainer = document.createElement("div");
    controlsContainer.style.flex = "1";

    const info = document.createElement("div");
    info.className = "track-info";
    info.style.textAlign = "left";
    info.style.marginBottom = "5px";
    info.innerText = `BPM: ${metadata.bpm}, Pitch: ${metadata.pitch}`;
    controlsContainer.appendChild(info);

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.flexDirection = "column";
    controls.style.gap = "5px";

    // Speed Controls
    const speedControls = document.createElement("div");
    speedControls.style.display = "flex";
    speedControls.style.gap = "5px";
    const speeds = [0.5, 1, 2];
    speeds.forEach((speed) => {
      const btn = document.createElement("button");
      btn.innerText = `${speed}x`;
      btn.style.padding = "4px";
      btn.style.fontSize = "11px";
      btn.onclick = () => {
        this.audioEngine.setTrackSpeedMultiplier(track, speed);
        // Update active state
        Array.from(speedControls.children).forEach((c) =>
          (c as HTMLElement).classList.remove("active")
        );
        btn.classList.add("active");
      };
      if (speed === 1) btn.classList.add("active");
      speedControls.appendChild(btn);
    });
    controls.appendChild(speedControls);

    // Octave Controls
    const octaveControls = document.createElement("div");
    octaveControls.style.display = "flex";
    octaveControls.style.gap = "5px";
    const octaves = [-1, 0, 1];
    octaves.forEach((octave) => {
      const btn = document.createElement("button");
      btn.innerText =
        octave === 0 ? "Norm" : `${octave > 0 ? "+" : ""}${octave} Oct`;
      btn.style.padding = "4px";
      btn.style.fontSize = "11px";
      btn.onclick = () => {
        this.audioEngine.setTrackOctaveShift(track, octave);
        // Update active state
        Array.from(octaveControls.children).forEach((c) =>
          (c as HTMLElement).classList.remove("active")
        );
        btn.classList.add("active");
      };
      if (octave === 0) btn.classList.add("active");
      octaveControls.appendChild(btn);
    });
    controls.appendChild(octaveControls);

    // Reverse Control
    const reverseBtn = document.createElement("button");
    reverseBtn.innerText = "Rev";
    reverseBtn.style.padding = "4px";
    reverseBtn.style.fontSize = "11px";
    reverseBtn.onclick = () => {
      const isReversed = !track.isReversed;
      this.audioEngine.setTrackReversed(track, isReversed);
      if (isReversed) {
        reverseBtn.classList.add("active");
      } else {
        reverseBtn.classList.remove("active");
      }
    };
    controls.appendChild(reverseBtn);

    // Volume Control
    const volumeControl = document.createElement("div");
    volumeControl.style.display = "flex";
    volumeControl.style.alignItems = "center";
    volumeControl.style.gap = "5px";

    const volLabel = document.createElement("span");
    volLabel.innerText = "Vol:";
    volLabel.style.fontSize = "11px";
    volumeControl.appendChild(volLabel);

    const volSlider = document.createElement("input");
    volSlider.type = "range";
    volSlider.min = "0";
    volSlider.max = "2";
    volSlider.step = "0.1";
    volSlider.value = "1";
    volSlider.oninput = (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.audioEngine.setTrackVolume(track, val);
    };
    volumeControl.appendChild(volSlider);

    controls.appendChild(volumeControl);
    controlsContainer.appendChild(controls);
    controlItem.appendChild(controlsContainer);

    trackControlsList.appendChild(controlItem);

    div.appendChild(canvas);
    tracksDiv.appendChild(div);
  }

  resetAnimations() {
    // No-op
  }

  getBlendedImage(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    // Set size based on first image or default
    if (this.visuals.length > 0) {
      const first = this.visuals[0].source;
      canvas.width = first.width;
      canvas.height = first.height;
    } else {
      canvas.width = 1000;
      canvas.height = 1000;
    }

    // Fill with black background
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.imageSmoothingEnabled = true;

    this.visuals.forEach(({ source }, index) => {
      if (index === 0) {
        // Draw first image at 100% opacity
        ctx.globalAlpha = 1.0;
      } else {
        // Draw remaining images with reduced opacity based on count
        const remainingCount = this.visuals.length;
        ctx.globalAlpha = 1.0 / remainingCount;
      }
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    });

    return canvas;
  }
}
