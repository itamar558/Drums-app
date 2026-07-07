/** Minimal RBJ biquad filters, used to physically separate frequency bands
 * in the time domain before onset detection. This matters because a short
 * transient (e.g. a hi-hat's ~15ms attack) has inherently broadband
 * spectral leakage in an FFT window -- picking "low bins" out of an
 * unfiltered signal's spectrogram still lets that transient's energy show
 * up as a false low-frequency onset. Actually filtering the waveform first
 * removes that energy for real.
 */

export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function biquadLowpass(cutoffHz: number, sampleRate: number, q = 0.707): BiquadCoeffs {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cosw0 = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0: (1 - cosw0) / 2 / a0,
    b1: (1 - cosw0) / a0,
    b2: (1 - cosw0) / 2 / a0,
    a1: (-2 * cosw0) / a0,
    a2: (1 - alpha) / a0,
  };
}

function biquadHighpass(cutoffHz: number, sampleRate: number, q = 0.707): BiquadCoeffs {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cosw0 = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0: (1 + cosw0) / 2 / a0,
    b1: (-(1 + cosw0)) / a0,
    b2: (1 + cosw0) / 2 / a0,
    a1: (-2 * cosw0) / a0,
    a2: (1 - alpha) / a0,
  };
}

function applyBiquad(signal: Float32Array, c: BiquadCoeffs): Float32Array {
  const out = new Float32Array(signal.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < signal.length; i++) {
    const x0 = signal[i];
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

const STAGES = 2; // cascaded 2-pole stages => ~24dB/octave rolloff

export function lowpassFilter(signal: Float32Array, cutoffHz: number, sampleRate: number): Float32Array {
  const coeffs = biquadLowpass(cutoffHz, sampleRate);
  let out = signal;
  for (let i = 0; i < STAGES; i++) out = applyBiquad(out, coeffs);
  return out;
}

export function highpassFilter(signal: Float32Array, cutoffHz: number, sampleRate: number): Float32Array {
  const coeffs = biquadHighpass(cutoffHz, sampleRate);
  let out = signal;
  for (let i = 0; i < STAGES; i++) out = applyBiquad(out, coeffs);
  return out;
}

export function bandpassFilter(signal: Float32Array, lowHz: number, highHz: number, sampleRate: number): Float32Array {
  return lowpassFilter(highpassFilter(signal, lowHz, sampleRate), highHz, sampleRate);
}
