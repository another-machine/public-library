import { Clock, ClockParams } from "./Clock";
import { Destinations } from "./destinations/Destinations";
import { Drums } from "./Drums";
import { Keyboard, KeyboardParams } from "./Keyboard";
import { Mixer } from "./Mixer";
import { Notes, NotesParams } from "./Notes";
import { Prompt } from "./prompt/Prompt";
import { PromptInterface } from "./prompt/PromptInterface";
import {
  Renderer,
  RendererEventLocation,
  RendererEventType,
  RendererTheme,
} from "./Renderer";
import {
  DrumSequencer,
  Sequencer,
  SequencerParams,
  SynthSequencer,
} from "./Sequencer";
import { Steps } from "./Steps";
import { Synths } from "./Synths";
import { MIDI, type MIDIEvent } from "../../../packages/amplib-devices/src";
import {
  Stega64,
  createImageDropReader,
} from "../../../packages/amplib-steganography/src";
import register from "./prompt/register";
import { Destination } from "./destinations/Destination";

export interface MachineParams {
  clock: ClockParams;
  notes: NotesParams;
  sequencers: SequencerParams[];
  keyboard: KeyboardParams;
  theme: RendererTheme;
}

export class Machine {
  _initialize: () => void = () => {};
  initialized = false;
  element: HTMLElement;
  theme: MachineParams["theme"];
  mixer: Mixer;
  midi: MIDI;
  clock!: Clock;
  destination!: Destination;
  keyboard!: Keyboard;
  notes!: Notes;
  prompt!: Prompt;
  promptInterface!: PromptInterface;
  renderer!: Renderer;
  sequencers!: Sequencer[];

  constructor(initialParams: MachineParams & { element: HTMLElement }) {
    register();
    this.theme = initialParams.theme;
    this.element = initialParams.element;
    this.mixer = new Mixer();
    this.midi = new MIDI(this.onMidiEvent.bind(this));
    this.update(initialParams, true);
    this.setup();
  }

  update(
    { theme, notes, clock, keyboard, sequencers }: MachineParams,
    firstPass = false
  ) {
    this.theme = theme;

    this.stop();

    if (firstPass) {
      this.notes = new Notes(notes);
    } else {
      this.notes.setMode(notes.mode);
      this.notes.setRoot(notes.root);
    }

    if (firstPass) {
      this.clock = new Clock({ ...clock, onTick: this.handleTick.bind(this) });
    } else {
      this.clock.setRate(clock.tempo);
    }

    this.sequencers = sequencers.map((sequencer) => {
      if (sequencer.type === "SYNTH") {
        return new SynthSequencer({
          key: sequencer.key,
          octave: sequencer.octave,
          steps: new Steps(sequencer.steps),
          synths: new Synths(),
        });
      } else if (sequencer.type === "DRUM") {
        return new DrumSequencer({
          key: sequencer.key,
          steps: new Steps(sequencer.steps),
          drums: new Drums(),
        });
      } else {
        return sequencer as never;
      }
    });

    this.keyboard = new Keyboard({
      notes: this.notes,
      main: new Synths(),
      ghosts: new Synths(),
      octave: keyboard.octave,
    });

    if (firstPass) {
      this.renderer = new Renderer({
        theme: this.theme,
        element: this.element,
        sequencers: this.sequencers,
        keyboard: this.keyboard,
        rendererEventHandler: this.handleRendererEvent.bind(this),
      });
    } else {
      this.renderer.update({
        theme: this.theme,
        sequencers: this.sequencers,
        keyboard: this.keyboard,
      });
    }
    this.destination = Destinations.generateDestinations({
      machine: this,
      onExport: this.onExport.bind(this),
      onToggleMachine: this.onToggleMachine.bind(this),
      onToggleRainbow: this.onToggleRainbow.bind(this),
      onModeChange: this.onModeChange.bind(this),
      onStepChange: this.onStepChange.bind(this),
    });

    this._initialize = () => {
      this.keyboard.initialize({
        mixer: this.mixer,
        octave: keyboard.octave,
        main: keyboard.main,
        ghosts: keyboard.ghosts,
      });

      // TODO: close this by default? have button always visible besides escape?
      this.promptInterface.toggle();

      this.sequencers.forEach((sequencer, i) => {
        if (sequencer.type === "SYNTH" && sequencers[i].type === "SYNTH") {
          sequencer.initialize({
            voices: sequencers[i].steps.rows.length,
            volume: sequencers[i].synths.volume,
            mixer: this.mixer,
            settings: sequencers[i].synths.settings,
          });
        } else if (sequencer.type === "DRUM" && sequencers[i].type === "DRUM") {
          sequencer.initialize({
            volume: sequencers[i].synths.volume,
            mixer: this.mixer,
            settings: sequencers[i].synths.settings,
          });
        }
      });
    };

    if (!firstPass) {
      this._initialize();
    }

    if (firstPass) {
      this.prompt = new Prompt({ destination: this.destination });
      this.promptInterface = document.createElement(
        "prompt-interface"
      ) as PromptInterface;
      this.promptInterface.initialize(this.element, this.prompt);
    } else {
      this.prompt.update({ destination: this.destination });
      this.promptInterface.reset(this.element);
    }
  }

  setup() {
    this.renderer.handleStepsSizeChange();
    this.renderer.updateSteps();
    this.renderer.updateKeyboard();

    this.midi.initialize();
    document.body.addEventListener("click", this.initialize.bind(this));
  }

  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    this.mixer.initialize();
    this._initialize();

