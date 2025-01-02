// @ts-ignore
import processor from "worklet:../../../packages/amplib-sound-transformation/src/processors/PhaseVocoderProcessor";
import { SoundTransformation } from "../../../packages/amplib-sound-transformation/src";
import { createForm } from "../createForm";

type FormData = {
  pitch: number;
  speed: number;
};

example();

async function example() {
  const section = document.querySelector("section")!;
  const audio = document.querySelector("audio")!;

  createForm<FormData>({
    form: section.querySelector("form")!,
    inputs: {
      pitch: {
        type: "range",
        step: 0.001,
        min: 0,
        max: 3,
        value: 1,
        name: "pitch",
      },
      speed: {
        type: "range",
        step: 0.001,
        min: 0,
        max: 3,
        value: 1,
        name: "speed",
      },
    },
    onInput,
    actions: [{ action: toggle, name: "Play" }],
  });

  let audioContext: AudioContext;
  let transformationA: SoundTransformation;
  let source: AudioBufferSourceNode;
  let audioBuffer: AudioBuffer;
  let playing = false;
  const settings: FormData = { pitch: 1, speed: 1 };

  async function toggle(button) {
    if (!audioContext) {
      audioContext = new AudioContext();
      const response = await fetch(audio.getAttribute("src") || "");
      const audioData = await response.arrayBuffer();
      audioBuffer = await audioContext.decodeAudioData(audioData);
    }

    if (playing) {
      source.stop();
      playing = false;
      button.innerText = "Play";
    } else {
      playing = true;
      source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      button.innerText = "Stop";
      source.onended = () => {
        playing = false;
        button.innerText = "Play";
      };
      transformationA = new SoundTransformation({ audioContext });
      await transformationA.initialize({
        audioBuffer: source,
        processorJSPath: processor,
      });
      updateTransformations();
      source.start();
    }
  }

  function onInput(params) {
    for (let k in params) {
      settings[k] = params[k];
    }
    updateTransformations();
  }

  function updateTransformations() {
    if (!transformationA) {
      return;
    }
    transformationA.updatePitch(settings.pitch);
    transformationA.updateSpeed(settings.speed);
  }
}
