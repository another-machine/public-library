// http://aaron.headwai.com/ra/MIDI/MIDI%20Message%20Table%201.pdf
// https://www.midi.org/specifications-old/item/table-2-expanded-messages-list-status-bytes

export interface EventData {
  value: number | null;
  ratio: number | null;
  type: string | null;
}

export class MIDIEvent {
  channel: number | null;
  device: Partial<MIDIPort>;
  a: EventData | null;
  b: EventData | null;
  type: string;

  constructor(device: MIDIPort, event: MIDIMessageEvent) {
    this.device = {
      id: device.id,
      type: device.type,
      name: device.name,
      connection: device.connection,
      manufacturer: device.manufacturer,
      state: device.state,
      version: device.version,
      close: device.close,
      open: device.open,
    };
    if (event?.data) {
      const { channel, type, a, b } = MIDIEvent.describedValuesFromData(
        event.data
      );
      this.channel = channel;
      this.type = type;
      this.a = a;
      this.b = b;
    } else {
      this.channel = null;
      this.type = MIDIEvent.toType(
        device.state === "connected"
          ? "Device Connected"
          : "Device Disconnected"
      );
      this.a = null;
      this.b = null;
    }
  }

  static toType(string: string) {
    if (!string) return string;
    return string
      .replace(/[^\w\d]/, " ")
      .replace(/ +$/, "")
      .replace(/ +/, "_")
      .toLowerCase();
  }

  static describedData(
    data: Uint8Array,
    name: string,
    label1?: string,
    label2?: string
  ) {
    const [func, byte1, byte2] = data;
    const channel = func >= 128 && func <= 239 ? (func % 16) + 1 : 0;
    const value = (val?: number): number | null =>
      typeof val === "number" ? val : null;
    const ratio = (val?: number): number | null =>
      typeof val === "number" ? val / 127 : null;
    const string = (val?: string): string | null => val || null;
    return {
      channel,
      type: MIDIEvent.toType(name),
      a: {
        value: value(byte1),
        ratio: ratio(byte1),
        type: string(MIDIEvent.toType(label1 || "")),
      },
      b: {
        value: value(byte2),
        ratio: ratio(byte2),
        type: string(MIDIEvent.toType(label2 || "")),
      },
    };
  }

  static describedValuesFromData(data: Uint8Array) {
    const [func, byte1] = data;
    if (func >= 128 && func <= 143)
      return MIDIEvent.describedData(data, "Note Off", "Note", "Velocity");
    else if (func >= 144 && func <= 159)
      return MIDIEvent.describedData(data, "Note On", "Note", "Velocity");
    else if (func >= 160 && func <= 175)
      return MIDIEvent.describedData(
        data,
        "Polyphonic Aftertouch",
        "Note",
        "Pressure"
      );
    else if (func >= 176 && func <= 191)
      return MIDIEvent.describedData(
        data,
        "Mode Change",
        "Mode",
        MIDIEvent.modeLabel(byte1)
      );
    else if (func >= 192 && func <= 207)
      return MIDIEvent.describedData(data, "Program Change", "Program");
    else if (func >= 208 && func <= 223)
      return MIDIEvent.describedData(data, "Aftertouch", "Pressure");
    else if (func >= 224 && func <= 239)
      return MIDIEvent.describedData(data, "Pitch Wheel Control", "LSB", "MSB");
    else
      switch (func) {
        case 240:
          return MIDIEvent.describedData(data, "System Exclusive");
        case 241:
          return MIDIEvent.describedData(data, "MIDI Time Code Qtr. Frame");
        case 242:
          return MIDIEvent.describedData(
            data,
            "Song Position Pointer",
            "LSB",
            "MSB"
          );
        case 243:
          return MIDIEvent.describedData(data, "Song Select", "Song #");
        case 244:
          return MIDIEvent.describedData(data, "Unspecified (Reserved)");
        case 245:
          return MIDIEvent.describedData(data, "Unspecified (Reserved)");
        case 246:
          return MIDIEvent.describedData(data, "Tune request'");
        case 247:
          return MIDIEvent.describedData(data, "End of SysEx (EOX)");
        case 248:
          return MIDIEvent.describedData(data, "Timing clock");
        case 249:
          return MIDIEvent.describedData(data, "Unspecified (Reserved)");
        case 250:
          return MIDIEvent.describedData(data, "Start");
        case 251:
          return MIDIEvent.describedData(data, "Continue");
        case 252:
          return MIDIEvent.describedData(data, "Stop");
        case 253:
          return MIDIEvent.describedData(data, "Unspecified (Reserved)");
        case 254:
          return MIDIEvent.describedData(data, "Active Sensing");
        case 255:
          return MIDIEvent.describedData(data, "System Reset");
      }
    return {
      channel: null,
      type: "Unknown",
      a: null,
      b: null,
    };
  }

