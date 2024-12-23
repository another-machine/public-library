import {
  StegaCassette,
  StegaMetadata,
  loadAudioBuffersFromAudioUrl,
  playDecodedAudioBuffers,
} from "../../../packages/amplib-steganography/src";

export default async function example() {
  const output = document.querySelector<HTMLElement>("#image-four")!;
  const button = document.querySelector<HTMLButtonElement>("#encode-audio")!;
  const audio = document.querySelector<HTMLAudioElement>("#audio-src")!;
  const source = document
    .querySelector<HTMLElement>("#image-three")!
    .querySelector("img")!;

  const audioContext = new AudioContext();
  let stop;

  const defaults: StegaMetadata.StegaMetadataAudio = {
    type: StegaMetadata.StegaContentType.AUDIO,
    bitDepth: 24,
    channels: 2,
    sampleRate: audioContext.sampleRate,
    encoding: "midpoint",
  };

  button.addEventListener("click", async () => {
    if (button.getAttribute("data-play")) {
      if (button.getAttribute("data-play") === "play") {
        button.setAttribute("data-play", "stop");
        button.innerText = "Stop audio playback";
        const source = output.querySelector("canvas")!;
        const metadata: Partial<StegaMetadata.StegaMetadata> =
          StegaMetadata.decode({ source }) || {};
        if (metadata.type === StegaMetadata.StegaContentType.AUDIO) {
          const audioBuffers = StegaCassette.decode({
            source,
            bitDepth: metadata.bitDepth || defaults.bitDepth,
            channels: metadata.channels || defaults.channels,
            encoding: metadata.encoding || defaults.encoding,
          });
          const audio = await playDecodedAudioBuffers({
            audioBuffers,
            audioContext,
            sampleRate: metadata.sampleRate || audioContext.sampleRate,
          });
          stop = () => audio.stop();
        }
      } else {
        stop();
        button.parentElement?.remove();
      }
    } else {
      const sampleRate = audioContext.sampleRate;
      const result = StegaCassette.encode({
        source,
        audioBuffers: await loadAudioBuffersFromAudioUrl({
          url: audio.getAttribute("src")!,
          audioContext,
          stereo: defaults.channels > 1,
          sampleRate,
        }),
        sampleRate,
        bitDepth: defaults.bitDepth,
        encoding: defaults.encoding,
        encodeMetadata: true,
        aspectRatio: undefined,
      });
      output.appendChild(result);
      button.setAttribute("data-play", "play");
      button.innerText = "Play image as audio";
    }
  });
}
