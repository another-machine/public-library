import {
  Chord,
  Scale,
  Note,
  type Notation,
} from "@amplib/music-theory";

interface DetectToneChordTracking {
  value: number;
  octaves: number;
  prominence: number;
  notation: Notation;
  index: number;
  ratio: number;
}

export class DetectTone {
  /**
   * 32768 is the maximum an AnalyserNode allows: at a 44.1kHz rate that is
   * 1.35Hz per bin, which is what it takes to separate the semitones in the
   * bottom octave — C2 and C#2 are under 4Hz apart.
   */
  static FFT_SIZE = 32768;
  static SMOOTHING = 0.95;

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

  constructor({ audioContext }: { audioContext: AudioContext }) {
    this.audioContext = audioContext;
    this.analyser = this.audioContext.createAnalyser();
    // The analyser is configured BEFORE anything is derived from it. Both the
    // buffer length and the note-to-bin mapping are functions of fftSize, so
    // setting it afterwards — as this did until 2026-08-01 — silently made
    // every index wrong by the ratio of the two sizes, and left a buffer that
    // only covered the bottom sixteenth of the spectrum. A 440Hz tone read 0.
    this.analyser.fftSize = DetectTone.FFT_SIZE;
    this.analyser.smoothingTimeConstant = DetectTone.SMOOTHING;
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

  async initialize(
    source:
      | AudioBufferSourceNode
      | MediaElementAudioSourceNode
      | MediaStreamAudioSourceNode
  ) {
    try {
      source.connect(this.analyser);
      this.analyser.getByteFrequencyData(this.frequencyData);
    } catch (e) {
      throw e;
    }
  }

  tick() {
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.notes.forEach((_, i) => {
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

      this.frequencyValues[i] = valueEased;
    });

    const noteData = this.trackingFor(this.frequencyValues);

    // array of notes sorted by prominence
    const sorted = Array.from(noteData).sort(
      (a, b) => b.prominence - a.prominence
    );
    // combinations of prominent notes to check for chords
    const combos: DetectToneChordTracking[][] = [
      [sorted[0], sorted[1], sorted[2], sorted[3]],
      [sorted[1], sorted[0], sorted[2], sorted[3]],
      [sorted[0], sorted[1], sorted[2]],
      [sorted[1], sorted[0], sorted[2]],
      [sorted[0], sorted[1], sorted[3]],
      [sorted[1], sorted[0], sorted[3]],
    ];
    // chord combinations sorted by avg prominence to determine which is most likely
    const chordOptions = this.chordOptionsFor(combos);
    // the first _chord_ in the array (most prominent might not be chord!)
    const firstChord = chordOptions.find(({ chord }) => Boolean(chord));
    // finding the previous chord in the array
    const prevChord = chordOptions.find(
      ({ key }) => key === this.previousChordKey
    );
    // the actual option we're going with in order of priority
    const option = prevChord || firstChord || chordOptions[0];
    const newChordKey = option.chord ? option.key : this.previousChordKey;
    const change = newChordKey !== this.previousChordKey;
    this.previousChordKey = newChordKey;

    const notes = Array.from(noteData).sort(
      (a, b) => b.prominence - a.prominence
    );

    const tones = Array.from(this.notes).map((a, i) => ({
      ...a,
      prominence: this.frequencyValues[i],
    }));

    return {
      change,
      label: option.chord ? option.chord.label : option.key,
      guess: option,
      notes,
      tones,
    };
  }

  /**
   * Chord candidates for a set of combinations, most present first.
   *
   * Both the live tick and the offline analysis go through this. They had
   * their own copies of it once and the copies disagreed — the offline one
   * built its combinations out of the loudest *notes* rather than the loudest
   * pitch classes, so its top four were usually four octaves of the same note
   * and it could never name a triad.
   */
  private chordOptionsFor(combos: DetectToneChordTracking[][]) {
    return combos
      .map((combo) => {
        const key = Chord.keyFromNotations(combo.map((a) => a.notation));
        // presence is the avg value of potential chord notes
        const presence =
          combo.reduce((a, { prominence }) => prominence + a, 0) / combo.length;
        const chord = this.chords[key];
        return { chord, key, presence };
      })
      .sort((a, b) => b.presence - a.presence);
  }

  /**
   * Fold per-note values into one track per pitch class, the way `tick` does.
   */
  private trackingFor(values: ArrayLike<number>): DetectToneChordTracking[] {
    const tracking: {
      [notation in Notation]?: { value: number; octaves: number };
    } = {};
    this.notes.forEach(({ notation }, i) => {
      const track = (tracking[notation] = tracking[notation] || {
        value: 0,
        octaves: 0,
      });
      track.value += values[i] || 0;
      track.octaves += 1;
    });

    const entries = Object.entries(tracking) as [
      Notation,
      { value: number; octaves: number }
    ][];
    const total = entries.reduce((a, b) => a + b[1].value, 0);
    return entries.map(([notation, { value, octaves }]) => ({
      value,
      octaves,
      notation,
      index: Note.notations.indexOf(notation),
      prominence: total ? value / total : 0,
      ratio: value / octaves,
    }));
  }

  /**
   * Analyze an audio buffer to estimate the Key/Chord.
   *
   * Offline, so it reads the whole buffer rather than a moving window, and
   * none of it touches the instance state a concurrent `tick` is smoothing —
   * this used to assign its averages straight onto `frequencyValues`.
   *
   * @param buffer AudioBuffer to analyze
   * @returns Promise resolving to the estimated Key/Chord label
   */
  async analyzeKey(buffer: AudioBuffer): Promise<string> {
    try {
      // Mono is enough for a key, but the rate has to stay the buffer's own:
      // `frequencyIndices` are bins of THIS context's Nyquist, and resampling
      // would move every note's bin without moving the index that reads it.
      const offlineCtx = new OfflineAudioContext(
        1,
        buffer.length,
        buffer.sampleRate
      );

      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;

      // Same FFT size as the live analyser, so the shared `frequencyIndices`
      // mean the same thing here. A smaller one silently reads the wrong bins
      // — and past the end of a shorter array, which accumulates undefined.
      const analyser = offlineCtx.createAnalyser();
      analyser.fftSize = DetectTone.FFT_SIZE;
      analyser.smoothingTimeConstant = DetectTone.SMOOTHING;

      // ScriptProcessor is deprecated, and is still the only way to sample an
      // analyser as an offline context renders: AudioWorklet cannot see one,
      // and rendering to a buffer first would mean bringing our own FFT.
      const scriptNode = offlineCtx.createScriptProcessor(2048, 1, 1);

      source.connect(analyser);
      analyser.connect(scriptNode);
      scriptNode.connect(offlineCtx.destination);

      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      const accumulated = new Float32Array(this.notes.length);
      let framesTaken = 0;

      scriptNode.onaudioprocess = () => {
        analyser.getByteFrequencyData(frequencyData);
        this.frequencyIndices.forEach((bin, i) => {
          accumulated[i] += frequencyData[bin];
        });
        framesTaken++;
      };

      source.start(0);
      await offlineCtx.startRendering();

      if (!framesTaken) return "";

      const averaged = accumulated.map((value) => value / framesTaken);
      const noteData = this.trackingFor(averaged);
      if (!noteData.some(({ value }) => value > 0)) return "";

      const sorted = Array.from(noteData).sort(
        (a, b) => b.prominence - a.prominence
      );
      const chordOptions = this.chordOptionsFor([
        [sorted[0], sorted[1], sorted[2], sorted[3]],
        [sorted[1], sorted[0], sorted[2], sorted[3]],
        [sorted[0], sorted[1], sorted[2]],
        [sorted[1], sorted[0], sorted[2]],
        [sorted[0], sorted[1], sorted[3]],
        [sorted[1], sorted[0], sorted[3]],
      ]);

      const option =
        chordOptions.find(({ chord }) => Boolean(chord)) || chordOptions[0];
      return option.chord ? option.chord.label : option.key;
    } catch (e) {
      console.error("Error analyzing Key:", e);
      return "";
    }
  }
}
