import { Stegassette } from "../../../packages/amplib-steganography/src";

let audioContext: AudioContext;
let current: Stegassette.RevealPlayer | null = null;

document.querySelectorAll("section").forEach((section) => {
  const button = section.querySelector("button");
  const media = button?.querySelector<HTMLImageElement>("img.media");
  const thumb = button?.querySelector<HTMLImageElement>("img:not(.media)");

  if (button && media && thumb) {
    section.style.setProperty(
      "--background",
      `url(${thumb.getAttribute("src")})`
    );

    let player: Stegassette.RevealPlayer | null = null;
    let building = false;

    button.addEventListener("click", async () => {
      audioContext = audioContext || new AudioContext();
      if (building) return;

      if (!player) {
        building = true;
        try {
          player = await Stegassette.createRevealPlayer({
            source: media,
            audioContext,
            className: "player",
          });
          player.element.style.setProperty("--og-width", `${player.width}px`);
          player.element.style.setProperty("--og-height", `${player.height}px`);
          player.element.style.aspectRatio = `${player.width} / ${player.height}`;
          button.appendChild(player.element);
          thumb.classList.add("hidden");
          thumb.setAttribute("aria-hidden", "true");
        } catch (err) {
          console.error("stegassette decode failed", err);
          return;
        } finally {
          building = false;
        }
      }

      // Stop playback in any other section
      if (current && current !== player) {
        current.stop();
        current.element.classList.remove("active");
        current = null;
      }

      if (player.playing) {
        player.stop();
        player.element.classList.remove("active");
        current = null;
      } else {
        player.element.classList.add("active");
        current = player;
        await player.play();
      }
    });
  }
});
