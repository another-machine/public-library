// @ts-ignore
import processor from "worklet:../../../packages/amplib-sound-transformation/src/processors/PhaseVocoderProcessor";
import { SoundTransformation } from "../../../packages/amplib-sound-transformation/src";
import { createForm } from "../createForm";

type FormData = {
  bpm: number;
  semitones: number;
};

example();

async function example() {
  const section = document.querySelector("section")!;
  const audio = document.querySelector("audio")!;
  const form = section.querySelector("form")!;
  let semitones = 0;

  const { setValue } = createForm<FormData>({
    form,
    inputs: {
      bpm: {
        type: "number",
        step: 0.1,
        min: 60,
        max: 240,
        value: 0,
        name: "bpm",
      },
      semitones: {
        type: "number",
        step: 1,
        min: -24,
        max: 24,
        value: semitones,
        name: "semitones",
      },
    },
    onInput,
    actions: [{ action: toggle, name: "Play" }],
  });

  let audioContext: AudioContext;
  let transformation: SoundTransformation;
  let source: AudioBufferSourceNode;
  let audioBuffer: AudioBuffer;
  let playing = false;
  const settings: FormData = { bpm: 0, semitones: 0 };

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
      semitones = 0;
      playing = true;
      source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      button.innerText = "Stop";
      source.onended = () => {
        playing = false;
        button.innerText = "Play";
      };
      transformation = new SoundTransformation({ audioContext });
      await transformation.initialize({
        audioBuffer: source,
        processorJSPath: processor,
      });
      settings.bpm = transformation.bpm;
      setValue("bpm", transformation.bpm);
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
    if (!transformation) {
      return;
    }
    transformation.adjustSpeedToBPM(settings.bpm);
    transformation.adjustPitchBySemitones(semitones * -1);
    semitones = settings.semitones;
    transformation.adjustPitchBySemitones(settings.semitones);
  }
}
