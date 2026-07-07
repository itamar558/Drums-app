import { applyHannWindow, magnitudeSpectrum } from './fft';
import type { BandEnergy, OnsetEvent } from './types';

const FRAME_SIZE = 1024;
const HOP_SIZE = 512;
const MIN_ONSET_GAP_SEC = 0.06;

// Band edges in Hz. Kick energy lives low; snare is broadband with strong
// mid/high noise; hi-hats and cymbals are dominated by high frequencies.
const LOW_MAX_HZ = 150;
const MID_MAX_HZ = 2000;

function bandEnergyFromSpectrum(spectrum: Float64Array, sampleRate: number, fftSize: number): BandEnergy {
  const binHz = sampleRate / fftSize;
  let low = 0;
  let mid = 0;
  let high = 0;
  for (let i = 1; i < spectrum.length; i++) {
    const freq = i * binHz;
    const energy = spectrum[i] * spectrum[i];
    if (freq <= LOW_MAX_HZ) low += energy;
    else if (freq <= MID_MAX_HZ) mid += energy;
    else high += energy;
  }
  const total = low + mid + high || 1;
  return { low: low / total, mid: mid / total, high: high / total };
}

/**
 * Detects onsets via spectral flux (sum of positive bin-magnitude increases
 * between consecutive STFT frames), peak-picked against a local adaptive
 * threshold. Each returned onset carries the frame's normalized band-energy
 * split, used downstream for drum-voice classification.
 */
export function detectOnsets(samples: Float32Array, sampleRate: number): OnsetEvent[] {
  const numFrames = Math.max(0, Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE) + 1);
  if (numFrames <= 0) return [];

  const spectra: Float64Array[] = [];
  const flux: number[] = [];
  let prevMag: Float64Array | null = null;

  for (let f = 0; f < numFrames; f++) {
    const start = f * HOP_SIZE;
    const frame = new Float64Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) frame[i] = samples[start + i] ?? 0;
    applyHannWindow(frame);
    const mag = magnitudeSpectrum(frame);
    spectra.push(mag);

    let flux_f = 0;
    if (prevMag) {
      for (let i = 0; i < mag.length; i++) {
        const diff = mag[i] - prevMag[i];
        if (diff > 0) flux_f += diff;
      }
    }
    flux.push(flux_f);
    prevMag = mag;
  }

  // Adaptive threshold: local moving average + margin, standard onset-detection practice.
  const WINDOW = 8;
  const MULTIPLIER = 1.5;
  const onsets: OnsetEvent[] = [];
  let lastOnsetTime = -Infinity;

  for (let f = 0; f < flux.length; f++) {
    const lo = Math.max(0, f - WINDOW);
    const hi = Math.min(flux.length - 1, f + WINDOW);
    let sum = 0;
    let count = 0;
    for (let k = lo; k <= hi; k++) {
      sum += flux[k];
      count++;
    }
    const localMean = sum / count;
    const threshold = localMean * MULTIPLIER + 1e-9;

    const isLocalPeak =
      flux[f] > threshold && flux[f] >= (flux[f - 1] ?? 0) && flux[f] >= (flux[f + 1] ?? 0);

    if (isLocalPeak) {
      const time = (f * HOP_SIZE) / sampleRate;
      if (time - lastOnsetTime >= MIN_ONSET_GAP_SEC) {
        onsets.push({
          time,
          strength: flux[f],
          bands: bandEnergyFromSpectrum(spectra[f], sampleRate, FRAME_SIZE),
        });
        lastOnsetTime = time;
      }
    }
  }

  return onsets;
}