  static modeLabel(byte1: number) {
    return [
      "Bank Select",
      "Modulation Wheel or Lever",
      "Breath Controller",
      "Unspecified",
      "Foot Controller",
      "Portamento Time",
      "Data Entry MSB",
      "Channel Volume",
      "Balance",
      "Unspecified",
      "Pan",
      "Expression Controller",
      "Effect Control 1",
      "Effect Control 2",
      "Unspecified",
      "Unspecified",
      "General Purpose Controller 1",
      "General Purpose Controller 2",
      "General Purpose Controller 3",
      "General Purpose Controller 4",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "LSB for Control 0 (Bank Select)",
      "LSB for Control 1 (Modulation Wheel or Lever)",
      "LSB for Control 2 (Breath Controller)",
      "LSB for Control 3 (Unspecified)",
      "LSB for Control 4 (Foot Controller)",
      "LSB for Control 5 (Portamento Time)",
      "LSB for Control 6 (Data Entry)",
      "LSB for Control 7 (Channel Volume)",
      "LSB for Control 8 (Balance)",
      "LSB for Control 9 (Unspecified)",
      "LSB for Control 10 (Pan)",
      "LSB for Control 11 (Expression Controller)",
      "LSB for Control 12 (Effect control 1)",
      "LSB for Control 13 (Effect control 2)",
      "LSB for Control 14 (Unspecified)",
      "LSB for Control 15 (Unspecified)",
      "LSB for Control 16 (General Purpose Controller 1)",
      "LSB for Control 17 (General Purpose Controller 2)",
      "LSB for Control 18 (General Purpose Controller 3)",
      "LSB for Control 19 (General Purpose Controller 4)",
      "LSB for Control 20 (Unspecified)",
      "LSB for Control 21 (Unspecified)",
      "LSB for Control 22 (Unspecified)",
      "LSB for Control 23 (Unspecified)",
      "LSB for Control 24 (Unspecified)",
      "LSB for Control 25 (Unspecified)",
      "LSB for Control 26 (Unspecified)",
      "LSB for Control 27 (Unspecified)",
      "LSB for Control 28 (Unspecified)",
      "LSB for Control 29 (Unspecified)",
      "LSB for Control 30 (Unspecified)",
      "LSB for Control 31 (Unspecified)",
      "Damper Pedal on/off (Sustain) ≤63 off, ≥64 on",
      "Portamento On/Off ≤63 off, ≥64 on",
      "Sostenuto On/Off ≤63 off, ≥64 on",
      "Soft Pedal On/Off ≤63 off, ≥64 on",
      "Legato Footswitch ≤63 Normal, ≥64 Legato",
      "Hold 2 ≤63 off, ≥64 on",
      "Sound Controller 1 (default: Sound Variation)",
      "Sound Controller 2 (default: Timbre/Harmonic Intensity)",
      "Sound Controller 3 (default: Release Time)",
      "Sound Controller 4 (default: Attack Time)",
      "Sound Controller 5 (default: Brightness)",
      "Sound Controller 6 (default: Decay Time)",
      "Sound Controller 7 (default: Vibrato Rate)",
      "Sound Controller 8 (default: Vibrato Depth)",
      "Sound Controller 9 (default: Vibrato Delay)",
      "Sound Controller 10 (default: Unspecified)",
      "General Purpose Controller 5",
      "General Purpose Controller 6",
      "General Purpose Controller 7",
      "General Purpose Controller 8",
      "Portamento Control",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "High Resolution Velocity Prefix",
      "Unspecified",
      "Unspecified",
      "Effects 1 Depth",
      "Effects 2 Depth",
      "Effects 3 Depth",
      "Effects 4 Depth",
      "Effects 5 Depth",
      "Data Increment (Data Entry +1)",
      "Data Decrement (Data Entry -1)",
      "Non-Registered Parameter Number (NRPN) - LSB",
      "Non-Registered Parameter Number (NRPN) - MSB",
      "Registered Parameter Number (RPN) - LSB",
      "Registered Parameter Number (RPN) - MSB",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "Unspecified",
      "[Channel Mode Message] All Sound Off 0",
      "[Channel Mode Message] Reset All Controllers",
      "[Channel Mode Message] Local Control On/Off 0 off, 127 on",
      "[Channel Mode Message] All Notes Off 0",
      "[Channel Mode Message] Omni Mode Off (+ all notes off) 0",
      "[Channel Mode Message] Omni Mode On (+ all notes off) 0",
      "[Channel Mode Message] Mono Mode On (+ poly off, + all notes off)",
      "[Channel Mode Message] Poly Mode On (+ mono off, +all notes off)",
    ][byte1];
  }
}

