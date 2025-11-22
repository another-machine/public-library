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
  playPauseBtn.innerText = isPlaying ? "Pause" : "Play";
});

globalBpmInput.addEventListener("change", () => {
  audioEngine.setGlobalBpm(parseFloat(globalBpmInput.value));
});

globalPitchInput.addEventListener("change", () => {
  audioEngine.setGlobalPitch(parseFloat(globalPitchInput.value));
});
