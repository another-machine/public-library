import { Encoder } from "./Encoder";
import { Mixer } from "./Mixer";
import { AudioEngine } from "./AudioEngine";
import {
  StegaCassette,
  loadAudioBuffersFromAudioUrl,
} from "../../../packages/amplib-steganography/src";

const audioEngine = new AudioEngine();
const encoder = new Encoder();
const mixer = new Mixer(audioEngine);

// Global controls
const playPauseBtn = document.getElementById("play-pause")!;
const globalBpmInput = document.getElementById(
  "global-bpm"
) as HTMLInputElement;
const globalPitchInput = document.getElementById(
  "global-pitch"
) as HTMLInputElement;

const recordingPreviewContainer = document.getElementById(
  "recording-preview-container"
)!;
const recordingPreviewImg = document.getElementById(
  "recording-preview-img"
) as HTMLImageElement;
const recordingDownloadLink = document.getElementById(
  "recording-download-link"
) as HTMLAnchorElement;

playPauseBtn.addEventListener("click", () => {
  const isPlaying = audioEngine.togglePlay();
  if (isPlaying) {
    mixer.resetAnimations();
  }
  playPauseBtn.innerText = isPlaying ? "Stop" : "Play";
});

globalBpmInput.addEventListener("change", () => {
  audioEngine.setGlobalBpm(parseFloat(globalBpmInput.value));
});

globalPitchInput.addEventListener("change", () => {
  audioEngine.setGlobalPitch(parseFloat(globalPitchInput.value));
});

// View switching
const viewCreateBtn = document.getElementById("view-create")!;
const viewMixBtn = document.getElementById("view-mix")!;
const panelCreate = document.getElementById("panel-create")!;
const panelMix = document.getElementById("panel-mix")!;
const drawer = document.getElementById("drawer")!;
const drawerToggle = document.getElementById("drawer-toggle")!;

drawerToggle.addEventListener("click", () => {
  drawer.classList.toggle("open");
});

// Close drawer when clicking outside (optional, but good UX)
document.addEventListener("click", (e) => {
  if (
    drawer.classList.contains("open") &&
    !drawer.contains(e.target as Node) &&
    e.target !== drawerToggle
  ) {
    drawer.classList.remove("open");
  }
});

viewCreateBtn.addEventListener("click", () => {
  panelCreate.classList.remove("hidden");
  panelMix.classList.add("hidden");
  viewCreateBtn.classList.add("active");
  viewMixBtn.classList.remove("active");
  drawer.classList.remove("open");
});

viewMixBtn.addEventListener("click", () => {
  panelCreate.classList.add("hidden");
  panelMix.classList.remove("hidden");
  viewCreateBtn.classList.remove("active");
  viewMixBtn.classList.add("active");
  drawer.classList.remove("open");
});

// Recording
const recordBtn = document.getElementById("record-btn")!;
let isRecording = false;

recordingDownloadLink.addEventListener("click", () => {
  recordingPreviewContainer.classList.add("hidden");
});

recordBtn.addEventListener("click", async () => {
  if (!isRecording) {
    // Start Recording
    isRecording = true;
    recordBtn.innerText = "Stop Recording";
    recordBtn.classList.add("recording");
    audioEngine.startRecording();
  } else {
    // Stop Recording
    isRecording = false;
    recordBtn.innerText = "Processing...";
    (recordBtn as HTMLButtonElement).disabled = true;

    const blob = await audioEngine.stopRecording();
    const blendedImage = mixer.getBlendedImage();

    // Decode the recorded audio to get buffers for encoding
    const url = URL.createObjectURL(blob);
    const audioBuffers = await loadAudioBuffersFromAudioUrl({
      url,
      audioContext: audioEngine.audioContext,
      channels: 2,
    });

    // Encode
    const encodedCanvas = StegaCassette.encode({
      source: blendedImage,
      audioBuffers: audioBuffers,
      sampleRate: 44100,
      bitDepth: 16,
      encoding: "difference",
      encodeMetadata: true,
      borderWidth: 1,
      music: {
        bpm: audioEngine.globalBpm,
        semitones: audioEngine.globalPitch,
      },
    });

    // Show preview in drawer
    const dataUrl = (
      Array.isArray(encodedCanvas) ? encodedCanvas[0] : encodedCanvas
    ).toDataURL();
    const filename = `stega-mix-${Date.now()}.png`;

    recordingPreviewImg.src = dataUrl;
    recordingDownloadLink.href = dataUrl;
    recordingDownloadLink.download = filename;
    recordingPreviewContainer.classList.remove("hidden");

    // Open drawer so user sees the result
    if (!drawer.classList.contains("open")) {
      drawer.classList.add("open");
    }

    recordBtn.innerText = "Record";
    recordBtn.classList.remove("recording");
    (recordBtn as HTMLButtonElement).disabled = false;
  }
});

const recordingAddBtn = document.getElementById("recording-add-btn");
if (recordingAddBtn) {
  recordingAddBtn.addEventListener("click", () => {
    const src = recordingPreviewImg.src;
    if (src) {
      fetch(src)
        .then((res) => res.blob())
        .then((blob) => {
          const file = new File([blob], "recording.png", { type: "image/png" });
          mixer.handleImageFile(file);
        });
    }
  });
}

// Set initial state
viewCreateBtn.click();
