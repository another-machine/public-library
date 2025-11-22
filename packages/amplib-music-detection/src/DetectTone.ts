import {
  Chord,
  Scale,
  Note,
  type Notation,
} from "../../amplib-music-theory/src/index";

interface DetectToneChordTracking {
  value: number;
  octaves: number;
  prominence: number;
  notation: Notation;
  index: number;
  ratio: number;
}

export class DetectTone {
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
      this.analyser.fftSize = 32768;
      this.analyser.smoothingTimeConstant = 0.95;
      this.analyser.getByteFrequencyData(this.frequencyData);
    } catch (e) {
      throw e;
    }
  }

  tick() {
    this.analyser.getByteFrequencyData(this.frequencyData);
    const tracking: {
      [notation in Notation]?: Partial<DetectToneChordTracking>;
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
      DetectToneChordTracking
    ][];
    const total = entries.reduce((a, b) => a + b[1].value, 0);
    const noteData = entries.map(([notation, { octaves, value }]) => {
      const prominence = value ? value / total : 0;
      const index = Note.notations.indexOf(notation);
      const ratio = value / octaves;
      const result: DetectToneChordTracking = {
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
    const combos: DetectToneChordTracking[][] = [
      [sorted[0], sorted[1], sorted[2], sorted[3]],
      [sorted[1], sorted[0], sorted[2], sorted[3]],
      [sorted[0], sorted[1], sorted[2]],
      [sorted[1], sorted[0], sorted[2]],
      [sorted[0], sorted[1], sorted[3]],
      [sorted[1], sorted[0], sorted[3]],
    ];
    // chord combinations sorted by avg prominence to determine which is most likely
    const chordOptions = combos
      .map((combo) => {
        const key = Chord.keyFromNotations(combo.map((a) => a.notation));
        // presence is the avg value of potential chord notes
        const presence =
          combo.reduce((a, { prominence }) => prominence + a, 0) / combo.length;
        const chord = this.chords[key];
        return { chord, key, presence };
      })
      .sort((a, b) => b.presence - a.presence);
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
   * Analyze an audio buffer to estimate the Key/Chord
   * @param buffer AudioBuffer to analyze
   * @returns Promise resolving to the estimated Key/Chord label
   */
  async analyzeKey(buffer: AudioBuffer): Promise<string> {
    try {
      // Create an offline audio context
      // We don't need to render the whole file at high sample rate if we just want key
      // But let's stick to the buffer's rate for simplicity
      const offlineCtx = new OfflineAudioContext(
        1, // Mono is enough for key detection usually
        buffer.length,
        buffer.sampleRate
      );

      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;

      const analyser = offlineCtx.createAnalyser();
      analyser.fftSize = 2048;

      // We need to capture frequency data.
      // Since we can't easily get data out of OfflineContext during render without ScriptProcessor
      // And ScriptProcessor is deprecated but works...
      // Alternatively, we can just pick a few chunks of the buffer, create a real AudioContext (suspended),
      // decode them, and analyze them? No, that's slow.

      // Let's use the ScriptProcessor approach for now as it's the most standard way to get data from OfflineCtx
      const scriptNode = offlineCtx.createScriptProcessor(2048, 1, 1);

      source.connect(analyser);
      analyser.connect(scriptNode);
      scriptNode.connect(offlineCtx.destination);

      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      const accumulatedTones = new Float32Array(this.notes.length);
      let samplesTaken = 0;

      scriptNode.onaudioprocess = () => {
        analyser.getByteFrequencyData(frequencyData);

        // Accumulate energy for each note bin
        this.frequencyIndices.forEach((freqIndex, i) => {
          // Simple accumulation
          accumulatedTones[i] += frequencyData[freqIndex];
        });
        samplesTaken++;
      };

      source.start(0);
      await offlineCtx.startRendering();

      if (samplesTaken === 0) return "";

      // Average the accumulated tones
      const averagedTones = accumulatedTones.map((val) => val / samplesTaken);

      // Now use the existing logic to find the chord/key
      // We need to mock the internal state that detect() uses
      this.frequencyValues = Array.from(averagedTones); // Update internal state for reuse of logic?
      // Actually, detect() uses this.frequencyValues.
      // But detect() also does smoothing. Here we have the average over the whole song.

      // Let's adapt the logic from detect() but using our averaged values
      const total = averagedTones.reduce((a, b) => a + b, 0);
      if (total === 0) return "";

      const noteData = this.notes.map((note, i) => {
        const value = averagedTones[i];
        const notation = note.notation;
        const octaves = 1; // Simplified
        const prominence = value / total;
        return {
          value,
          octaves,
          prominence,
          notation,
          index: i,
          ratio: value,
        } as DetectToneChordTracking;
      });

      // Sort by prominence
      const sorted = noteData.sort((a, b) => b.prominence - a.prominence);

      // Check combos (same as detect)
      const combos: DetectToneChordTracking[][] = [
        [sorted[0], sorted[1], sorted[2], sorted[3]],
        [sorted[1], sorted[0], sorted[2], sorted[3]],
        [sorted[0], sorted[1], sorted[2]],
        [sorted[1], sorted[0], sorted[2]],
        [sorted[0], sorted[1], sorted[3]],
        [sorted[1], sorted[0], sorted[3]],
      ];

      const chordOptions = combos
        .map((combo) => {
          const key = Chord.keyFromNotations(combo.map((a) => a.notation));
          const presence =
            combo.reduce((a, { prominence }) => prominence + a, 0) /
            combo.length;
          const chord = this.chords[key];
          return { chord, key, presence };
        })
        .sort((a, b) => b.presence - a.presence);

      const firstChord = chordOptions.find(({ chord }) => Boolean(chord));
      const option = firstChord || chordOptions[0];

      return option.chord ? option.chord.label : option.key;
    } catch (e) {
      console.error("Error analyzing Key:", e);
      return "";
    }
  }
}
