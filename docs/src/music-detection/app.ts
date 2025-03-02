// @ts-ignore
import { createForm } from "../createForm";
import { UserMediaStream } from "../../../packages/amplib-devices";
import {
  DetectTones,
  DetectBPM,
} from "../../../packages/amplib-music-detection/src";

type FormData = {};

example();

async function example() {
  const userMediaStream = new UserMediaStream();
  const section = document.querySelector("section")!;
  const audio = document.querySelector("audio")!;
  const form = section.querySelector("form")!;
  const output = section.querySelector<HTMLSpanElement>(
    '[data-output="tone-output"]'
  )!;
  let semitones = 0;

  createForm<FormData>({
    form,
    inputs: {},
    onInput: () => {},
    actions: [
      { action: startAudio, name: "Start Audio" },
      { action: startMicrophone, name: "Start Microphone" },
    ],
  });

  let audioContext: AudioContext;
  let playing = false;
  let detector: DetectTones;

  function initialize() {
    playing = true;
    loop();
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    detector = new DetectTones({ audioContext });
  }

  function loop() {
    requestAnimationFrame(loop);
    if (detector) {
      const res = detector.tick();
      output.innerHTML = `${res.label}
${JSON.stringify(res, null, 2)}`;
    }
  }

  async function startAudio() {
    if (playing) {
      return true;
    }
    initialize();
    const source = audioContext.createMediaElementSource(audio);
    await detector.initialize(source);
    source.connect(audioContext.destination);
    audio.play();
    audio.addEventListener("ended", () => {
      playing = false;
    });
  }
  async function startMicrophone() {
    if (playing) {
      return true;
    }
    initialize();
    const stream = await userMediaStream.start({
      audio: true,
      video: false,
    });
    const source = audioContext.createMediaStreamSource(stream);
    await detector.initialize(source);
  }
}
