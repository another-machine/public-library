import { Machine } from "../Machine";
import { generateCoreDestination } from "./generateCoreDestination";
import { generateDrumsDestinations } from "./generateDrumsDestinations";
import { generateSynthsDestinations } from "./generateSynthsDestinations";
import { generateKeyboardDestinations } from "./generateKeyboardDestinations";
import { Destination } from "./Destination";

export class Destinations {
  root: Destination;
  machine: Machine;
  onExport: () => void;
  onToggleMachine: () => boolean;
  onToggleRainbow: () => boolean;
  onStepChange: () => void;
  onModeChange: () => void;
  onPropertyChange: () => void;

  constructor({
    machine,
    onExport,
    onToggleMachine,
    onToggleRainbow,
    onStepChange,
    onModeChange,
    onPropertyChange,
  }: {
    machine: Machine;
    onExport: () => void;
    onToggleMachine: () => boolean;
    onToggleRainbow: () => boolean;
    onStepChange: () => void;
    onModeChange: () => void;
    onPropertyChange: () => void;
  }) {
    this.machine = machine;
    this.onExport = onExport;
    this.onToggleMachine = onToggleMachine;
    this.onToggleRainbow = onToggleRainbow;
    this.onStepChange = onStepChange;
    this.onModeChange = onModeChange;
    this.onPropertyChange = onPropertyChange;
    this.refresh();
  }

  refresh() {
    const { sequencers, keys, clock } = this.machine;
    const synthSequencers = sequencers.filter((sequencer) =>
      sequencer.isSynth()
    );
    const drumSequencers = sequencers.filter((sequencer) => sequencer.isDrum());
    const destinations = {
      ...generateCoreDestination({
        machine: this.machine,
        onExport: this.onExport,
        onToggleMachine: this.onToggleMachine,
        onToggleRainbow: this.onToggleRainbow,
        onModeChange: this.onModeChange,
        onPropertyChange: this.onPropertyChange,
      }),
      ...generateSynthsDestinations({
        sequencers: synthSequencers,
        machine: this.machine,
        onStepChange: this.onStepChange,
        onPropertyChange: this.onPropertyChange,
      }),
      ...generateDrumsDestinations({
        sequencers: drumSequencers,
        machine: this.machine,
        onStepChange: this.onStepChange,
        onPropertyChange: this.onPropertyChange,
      }),
      ...generateKeyboardDestinations({
        machine: this.machine,
        keys,
        clock,
        onPropertyChange: this.onPropertyChange,
      }),
    };
    if (this.root) {
      this.root.destinations = destinations;
    } else {
      this.root = new Destination({
        info: { content: () => "", label: "Modulo" },
        destinations,
        properties: {},
        commands: {},
      });
    }
  }
}
