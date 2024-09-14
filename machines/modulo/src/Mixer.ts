import { Gain } from "tone";

export class Mixer {
  channel?: Gain;

  initialize() {
    this.channel = new Gain(1);
    this.channel.toDestination();
  }
}
