import { Stegassette } from "../../../packages/amplib-steganography/src";

let audioContext: AudioContext;
let current: Stegassette.RevealPlayer | null = null;
let building = false;

const players = new Map<HTMLButtonElement, Stegassette.RevealPlayer>();

document.querySelectorAll<HTMLButtonElement>("nav button").forEach((button) => {
  button.addEventListener("click", async () => {
    audioContext = audioContext || new AudioContext();
    if (building) return;

    const section = button.closest("section");
    const media = button.querySelector<HTMLImageElement>("img.media");
    const thumb = button.querySelector<HTMLImageElement>("img:not(.media)");
    const imgBackground =
      section?.querySelector<HTMLImageElement>("img.background");
    if (!section || !media || !thumb) return;

    const isActive = button.classList.contains("active");
    section.querySelector("button.active")?.classList.remove("active");

    document.body.style.backgroundImage = `url(${thumb.getAttribute("src")})`;

    if (current) {
      current.stop();
    }

    if (isActive) {
      // Toggled off — leave the encoded image showing
      current = null;
      return;
    }

    button.classList.add("active");

    let player = players.get(button);
    if (!player) {
      building = true;
      section.classList.add("loading");
      // Show the thumbnail pulsing in the background slot while decoding
      if (imgBackground) {
        imgBackground.src = thumb.currentSrc || thumb.src;
        imgBackground.classList.remove("hidden");
      }
      section
        .querySelectorAll<HTMLElement>("div.background")
        .forEach((el) => el.remove());
      try {
        player = await Stegassette.createRevealPlayer({
          source: media,
          audioContext,
          className: "background",
        });
        players.set(button, player);
      } catch (err) {
        console.error("stegassette decode failed", err);
        return;
      } finally {
        building = false;
        section.classList.remove("loading");
      }
    }

    // Show only this player's canvases in the section
    imgBackground?.classList.add("hidden");
    section
      .querySelectorAll<HTMLElement>("div.background")
      .forEach((el) => {
        if (el !== player!.element) el.remove();
      });
    if (!player.element.isConnected) {
      section.insertBefore(player.element, section.querySelector("nav"));
    }

    current = player;
    await player.play();
  });
});
