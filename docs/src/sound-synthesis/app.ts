import {
  AudioGraph,
  DrumMachine,
  DrumSynth,
  FMVoice,
  PATTERN_NAMES,
  loadLimiterWorklet,
  createLimiterNode,
  type PatternName,
} from "../../../packages/amplib-sound-synthesis/src";
import { Note } from "../../../packages/amplib-music-theory/src";
import { createForm } from "../createForm";

type FormData = {
  pattern: string;
  bpm: number;
  ratio: number;
  index: number;
  decay: number;
  pluckLevel: number;
  drumLevel: number;
  drumFilter: number;
  echoWet: number;
};

/** A minor pentatonic, as pitch classes over two octaves of a C root. */
const SCALE_STEPS = [0, 3, 5, 7, 10];

export function example() {
  const section = document.querySelector("section")!;
  const form = section.querySelector("form")!;
  const status = section.querySelector('[data-output="status"]')!;
  const limiter = section.querySelector('[data-output="limiter"]')!;
  form.innerHTML = "";

  let graph: AudioGraph | null = null;
  let drumSynth: DrumSynth | null = null;
  let drumMachine: DrumMachine | null = null;
  let voices: FMVoice[] = [];
  let nextVoice = 0;
  let unsubscribeStep: (() => void) | null = null;
  let arpStep = 0;

  const { values } = createForm<FormData>({
    form,
    inputs: {
      pattern: {
        name: "pattern",
        type: "select",
        value: "rock",
        options: [...PATTERN_NAMES],
      },
      bpm: { name: "bpm", type: "range", value: 96, min: 40, max: 180, step: 1 },
      ratio: {
        name: "fm ratio",
        type: "range",
        value: 2,
        min: 0.25,
        max: 6,
        step: 0.25,
      },
      index: {
        name: "fm index",
        type: "range",
        value: 1.5,
        min: 0,
        max: 8,
        step: 0.1,
      },
      decay: {
        name: "decay",
        type: "range",
        value: 0.25,
        min: 0.02,
        max: 1.2,
        step: 0.01,
      },
      pluckLevel: {
        name: "pluck level",
        type: "range",
        value: 0.5,
        min: 0,
        max: 1,
        step: 0.01,
      },
      drumLevel: {
        name: "drum level",
        type: "range",
        value: 0.7,
        min: 0,
        max: 1,
        step: 0.01,
      },
      drumFilter: {
        name: "drum filter hz",
        type: "range",
        value: 12000,
        min: 300,
        max: 14000,
        step: 100,
      },
      echoWet: {
        name: "drum echo",
        type: "range",
        value: 0,
        min: 0,
        max: 1,
        step: 0.01,
      },
    },
    onInput,
    actions: [{ name: "Play", action: toggle }],
  });

  function onInput(formData: FormData) {
    if (drumMachine) {
      drumMachine.setBpm(formData.bpm);
      drumMachine.setPattern(formData.pattern as PatternName);
    }
    if (drumSynth) {
      drumSynth.setVolume(formData.drumLevel);
      drumSynth.setFilter({ frequency: formData.drumFilter, q: 0.7 });
      drumSynth.setEcho({
        timeMs: (60 / formData.bpm) * 750,
        feedback: 0.35,
        wet: formData.echoWet,
      });
    }
    if (graph) {
      // Balance the two layers at the bus rather than by scaling each pluck's
      // peak — a bus gain rides over notes that are already ringing, where a
      // change to peak would only apply from the next note onward.
      graph.pluckBus.gain.setTargetAtTime(
        formData.pluckLevel,
        graph.audioContext.currentTime,
        0.02
      );
    }
    for (const voice of voices) {
      voice.ratio = formData.ratio;
      voice.index = formData.index;
    }
  }

  async function toggle(button: HTMLButtonElement) {
    if (graph) {
      stop();
      button.innerText = "Play";
      return;
    }
    await start();
    button.innerText = "Stop";
  }

  async function start() {
    // A user gesture is what makes this legal — browsers will not let an
    // AudioContext start without one.
    const audioContext = new AudioContext();
    graph = new AudioGraph({ audioContext });
    // Nothing is being inserted between the pad and the makeup stage here, so
    // the two ends have to be joined explicitly.
    graph.bypassInsert();

    // Eight voices into the pluck bus, which is high-passed at 300 Hz so the
    // arpeggio never competes with the kick.
    voices = Array.from({ length: 8 }, () => {
      const panner = audioContext.createStereoPanner();
      panner.connect(graph!.pluckBus);
      return new FMVoice({
        audioContext,
        destination: panner,
        ratio: values.ratio,
        index: values.index,
      });
    });

    drumSynth = new DrumSynth({
      audioContext,
      destination: graph.layerSum,
    });
    drumMachine = new DrumMachine({
      drumSynth,
      bpm: values.bpm,
      pattern: values.pattern as PatternName,
    });
    // The arpeggio rides the drum machine's own scheduler instead of a timer
    // of its own. Every note is placed at a `time` the drums already committed
    // to, so the two cannot drift apart no matter how the tempo changes or how
    // badly the browser throttles the page.
    arpStep = 0;
    unsubscribeStep = drumMachine.onStep(({ index, time }) => {
      // Eighth notes against a sixteenth-note grid.
      if (index % 2 !== 0) return;
      pluckNext(time);
    });

    drumMachine.start();
    onInput(values);

    status.innerHTML = "running";

    // The limiter is a progressive enhancement: the graph already has a
    // compressor doing the job, and swapping only happens if the worklet
    // actually loads.
    const loaded = await loadLimiterWorklet(audioContext);
    if (loaded && graph) {
      graph.swapToWorkletLimiter(
        createLimiterNode({
          audioContext,
          onMetrics: ({ lufsShort, gr }) => {
            limiter.innerHTML = `LUFS ${lufsShort.toFixed(
              1
            )}   gain reduction ${gr.toFixed(2)} dB`;
          },
        })
      );
      limiter.innerHTML = "worklet limiter active";
    } else {
      limiter.innerHTML = "worklet unavailable — safety compressor in use";
    }
  }

  function pluckNext(when: number) {
    if (!voices.length) return;
    const step = SCALE_STEPS[arpStep % SCALE_STEPS.length];
    const octave = 3 + (Math.floor(arpStep / SCALE_STEPS.length) % 2);
    const frequency = Note.octaveStepFrequencies[octave][step];
    const voice = voices[nextVoice];
    nextVoice = (nextVoice + 1) % voices.length;
    voice.pluck(frequency, {
      peak: 0.5,
      ampDecayTau: values.decay,
      attackTau: 0.002,
      when,
    });
    arpStep++;
  }

  function stop() {
    unsubscribeStep?.();
    unsubscribeStep = null;
    drumMachine?.stop();
    for (const voice of voices) voice.disconnect();
    voices = [];
    drumSynth?.disconnect();
    graph?.audioContext.close();
    graph = null;
    drumSynth = null;
    drumMachine = null;
    status.innerHTML = "stopped";
    limiter.innerHTML = "";
  }
}
