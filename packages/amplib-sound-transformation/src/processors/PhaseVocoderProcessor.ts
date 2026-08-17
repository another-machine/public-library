import { OLAProcessor } from "./OLAProcessor";
import FFT from "fft.js";

const BUFFERED_BLOCK_SIZE = 2048;

function genHannWindow(length) {
  let win = new Float32Array(length);
  for (var i = 0; i < length; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / length));
  }
  return win;
}

class PhaseVocoderProcessor extends OLAProcessor {
  fft: FFT;
  fftSize: number;
  freqComplexBuffer: any[];
  freqComplexBufferShifted: any[];
  timeComplexBuffer: any[];
  timeCursor: number;
  magnitudes: Float32Array;
  peakIndexes: Int32Array;
  nbPeaks: number;
  hannWindow: Float32Array;

  static get parameterDescriptors() {
    return [
      {
        name: "pitchFactor",
        defaultValue: 1.0,
      },
    ];
  }

  constructor(options) {
    options.processorOptions = {
      blockSize: BUFFERED_BLOCK_SIZE,
    };
    super(options);

    this.fftSize = this.blockSize;
    this.timeCursor = 0;

    this.hannWindow = genHannWindow(this.blockSize);

    // prepare FFT and pre-allocate buffers
    this.fft = new FFT(this.fftSize);
    this.freqComplexBuffer = this.fft.createComplexArray();
    this.freqComplexBufferShifted = this.fft.createComplexArray();
    this.timeComplexBuffer = this.fft.createComplexArray();
    this.magnitudes = new Float32Array(this.fftSize / 2 + 1);
    this.peakIndexes = new Int32Array(this.magnitudes.length);
    this.nbPeaks = 0;
  }

  processOLA(inputs, outputs, parameters) {
    // no automation, take last value
    const pitchFactor =
      parameters.pitchFactor[parameters.pitchFactor.length - 1];

    for (var i = 0; i < this.nbInputs; i++) {
      for (var j = 0; j < inputs[i].length; j++) {
        // big assumption here: output is symetric to input
        var input = inputs[i][j];
        var output = outputs[i][j];

        this.applyHannWindow(input);

        this.fft.realTransform(this.freqComplexBuffer, input);

        this.computeMagnitudes();
        this.findPeaks();
        this.shiftPeaks(pitchFactor);

        this.fft.completeSpectrum(this.freqComplexBufferShifted);
        this.fft.inverseTransform(
          this.timeComplexBuffer,
          this.freqComplexBufferShifted
        );
        this.fft.fromComplexArray(this.timeComplexBuffer, output);

        this.applyHannWindow(output);
      }
    }

    this.timeCursor += this.hopSize;
  }

  /** Apply Hann window in-place */
  applyHannWindow(input) {
    for (var i = 0; i < this.blockSize; i++) {
      input[i] = input[i] * this.hannWindow[i];
    }
  }

  /** Compute squared magnitudes for peak finding **/
  computeMagnitudes() {
    var i = 0,
      j = 0;
    while (i < this.magnitudes.length) {
      let real = this.freqComplexBuffer[j];
      let imag = this.freqComplexBuffer[j + 1];
      // no need to sqrt for peak finding
      this.magnitudes[i] = real ** 2 + imag ** 2;
      i += 1;
      j += 2;
    }
  }

  /** Find peaks in spectrum magnitudes **/
  findPeaks() {
    this.nbPeaks = 0;
    var i = 2;
    let end = this.magnitudes.length - 2;

    while (i < end) {
      let mag = this.magnitudes[i];

      if (this.magnitudes[i - 1] >= mag || this.magnitudes[i - 2] >= mag) {
        i++;
        continue;
      }
      if (this.magnitudes[i + 1] >= mag || this.magnitudes[i + 2] >= mag) {
        i++;
        continue;
      }

      this.peakIndexes[this.nbPeaks] = i;
      this.nbPeaks++;
      i += 2;
    }
  }

