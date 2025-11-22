import {
  StegaCassette,
  StegaMetadata,
} from "../../../packages/amplib-steganography/src";
import { AudioEngine } from "./AudioEngine";
import { LoopMetadata } from "./types";

export class Mixer {
  audioEngine: AudioEngine;

  constructor(audioEngine: AudioEngine) {
    this.audioEngine = audioEngine;
    this.setupListeners();
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
        for (let i = 0; i < items.length; i++) {
          if (items[i].kind === "file") {
            const file = items[i].getAsFile();
            if (file && file.type.startsWith("image/")) {
              await this.handleImageFile(file);
            }
          }
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
    await this.audioEngine.addTrack(audioBuffer, loopMetadata);

    this.addTrackUI(image, loopMetadata);
  }

  loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = URL.createObjectURL(file);
    });
  }

  addTrackUI(image: HTMLImageElement, metadata: LoopMetadata) {
    const tracksDiv = document.getElementById("tracks")!;
    const div = document.createElement("div");
    div.className = "track";

    const img = document.createElement("img");
    img.src = image.src;

    const info = document.createElement("div");
    info.className = "track-info";
    info.innerText = `BPM: ${metadata.bpm}, Pitch: ${metadata.pitch}`;

    div.appendChild(img);
    div.appendChild(info);
    tracksDiv.appendChild(div);
  }
}
