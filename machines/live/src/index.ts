import {
  StegaCassette,
  StegaMetadata,
  playDecodedAudioBuffers,
} from "../../../packages/amplib-steganography/src";

let audioContext: AudioContext;
let currentSource: AudioBufferSourceNode | null = null;
let currentSrc: string | null = null;
document.querySelectorAll("button").forEach((button) => {
  audioContext = audioContext || new AudioContext();
  button.addEventListener("click", (e) => {
    const section = button.parentElement;
    const media = button.querySelector<HTMLImageElement>("img.media");
    const background =
      section?.querySelector<HTMLImageElement>("img.background");

    if (media && background) {
      const src = media.getAttribute("src");
      const sameSrc = src === currentSrc;
      background.classList.remove("hidden");
      background.setAttribute("src", src || "");
      background.setAttribute("height", media.getAttribute("height") || "");
      background.setAttribute("width", media.getAttribute("width") || "");
      // Decode metadata

      background.onload = async () => {
        const metadata = StegaMetadata.decode({ source: media });
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
          source: background,
          bitDepth: metadata.bitDepth,
          channels: metadata.channels,
          encoding: metadata.encoding,
          borderWidth: metadata.borderWidth,
        });

        // Create AudioBuffer
        const audioBuffer = audioContext.createBuffer(
          audioBuffers.length,
          audioBuffers[0].length,
          metadata.sampleRate
        );
        for (let i = 0; i < audioBuffers.length; i++) {
          audioBuffer.copyToChannel(audioBuffers[i], i);
        }

        if (currentSource) {
          currentSource.stop();
        }

        if (sameSrc) {
          currentSrc = null;
        } else {
          currentSrc = src;
          currentSource = await playDecodedAudioBuffers({
            audioBuffers,
            audioContext,
            sampleRate: metadata.sampleRate,
          });
          currentSource.loop = true;
        }
      };
    }
  });
});