    createImageDropReader({
      element: document.body,
      onFailure: console.log,
      onSuccess: (source) => {
        const [decoded] = Stega64.decode({ source });
        try {
          const settings = JSON.parse(decoded || "") as MachineParams;
          this.update(settings);
        } catch (e) {
          console.log(e);
        }
      },
    });
  }

  stop() {
    if (this.sequencers) {
      this.sequencers.forEach((sequencer) => sequencer.dispose());
    }
    if (this.keyboard) {
      this.keyboard.dispose();
    }
  }

  exportParams(): MachineParams {
    return {
      theme: this.theme,
      clock: this.clock.exportParams(),
      notes: this.notes.exportParams(),
      sequencers: this.sequencers.map((sequencers) =>
        sequencers.exportParams()
      ),
      keyboard: this.keyboard.exportParams(),
    };
  }

  handleTick(position: number, time: number) {
    this.renderer.renderStep(position);
    this.sequencers.forEach((sequencer) => {
      const seqValues = sequencer.steps.values(position);
      if (sequencer.isSynth()) {
        sequencer.synths.playNotes(
          this.notes.notesForStepsSlots(
            seqValues,
            sequencer.octave,
            sequencer.steps.rows.length > 1
          ),
          time
        );
      } else if (sequencer.isDrum()) {
        sequencer.drums.playVelocities(
          Drums.velocitiesForStepsSlots(seqValues, 2),
          time
        );
      }
    });
  }

  onExport() {
    this.promptInterface.toggle();
    const canvas = Stega64.encode({
      source: this.renderer.snapshot(),
      messages: [JSON.stringify(this.exportParams())],
    });
    canvas.className = "export";
    canvas.addEventListener("click", (e) => canvas.remove());
    document.body.appendChild(canvas);
  }

  onModeChange() {
    this.keyboard.handleIntervalChange({ time: this.clock.time });
    this.renderer.updateKeyboard();
  }

  onStepChange() {
    this.renderer.handleStepsSizeChange();
  }

  onToggleMachine() {
    if (this.clock.state === "started") {
      this.sequencers.forEach((sequencer) =>
        sequencer.stop(this.clock.time + 0.4)
      );
      this.clock.stop();
      this.renderer.stop();
      return false;
    } else {
      this.clock.start();
      this.renderer.start();
      return true;
    }
  }

  onToggleRainbow() {
    this.renderer.hueRotate = !this.renderer.hueRotate;
    return this.renderer.hueRotate;
  }

  onMidiEvent(data: MIDIEvent) {
    // Key events
    if (
      data.channel === 1 &&
      (data.type === "note_on" || data.type === "note_off")
    ) {
      this.initialize();
      const value = data.a?.value;
      if (value !== undefined && value !== null) {
        if (value <= 120) {
          const step = value % 24;
          this.handleRendererEvent(
            data.type === "note_off" ? "RELEASE" : "PRESS",
            "KEYS",
            step
          );
        } else {
          console.log(data);
        }
      }
      // Pad events
    } else if (
      data.channel === 10 &&
      (data.type === "note_on" || data.type === "note_off")
    ) {
      this.initialize();
      if (data.type === "note_off") {
        const value = data.a?.value;
        if (value !== undefined && value !== null) {
          if (value >= 36 && value <= 43) {
            // Turning pad values into 0 - 7. MPK Mini sorts them oddly.
            // Sending play event as 8 to avoid colliding with click event for cursor functionality.
            // TODO: this logic can probably be improved around cursor and this pad.
            const index = [36, 37, 38, 39, 40, 41, 42, undefined, 43].indexOf(
              value
            );
            this.handleRendererEvent("TAP", "PADS", index);
          }
        }
      }
    } else if (data.type === "mode_change") {
      const value = data.a?.value;
      if (value && (value === 70 || value === 71)) {
        const val = data.b?.ratio || 0;
        this.renderer.updateCursor({
          x: value === 71 ? val : undefined,
          y: value === 70 ? val : undefined,
        });
      }
    }
  }

  handleRendererEvent(
    type: RendererEventType,
    location: RendererEventLocation,
    valueA: number,
    valueB?: number
  ) {
    if (type === "TAP" && location === "PADS") {
      // Coming from midi pads, defer to cursor
      if (valueA === 8) {
        if (this.renderer.cursorX === null || this.renderer.cursorY === null) {
          this.onToggleMachine();
        } else {
          this.renderer.handleCursorSelect();
        }
        // Coming from click
      } else if (valueA === 7) {
        this.onToggleMachine();
      } else {
        this.notes.setInterval(valueA);
        this.keyboard.handleIntervalChange({ time: this.clock.time });
        this.renderer.updateKeyboard();
        this.renderer.updatePads(valueA);
      }
    } else if (type === "TAP" && location === "KEYS") {
      this.keyboard.handlePress({
        time: this.clock.time,
        step: valueA % 12,
        octave: Math.floor(valueA / 12),
      });
      this.renderer.updateKeyboard();
    } else if (type === "TAP") {
      valueB = valueB || 0;
      const sequencer = this.sequencers.find(
        (sequencer) => sequencer.key === location
      );
      if (sequencer) {
        sequencer.steps.tap(valueA, valueB);
        this.renderer.updateStep(
          this.renderer.sequencerElements[sequencer.key],
          valueA,
          valueB,
          sequencer.steps.values(valueB)[valueA],
          sequencer.steps.max
        );
      }
    } else if (location === "KEYS") {
      if (type === "PRESS") {
        this.keyboard.handlePress({
          time: this.clock.time,
          step: valueA % 12,
          octave: Math.floor(valueA / 12),
        });
      } else if (type === "RELEASE") {
        this.keyboard.handleRelease({
          time: this.clock.time,
          step: valueA % 12,
          octave: Math.floor(valueA / 12),
        });
      }
      this.renderer.updateKeyboard();
    } else {
      console.log(type, location, valueA, valueB);
    }
    this.promptInterface.renderDestinationInfo();
  }
}