export class MIDI {
  inputs: { [k: string]: MIDIPort };
  outputs: { [k: string]: MIDIPort };
  onEvent: (event: MIDIEvent) => void;

  constructor(onEvent = (_event: MIDIEvent) => {}) {
    this.inputs = {};
    this.outputs = {};
    this.onEvent = onEvent;
  }

  async initialize() {
    const access = await navigator.requestMIDIAccess();
    const inputs = access.inputs.values();
    const outputs = access.outputs.values();
    for (const input of inputs) this.initializeInput(input);
    for (const output of outputs) this.initializeOutput(output);

    access.addEventListener("statechange", (event: Event) => {
      const { port } = event as MIDIConnectionEvent;
      if (port?.type === "input") {
        if (port.state === "connected") this.initializeInput(port);
        else this.teardownInput(port);
      } else if (port) {
        if (port.state === "connected") this.initializeOutput(port);
        else this.teardownOutput(port);
      }
    });

    return;
  }

  notifyAll(message: Uint8Array) {
    Object.values(this.outputs).forEach((output) => {
      if (MIDI.portIsOutput(output)) {
        output.send(message);
      }
    });
  }

  notify(message: Uint8Array, name: string) {
    Object.values(this.outputs).forEach((output) => {
      if (MIDI.portIsOutput(output) && (output.name === name || !name)) {
        // console.log(
        //   "sending",
        //   name,
        //   output,
        //   MIDIEvent.describedValuesFromData(message)
        // );
        output.send(message);
      }
    });
  }

  initializeInput(input: MIDIPort) {
    if (this.inputs[input.id]) return;
    this.sendEvent(input);
    this.inputs[input.id] = input;
    input.addEventListener("midimessage", (event: Event) => {
      this.sendEvent(input, event as MIDIMessageEvent);
    });
  }

  initializeOutput(output: MIDIPort) {
    this.sendEvent(output);
    this.outputs[output.id] = output;
  }

  teardownInput(input: MIDIPort) {
    if (!this.inputs[input.id]) return;
    this.sendEvent(input);
    delete this.inputs[input.id];
  }

  teardownOutput(output: MIDIPort) {
    if (!this.outputs[output.id]) return;
    this.sendEvent(output);
    delete this.outputs[output.id];
  }

  sendEvent(port: MIDIPort, event?: MIDIMessageEvent) {
    if (event) this.onEvent(new MIDIEvent(port, event));
  }

  static portIsInput(port: MIDIPort): port is MIDIInput {
    return port.type === "input";
  }

  static portIsOutput(port: MIDIPort): port is MIDIOutput {
    return port.type === "output";
  }
}
