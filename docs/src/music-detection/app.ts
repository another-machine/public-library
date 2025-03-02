// @ts-ignore
import { createForm } from "../createForm";
import { UserMediaStream } from "../../../packages/amplib-devices";
import { Note } from "../../../packages/amplib-music-theory";
import {
  DetectTones,
  DetectBPM,
} from "../../../packages/amplib-music-detection";

type FormData = {};

const oscillators: { notes: GainNode[]; triad: OscillatorNode[] } = {
  notes: [],
  triad: [],
};

example();

async function example() {
  const userMediaStream = new UserMediaStream();
  const section = document.querySelector("section")!;
  const audio = document.querySelector("audio")!;
  const form = section.querySelector("form")!;
  const output = section.querySelector<HTMLSpanElement>(
    '[data-output="tone-output"]'
  )!;

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
      output.innerHTML = `${notePresence(res)}
${JSON.stringify(res, null, 2)}`;
      const nodes = getGainNodes(res.tones, audioContext);
      const maxVol = 1 / 16;
      nodes.notes.forEach((node, i) => {
        node.gain.value = res.tones[i].prominence * maxVol;
      });
      if (res.guess.chord) {
        res.guess.chord.notes.forEach((note, i) => {
          if (nodes.triad[i]) {
            nodes.triad[i].frequency.value =
              Note.octaveStepFrequencies[note.octave + 5][
                Note.notationIndex(note.notation)
              ];
          }
        });
      } else if (res.notes.length) {
        nodes.triad[0].frequency.value =
          Note.octaveStepFrequencies[5][
            Note.notationIndex(res.notes[0].notation)
          ];
        nodes.triad[1].frequency.value =
          Note.octaveStepFrequencies[5][
            Note.notationIndex(res.notes[1].notation)
          ];
        nodes.triad[2].frequency.value =
          Note.octaveStepFrequencies[5][
            Note.notationIndex(res.notes[2].notation)
          ];
      }
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
    audio.volume = 0.3;
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

function notePresence({ notes }) {
  const values = {};
  notes.forEach(({ notation, value }) => {
    values[notation] = value;
  });
  return "C C# D D# E F F# G G# A A# B"
    .split(" ")
    .map((a) => `<span style="opacity:${values[a] || 0}">${a}</span>`)
    .join(" ");
}

function getGainNodes(
  notes: { frequency: number }[],
  audioContext: AudioContext
) {
  if (oscillators.notes.length) {
    return oscillators;
  }

  for (let i = 0; i < 3; i++) {
    const oscillator = audioContext.createOscillator();
    oscillator.type = "triangle";
    const gain = audioContext.createGain();
    oscillators.triad.push(oscillator);
    gain.gain.value = 0.012;
    gain.connect(audioContext.destination);
    oscillator.frequency.value = 0;
    oscillator.connect(gain);
    oscillator.start();
  }

  notes.forEach(({ frequency }) => {
    const oscillator = audioContext.createOscillator();
    oscillator.type = "triangle";
    const gain = audioContext.createGain();
    oscillators.notes.push(gain);
    gain.gain.value = 0;
    gain.connect(audioContext.destination);
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start();
  });

  return oscillators;
}
