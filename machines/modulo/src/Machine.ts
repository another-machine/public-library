import { getDraw } from "tone";
import { Clock, ClockParams } from "./Clock";
import { Destinations } from "./destinations/Destinations";
import { Drums } from "./Drums";
import { Keyboard, KeyboardParams } from "./Keyboard";
import { LocalStorage } from "./LocalStorage";
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
  Stegassette,
  createDropReader,
} from "../../../packages/amplib-steganography/src";
import register from "./prompt/register";

const SETTINGS_MIMETYPE = "text/json";
const SETTINGS_NAME = "modulo.json";

export interface MachineCore {
  theme: number;
  clock: ClockParams;
  notes: NotesParams;
}

export interface MachineParams {
  core: MachineCore;
  sequencers: SequencerParams[];
  keys: KeyboardParams;
  theme: RendererTheme;
}

export class Machine {
  _initialize: () => void = () => {};
  initialized = false;
  element: HTMLElement;
  mixer: Mixer;
  midi: MIDI;
  clock!: Clock;
  destinations!: Destinations;
  keys!: Keyboard;
  notes!: Notes;
  prompt!: Prompt;
  promptInterface!: PromptInterface;
  renderer!: Renderer;
  sequencers!: Sequencer[];
  // Session-only mixer state — muting a channel shouldn't change what an
  // export or save reports for its volume.
  channelMutes = new Set<string>();
  channelSolos = new Set<string>();
  private saveTimeout?: number;

  constructor(initialParams: MachineParams & { element: HTMLElement }) {
    register();
    this.element = initialParams.element;
    this.mixer = new Mixer();
    this.midi = new MIDI({ onEvent: this.onMidiEvent.bind(this) });
    this.update(initialParams, true);
    this.setup();
  }

  update({ theme, core, keys, sequencers }: MachineParams, firstPass = false) {
    this.stop();

    // Dispose and reinitialize mixer on updates to prevent audio corruption
    if (!firstPass && this.initialized) {
      this.mixer.dispose();
      this.mixer.initialize();
    }

    if (firstPass) {
      this.notes = new Notes(core.notes);
    } else {
      this.notes.setMode(core.notes.mode);
      this.notes.setRoot(core.notes.root);
    }

    if (firstPass) {
      this.clock = new Clock({
        ...core.clock,
        onTick: this.handleTick.bind(this),
      });
    } else {
      this.clock.setRate(core.clock.tempo);
    }

    this.sequencers = sequencers.map((sequencer) => {
      if (sequencer.type === "SYNTH") {
        return new SynthSequencer({
          theme: sequencer.theme,
          key: sequencer.key,
          octave: sequencer.octave,
          steps: new Steps(sequencer.steps),
          synths: new Synths(sequencer.synths, sequencer.steps.rows.length),
        });
      } else if (sequencer.type === "DRUM") {
        return new DrumSequencer({
          theme: sequencer.theme,
          key: sequencer.key,
          steps: new Steps(sequencer.steps),
          drums: new Drums(sequencer.synths),
        });
      } else {
        return sequencer as never;
      }
    });

    this.keys = new Keyboard({
      theme: keys.theme,
      notes: this.notes,
      main: new Synths(keys.main, 1),
      ghosts: new Synths(keys.ghosts, keys.ghosts.voices),
      octave: keys.octave,
    });

    if (firstPass) {
      this.renderer = new Renderer({
        theme,
        core,
        element: this.element,
        sequencers: this.sequencers,
        keys: this.keys,
        rendererEventHandler: this.handleRendererEvent.bind(this),
      });
    } else {
      this.renderer.update({
        theme,
        core,
        sequencers: this.sequencers,
        keys: this.keys,
      });
    }

    this.destinations = new Destinations({
      machine: this,
      onExport: this.onExport.bind(this),
      onToggleMachine: this.onToggleMachine.bind(this),
      onToggleRainbow: this.onToggleRainbow.bind(this),
      onModeChange: this.onModeChange.bind(this),
      onStepChange: this.onStepChange.bind(this),
      onPropertyChange: this.onPropertyChange.bind(this),
    });

    this._initialize = () => {
      this.keys.initialize({
        theme: keys.theme,
        mixer: this.mixer,
        octave: keys.octave,
        main: keys.main,
        ghosts: keys.ghosts,
      });

      this.sequencers.forEach((sequencer, i) => {
        sequencer.initialize({ mixer: this.mixer });
      });
    };

    if (!firstPass) {
      this._initialize();
    }

    if (firstPass) {
      this.prompt = new Prompt({ destination: this.destinations.root });
      this.promptInterface = document.createElement(
        "prompt-interface"
      ) as PromptInterface;
      this.promptInterface.initialize(this.element, this.prompt, {
        onToggle: (open) => this.renderer.setEditorOpen(open),
        // Not every property's onSet reports a change, so persist from the one
        // place that sees them all.
        onChange: () => this.onPropertyChange(),
      });
    } else {
      this.prompt.update({ destination: this.destinations.root });
      this.promptInterface.reset(this.element);
    }

    // Auto-save state to localStorage on updates (except first initialization)
    if (!firstPass && this.initialized) {
      this.debouncedSaveToLocalStorage();
    }

    // Audio nodes and rail buttons were just rebuilt; re-silence whatever
    // was muted or un-soloed before the update.
    if (!firstPass) {
      this.applyChannelStates();
    }
  }

  get channelKeys(): string[] {
    return [...this.sequencers.map((sequencer) => sequencer.key), "keys"];
  }

