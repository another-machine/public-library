import {
  StegaCassette,
  StegaMetadata,
  playDecodedAudioBuffers,
} from "../../../packages/amplib-steganography/src";

let audioContext: AudioContext;
let currentSource: AudioBufferSourceNode | null = null;
document.querySelectorAll("button").forEach((button) => {
  audioContext = audioContext || new AudioContext();
  button.addEventListener("click", (e) => {
    const section = button.parentElement?.parentElement;
    const media = button.querySelector<HTMLImageElement>("img.media");
    const background =
      section?.querySelector<HTMLImageElement>("img.background");
    const isActive = button.classList.contains("active");
    const activeButton = section?.querySelector("button.active");
    if (activeButton) {
      activeButton.classList.remove("active");
    }
    if (!isActive) {
      button.classList.add("active");
    }

    if (media && background) {
      const src = media.getAttribute("src");
      if (section) {
        document.body.style.backgroundImage = `url(${src})`;
      }
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

        if (currentSource) {
          currentSource.stop();
        }

        if (!isActive) {
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
