import {
  StegaCassette,
  StegaMetadata,
  playDecodedAudioBuffers,
} from "../../../packages/amplib-steganography/src";

let audioContext: AudioContext;
let currentSource: AudioBufferSourceNode | null = null;
let currentSrc: string | null = null;

document.querySelectorAll("section").forEach((section) => {
  const button = section.querySelector("button");
  const media = button?.querySelector<HTMLImageElement>("img.media");
  const thumb = button?.querySelector<HTMLImageElement>("img:not(.media)");

  if (button && media && thumb) {
    section.style.setProperty(
      "--background",
      `url(${thumb.getAttribute("src")})`
    );
    button.addEventListener("click", async (e) => {
      audioContext = audioContext || new AudioContext();

      const src = media.getAttribute("src");
      const alreadyPlaying = currentSrc === src;

      // Show full media image
      if (media.classList.contains("hidden")) {
        thumb.classList.add("hidden");
        thumb.setAttribute("aria-hidden", "true");
        media.classList.remove("hidden");
        media.removeAttribute("aria-hidden");
      }

      // Wait for image to load if not already loaded
      if (!media.complete) {
        await new Promise((resolve) => {
          media.onload = resolve;
        });
      }

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
        source: media,
        bitDepth: metadata.bitDepth,
        channels: metadata.channels,
        encoding: metadata.encoding,
        borderWidth: metadata.borderWidth,
      });

      // Stop current playback
      if (currentSource) {
        document.querySelector(".media.active")?.classList.remove("active");
        currentSource.stop();
        currentSource = null;
        currentSrc = null;
      }

      // Start new playback if not already playing
      if (!alreadyPlaying) {
        media.classList.add("active");
        currentSrc = src;
        currentSource = await playDecodedAudioBuffers({
          audioBuffers,
          audioContext,
          sampleRate: metadata.sampleRate,
        });
        currentSource.loop = true;
      }
    });
  }
});
