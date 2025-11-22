import {
  StegaCassette,
  StegaMetadata,
  StegaAnimator,
} from "../../../packages/amplib-steganography/src";
import { AudioEngine } from "./AudioEngine";
import { LoopMetadata } from "./types";

export class Mixer {
  audioEngine: AudioEngine;
  animators: {
    animator: StegaAnimator;
    track: any;
    currentRotation: number;
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

      this.animators.forEach((item) => {
        const { animator, track } = item;
        const dataArray = new Uint8Array(track.analyserNode.frequencyBinCount);
        track.analyserNode.getByteFrequencyData(dataArray);

        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;

        // Map volume to scale (0.25 to 1 range for example)
        const scale = 0.25 + (average / 255) * 0.75;

        // Rotate based on track speed
        // Base speed 0.5 radians per second
        item.currentRotation += 0.5 * track.speedMultiplier * delta;

        animator.renderFrame({
          scale,
          rotation: item.currentRotation,
          x: 0.5,
          y: 0.5,
        });
      });
      requestAnimationFrame(loop);
    };
    loop();
  }

  setupListeners() {
    const dropZone = document.getElementById("mixer-drop")!;

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", () =>
      dropZone.classList.remove("drag-over")
    );

    dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");

      const items = e.dataTransfer?.items;
      if (items) {
        const files: File[] = [];
        for (let i = 0; i < items.length; i++) {
          if (items[i].kind === "file") {
            const file = items[i].getAsFile();
            if (file && file.type.startsWith("image/")) {
              files.push(file);
            }
          }
        }
        // Process sequentially to avoid race conditions or UI jank
        for (const file of files) {
          await this.handleImageFile(file);
        }
      }
    });
  }

  async handleImageFile(file: File) {
    const image = await this.loadImage(file);

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
    const div = document.createElement("div");
    div.className = "track";

    // Create Animator
    const animator = new StegaAnimator({
      source: image,
      resolution: 500,
      fadeAmount: 0.9, // Trail effect
    });

    // Style the canvas
    this.animators.push({ animator, track, currentRotation: 0 });

    const controlsContainer = document.createElement("div");
    controlsContainer.className = "track-controls";

    const info = document.createElement("div");
    info.className = "track-info";
    info.innerText = `BPM: ${metadata.bpm}, Pitch: ${metadata.pitch}`;
    controlsContainer.appendChild(info);

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.flexDirection = "column";
    controls.style.gap = "5px";
    controls.style.marginTop = "10px"; // Speed Controls
    const speedControls = document.createElement("div");
    speedControls.style.display = "flex";
    speedControls.style.gap = "5px";
    const speeds = [0.5, 1, 2];
    speeds.forEach((speed) => {
      const btn = document.createElement("button");
      btn.innerText = `${speed}x`;
      btn.onclick = () => {
        this.audioEngine.setTrackSpeedMultiplier(track, speed);
        // Update active state
        Array.from(speedControls.children).forEach(
          (c) => ((c as HTMLElement).style.background = "")
        );
        btn.style.background = "#666";
      };
      if (speed === 1) btn.style.background = "#666";
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
      btn.onclick = () => {
        this.audioEngine.setTrackOctaveShift(track, octave);
        // Update active state
        Array.from(octaveControls.children).forEach(
          (c) => ((c as HTMLElement).style.background = "")
        );
        btn.style.background = "#666";
      };
      if (octave === 0) btn.style.background = "#666";
      octaveControls.appendChild(btn);
    });
    controls.appendChild(octaveControls);

    // Volume Control
    const volumeControl = document.createElement("div");
    volumeControl.style.display = "flex";
    volumeControl.style.alignItems = "center";
    volumeControl.style.gap = "5px";

    const volLabel = document.createElement("span");
    volLabel.innerText = "Vol:";
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

    div.appendChild(animator.canvas);
    div.appendChild(controlsContainer);
    tracksDiv.appendChild(div);
  }

  resetAnimations() {
    this.animators.forEach((item) => {
      item.currentRotation = 0;
    });
  }

  getBlendedImage(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    // Set size based on first image or default
    if (this.animators.length > 0) {
      const first = this.animators[0].animator.source as HTMLCanvasElement;
      canvas.width = first.width;
      canvas.height = first.height;
    } else {
      canvas.width = 1000;
      canvas.height = 1000;
    }

    // Fill with black background
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = "screen";

    this.animators.forEach(({ animator }) => {
      ctx.drawImage(
        animator.source as HTMLCanvasElement,
        0,
        0,
        canvas.width,
        canvas.height
      );
    });

    return canvas;
  }
}
