import { Encoder } from "./Encoder";
import { Mixer } from "./Mixer";
import { AudioEngine } from "./AudioEngine";

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
  panelCreate.style.display = "block";
  panelMix.style.display = "none";
  viewCreateBtn.style.background = "#666";
  viewMixBtn.style.background = "";
  drawer.classList.remove("open");
});

viewMixBtn.addEventListener("click", () => {
  panelCreate.style.display = "none";
  panelMix.style.display = "block";
  viewCreateBtn.style.background = "";
  viewMixBtn.style.background = "#666";
  drawer.classList.remove("open");
});

// Set initial state
viewMixBtn.click();
