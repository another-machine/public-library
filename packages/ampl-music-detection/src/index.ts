import {
  Chord,
  Scale,
  Note,
  type Notation,
} from "../../ampl-music-theory/dist/index";

interface DetectorChordTracking {
  value: number;
  octaves: number;
  prominence: number;
  notation: Notation;
  index: number;
  ratio: number;
}

interface DetectorNoteTracking {
  value: number;
  max: number;
  octaves: number;
}

export class UserMediaStream {
  stream?: MediaStream;
  devices: MediaDeviceInfo[] = [];

  constructor() {}

  async start(constraints: MediaStreamConstraints) {
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    await this.refreshDevices();
    return this.stream;
  }

  async refreshDevices() {
    this.devices = await navigator.mediaDevices.enumerateDevices();
  }

  get audioInputDevices() {
    return this.devices.filter((device) => device.kind === "audioinput");
  }

  get videoInputDevices() {
    return this.devices.filter((device) => device.kind === "videoinput");
  }
}

export class Detector {
  audioContext: AudioContext;
  analyser: AnalyserNode;
  frequencyData: Uint8Array;
  frequencyIndices: number[];
  frequencyValues: number[];
  library = Scale.buildLibrary();
  notes = Object.values(this.library).slice(24, 84);
  count = this.notes.length;
  chords: { [chordKey: string]: Chord } = {};
  previousChordKey: string = "";

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
    this.analyser = this.audioContext.createAnalyser();
    const bufferLengthFreq = this.analyser.frequencyBinCount;
    this.frequencyData = new Uint8Array(bufferLengthFreq);
    const bandHz =
      this.audioContext.sampleRate / 2 / (this.analyser.fftSize / 2);
    this.frequencyIndices = this.notes.map(({ frequency }) =>
      Math.floor(frequency / bandHz)
    );
    this.frequencyValues = this.frequencyIndices.map(() => 0);

    Chord.types.forEach((type) => {
      Note.notations.forEach((_, i) => {
        const chord = new Chord(i, type);
        this.chords[chord.key] = chord;
      });
    });
  }

  async start(stream: MediaStream) {
    try {
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);
      this.analyser.fftSize = 8192 * 2 * 2;
      this.analyser.getByteFrequencyData(this.frequencyData);
    } catch (e) {
      throw e;
    }
  }

  tickChord() {
    this.analyser.getByteFrequencyData(this.frequencyData);
    const tracking: {
      [notation in Notation]?: Partial<DetectorChordTracking>;
    } = {};
    this.notes.forEach(({ notation }, i) => {
      // const items = [1, 2, 13, 14, 25, 26, -1, -2, -13, -14, -25, -26];
      const items = [1, 2, 13, 14, -1, -2, -13, -14];
      const neighbors = items.map((item) => item + i);
      const self = this.frequencyData[this.frequencyIndices[i]];

      // ignoring bands that have louder neighbors
      const max = neighbors.reduce((value, index) => {
        if (index >= 0 && index < this.count) {
          value = Math.max(
            value,
            this.frequencyData[this.frequencyIndices[index]]
          );
        }
        return value;
      }, 0);
      const freq = self > max ? self : 0;

      const valuePrev = this.frequencyValues[i];
      const valueNew = Math.pow(Math.min(1, freq / 128), 50);
      const factor = valueNew < valuePrev ? 0.0625 : 0.015625;
      const valueEased = valuePrev + (valueNew - valuePrev) * factor;
      tracking[notation] = tracking[notation] || {
        value: 0,
        octaves: 0,
        prominence: 0,
      };
      tracking[notation].octaves = (tracking[notation].octaves || 0) + 1;
      tracking[notation].value = (tracking[notation].value || 0) + valueEased;

      this.frequencyValues[i] = valueEased;
    });

    const entries = Object.entries(tracking) as [
      Notation,
      DetectorChordTracking
    ][];
    const total = entries.reduce((a, b) => a + b[1].value, 0);
    const noteData = entries.map(([notation, { octaves, value }]) => {
      const prominence = value ? value / total : 0;
      const index = Note.notations.indexOf(notation);
      const ratio = value / octaves;
      const result: DetectorChordTracking = {
        octaves,
        value,
        notation,
        index,
        prominence,
        ratio,
      };
      return result;
    });

    // array of notes sorted by prominence
    const sorted = Array.from(noteData).sort(
      (a, b) => b.prominence - a.prominence
    );
    // combinations of prominent notes to check for chords
    const combos: DetectorChordTracking[][] = [
      [sorted[0], sorted[1], sorted[2], sorted[3]],
      [sorted[0], sorted[1], sorted[2]],
      [sorted[0], sorted[1], sorted[3]],
    ];
    // chord combinations sorted by avg prominence to determine which is most likely
    const chordOptions = combos
      .map((combo) => {
        const key = Chord.keyFromNotations(combo.map((a) => a.notation));
        // getting avg value of potential chord notes
        const avg =
          combo.reduce((a, { prominence }) => prominence + a, 0) / combo.length;
        const chord = this.chords[key];
        return { chord, key, avg };
      })
      .sort((a, b) => b.avg - a.avg);
    // the first _chord_ in the array (most prominent might not be chord!)
    const firstChord = chordOptions.find(({ chord }) => Boolean(chord));
    // finding the previous chord in the array
    const prevChord = chordOptions.find(
      ({ key }) => key === this.previousChordKey
    );
    // the actual option we're going with in order of priority
    const option = prevChord || firstChord || chordOptions[0];
    const newChordKey = option.chord ? option.key : this.previousChordKey;
    const chordChange = newChordKey !== this.previousChordKey;
    this.previousChordKey = newChordKey;

    return {
      chordChange,
      label: option.chord ? option.chord.label : option.key,
      option,
      notes: noteData,
    };
  }

  tickNotes() {
    this.analyser.getByteFrequencyData(this.frequencyData);
    const notationDataMap: {
      [K in Notation]?: DetectorNoteTracking;
    } = {};
    this.notes.forEach(({ notation }, i) => {
      const rawFrequency = this.frequencyData[this.frequencyIndices[i]];
      const valuePrevious = this.frequencyValues[i];
      const valueCurrent = Math.pow(Math.min(1, rawFrequency / 128), 50);
      const valueEasingFactor =
        valueCurrent < valuePrevious ? 0.0625 : 0.015625;
      const valueEased =
        valuePrevious + (valueCurrent - valuePrevious) * valueEasingFactor;
      const notationData: DetectorNoteTracking = notationDataMap[notation] || {
        value: 0,
        max: 0,
        octaves: 0,
      };
      notationData.octaves++;
      notationData.value += valueEased;
      notationData.max = Math.max(notationData.max, valueEased);
      notationDataMap[notation] = notationData;
      this.frequencyValues[i] = valueEased;
    });

    const notationDataMapAsEntries = Object.entries(notationDataMap);
    const totalAllValues = notationDataMapAsEntries.reduce(
      (a, b) => a + b[1].value,
      0
    );
    const noteData = notationDataMapAsEntries.map(
      ([notationRaw, { octaves, value, max }]) => {
        const notation = notationRaw as Notation;
        const prominence = value / totalAllValues;
        const index = Note.notations.indexOf(notation);
        const ratio = value / octaves;
        return { notation, value, index, max, prominence, ratio };
      }
    );
    // array of notes sorted by prominence
    const notes = Array.from(noteData).sort(
      (a, b) => b.prominence - a.prominence
    );

    return {
      notes,
    };
  }
}
