import { StegaCassette } from "@ampl/steganography";

const audio = document.getElementById("audio") as HTMLAudioElement;
const input = document.getElementById("input") as HTMLImageElement;
const output = document.getElementById("output") as HTMLImageElement;
let initialized = false;

input.addEventListener("click", async () => {
  const audioContext = new AudioContext();
  const sampleRate = 41000;
  // Resize image and encode audio into pixels
  const cassette = new StegaCassette({
    audioContext,
    sampleRate,
  });
  const buffer = await cassette.loadAudioBufferFromAudioUrl(
    audio.getAttribute("src") as string
  );
  output.src = cassette.encode(input, buffer).toDataURL();

  input.style.display = "none";
  output.style.display = "block";

  if (!initialized) {
    initialized = true;
    output.addEventListener("click", () => {
      const decodedAudio = cassette.decode(output);
      cassette.play(decodedAudio);
    });
  }
});