  applyChannelStates() {
    const solos = this.channelSolos;
    const states = this.channelKeys.map((key) => {
      const muted = this.channelMutes.has(key);
      const audible = !muted && (solos.size === 0 || solos.has(key));
      const target =
        key === "keys"
          ? this.keys
          : this.sequencers.find((sequencer) => sequencer.key === key);
      target?.setMuted(!audible);
      return { key, muted, soloed: solos.has(key), audible };
    });
    this.renderer.updateChannelStates(states);
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

    createDropReader({
      element: document.body,
      onFailure: console.log,
      onSuccess: ({ imageElements }) => {
        if (imageElements[0]) {
          this.loadSettingsFromImage(imageElements[0]);
        }
      },
    });
  }

  loadSettingsFromImage(image: HTMLImageElement): boolean {
    try {
      const { entries } = Stegassette.decode({ source: image });
      const entry =
        entries.find((item) => item.mimetype === SETTINGS_MIMETYPE) ||
        entries[0];
      if (!entry) return false;
      const settings = JSON.parse(
        new TextDecoder().decode(entry.data)
      ) as MachineParams;
      this.update(settings);
      // Save the loaded settings to localStorage
      this.saveToLocalStorage();
      return true;
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  // File-picker path for loading a settings image — on mobile this opens the
  // photo library, which the drop reader can't reach.
  openImageLoadDialog() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.addEventListener("load", () => {
        URL.revokeObjectURL(url);
        this.loadSettingsFromImage(image);
      });
      image.src = url;
    });
    document.body.appendChild(input);
    input.click();
  }

  stop() {
    if (this.sequencers) {
      this.sequencers.forEach((sequencer) => sequencer.dispose());
    }
    if (this.keys) {
      this.keys.dispose();
    }
  }

  exportParams(): MachineParams {
    return {
      core: {
        theme: this.renderer.core.theme,
        clock: this.clock.exportParams(),
        notes: this.notes.exportParams(),
      },
      sequencers: this.sequencers.map((sequencer) => sequencer.exportParams()),
      keys: this.keys.exportParams(),
      theme: this.renderer.theme,
    };
  }

  saveToLocalStorage(): void {
    LocalStorage.save(this.exportParams());
  }

  private debouncedSaveToLocalStorage(): void {
    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Set new timeout to save after 500ms of inactivity
    this.saveTimeout = window.setTimeout(() => {
      this.saveToLocalStorage();
    }, 500);
  }

  static loadFromLocalStorage(): MachineParams | null {
    return LocalStorage.load();
  }

  static hasStoredState(): boolean {
    return LocalStorage.hasStoredState();
  }

  static clearStoredState(): void {
    LocalStorage.clear();
  }

  resetToDefaults(): void {
    // This would need the default parameters from index.ts
    // For now, just clear localStorage - user can refresh to get defaults
    LocalStorage.clear();
    console.log("Cleared stored state. Refresh the page to load defaults.");
  }

  handleTick(position: number, time: number) {
    // The transport callback runs ahead of the audible beat and must stay
    // tight for note scheduling — paint the step via Draw at the audible time.
    getDraw().schedule(() => this.renderer.renderStep(position), time);
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

  onExport(type: "image" | "json" | "url") {
    if (type === "image") {
      this.promptInterface.toggle();
      const canvas = Stegassette.encode({
        source: this.renderer.snapshot(),
        entries: [
          {
            mimetype: SETTINGS_MIMETYPE,
            name: SETTINGS_NAME,
            data: JSON.stringify(this.exportParams()),
          },
        ],
      });
      // An <img> rather than the canvas itself: mobile browsers only offer
      // "Save to Photos" on long-press for images.
      const image = document.createElement("img");
      image.src = canvas.toDataURL("image/png");
      image.className = "export";
      image.addEventListener("click", () => image.remove());
      document.body.appendChild(image);
    } else if (type === "json") {
      console.log("json", JSON.stringify(this.exportParams()));
    } else if (type === "url") {
      console.log("url", JSON.stringify(this.exportParams()));
    }
  }

  onModeChange() {
    this.keys.handleIntervalChange({ time: this.clock.time });
    this.renderer.updateKeyboard();
  }

  onStepChange() {
    this.renderer.handleStepsSizeChange();
  }

  onPropertyChange() {
    // Trigger save when any property is changed via the prompt system
    if (this.initialized) {
      this.debouncedSaveToLocalStorage();
    }
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
    return this.renderer.toggleHueRotate();
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
    if (type === "TAP" && location === "EDITOR") {
      this.promptInterface.toggle();
      return;
    }
    if (type === "TAP" && (location === "SOLO" || location === "MUTE")) {
      const key = this.channelKeys[valueA];
      if (key) {
        const set = location === "SOLO" ? this.channelSolos : this.channelMutes;
        if (set.has(key)) {
          set.delete(key);
        } else {
          set.add(key);
        }
        this.applyChannelStates();
      }
      return;
    }
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
        this.keys.handleIntervalChange({ time: this.clock.time });
        this.renderer.updateKeyboard();
        this.renderer.updatePads(valueA);
        // Save state when interval changes
        if (this.initialized) {
          this.debouncedSaveToLocalStorage();
        }
      }
    } else if (type === "TAP" && location === "KEYS") {
      this.keys.handlePress({
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
          sequencer.key,
          valueA,
          valueB,
          sequencer.steps.values(valueB)[valueA],
          sequencer.steps.max
        );
        // Save state when steps change
        if (this.initialized) {
          this.debouncedSaveToLocalStorage();
        }
      }
    } else if (location === "KEYS") {
      if (type === "PRESS") {
        this.keys.handlePress({
          time: this.clock.time,
          step: valueA % 12,
          octave: Math.floor(valueA / 12),
        });
      } else if (type === "RELEASE") {
        this.keys.handleRelease({
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