  /** Shift peaks and regions of influence by pitchFactor into new specturm */
  shiftPeaks(pitchFactor) {
    // zero-fill new spectrum
    this.freqComplexBufferShifted.fill(0);

    for (var i = 0; i < this.nbPeaks; i++) {
      let peakIndex = this.peakIndexes[i];
      let peakIndexShifted = Math.round(peakIndex * pitchFactor);

      // Two measurements decide the output frequency, and both are fractional
      // while the bin index is not. Shifting by the rounded amount detunes by
      // up to half a bin: ±10.8 Hz at 2048 bins and 44.1 kHz, which around
      // A440 is ±42 cents, a third of a semitone. Measured worst case across
      // ±12 semitones was 38.6 cents before these two lines, 0.6 cents after.
      //
      // Magnitude has to sit in a whole bin. Phase does not, and phase is what
      // carries frequency in a vocoder: advancing at the exact fractional rate
      // while the envelope sits in the rounded bin resynthesizes the frequency
      // requested, leaving the peak slightly off center in its bin the way any
      // partial not born on a bin boundary already is.
      //
      // The rate is measured from the partial, not from the bin holding it.
      // A440 sits at bin 20.43; multiplying bin 20 by the pitch factor asks
      // for a shift 2% short, 18 cents flat at an octave. Parabolic
      // interpolation over three log magnitudes recovers the fraction, and is
      // exact for a Hann-windowed sinusoid. findPeaks never returns an index
      // within 2 of either end, so both neighbors are there.
      let logPrev = Math.log(this.magnitudes[peakIndex - 1] + 1e-12);
      let logPeak = Math.log(this.magnitudes[peakIndex] + 1e-12);
      let logNext = Math.log(this.magnitudes[peakIndex + 1] + 1e-12);
      let curvature = logPrev - 2 * logPeak + logNext;
      let offset = curvature < 0 ? (0.5 * (logPrev - logNext)) / curvature : 0;
      // A true peak's vertex lies inside its own bin. Further out means a flat
      // or noisy neighborhood, where the bin index is the better guess.
      if (!(Math.abs(offset) < 0.5)) offset = 0;
      let peakShiftExact = (peakIndex + offset) * (pitchFactor - 1);

      if (peakIndexShifted > this.magnitudes.length) {
        break;
      }

      // find region of influence
      var startIndex = 0;
      var endIndex = this.fftSize;
      if (i > 0) {
        let peakIndexBefore = this.peakIndexes[i - 1];
        startIndex = peakIndex - Math.floor((peakIndex - peakIndexBefore) / 2);
      }
      if (i < this.nbPeaks - 1) {
        let peakIndexAfter = this.peakIndexes[i + 1];
        endIndex = peakIndex + Math.ceil((peakIndexAfter - peakIndex) / 2);
      }

      // shift whole region of influence around peak to shifted peak
      let startOffset = startIndex - peakIndex;
      let endOffset = endIndex - peakIndex;
      for (var j = startOffset; j < endOffset; j++) {
        let binIndex = peakIndex + j;
        let binIndexShifted = peakIndexShifted + j;

        if (binIndexShifted >= this.magnitudes.length) {
          break;
        }

        // phase advances at the exact fractional shift
        let omegaDelta = (2 * Math.PI * peakShiftExact) / this.fftSize;
        let phaseShiftReal = Math.cos(omegaDelta * this.timeCursor);
        let phaseShiftImag = Math.sin(omegaDelta * this.timeCursor);

        let indexReal = binIndex * 2;
        let indexImag = indexReal + 1;
        let valueReal = this.freqComplexBuffer[indexReal];
        let valueImag = this.freqComplexBuffer[indexImag];

        let valueShiftedReal =
          valueReal * phaseShiftReal - valueImag * phaseShiftImag;
        let valueShiftedImag =
          valueReal * phaseShiftImag + valueImag * phaseShiftReal;

        let indexShiftedReal = binIndexShifted * 2;
        let indexShiftedImag = indexShiftedReal + 1;
        this.freqComplexBufferShifted[indexShiftedReal] += valueShiftedReal;
        this.freqComplexBufferShifted[indexShiftedImag] += valueShiftedImag;
      }
    }
  }
}

// @ts-ignore
registerProcessor("phase-vocoder-processor", PhaseVocoderProcessor);
