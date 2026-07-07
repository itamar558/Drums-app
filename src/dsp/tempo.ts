import { median } from './util';
import type { TempoInfo } from './types';

const MIN_BPM = 60;
const MAX_BPM = 200;

/** Folds a candidate BPM into [MIN_BPM, MAX_BPM] by doubling/halving. */
function foldBpm(bpm: number): number {
  let b = bpm;
  while (b < MIN_BPM) b *= 2;
  while (b > MAX_BPM) b /= 2;
  return b;
}

/**
 * For a candidate sixteenth-note duration, finds the phase offset in
 * [0, sixteenth) that best aligns the grid to the given onsets, and
 * returns that offset along with the total quantization error (sum of
 * fractional-slot deviations across all onsets).
 */
function bestPhaseFor(sorted: number[], sixteenth: number, steps: number): { offset: number; error: number } {
  let bestOffset = 0;
  let bestError = Infinity;
  for (let s = 0; s < steps; s++) {
    const candidateOffset = sorted[0] - (s / steps) * sixteenth;
    let error = 0;
    for (const t of sorted) {
      const rel = (t - candidateOffset) / sixteenth;
      error += Math.abs(rel - Math.round(rel));
    }
    if (error < bestError) {
      bestError = error;
      bestOffset = candidateOffset;
    }
  }
  return { offset: bestOffset, error: bestError };
}

/**
 * Estimates BPM and the sixteenth-note grid phase by directly searching
 * candidate tempos and scoring each by how well the observed onsets land
 * on that tempo's grid (coarse-to-fine, then refining phase precisely at
 * the winning tempo). This avoids the classic inter-onset-interval-
 * histogram approach's failure mode: folding a half-beat (8th-note)
 * interval to "one beat" by halving its implied BPM amplifies ordinary
 * hop-quantization jitter into a bimodal split across two adjacent (and
 * both wrong) integer BPM bins, so the histogram's peak can land on
 * neither the true tempo.
 */
export function estimateTempo(onsetTimes: number[]): TempoInfo {
  if (onsetTimes.length < 2) {
    return { bpm: 120, beatDuration: 0.5, gridOffset: onsetTimes[0] ?? 0 };
  }

  const sorted = [...onsetTimes].sort((a, b) => a - b);

  // A rough prior from the median inter-onset interval, used only to break
  // ties among grid-search candidates that fit the data equally well (e.g.
  // a plain quarter-note click track aligns just as perfectly to a grid at
  // half or double that tempo -- there's nothing in the data to prefer one,
  // so fall back to the simplest reading of the actual note spacing).
  const iois: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const ioi = sorted[i + 1] - sorted[i];
    if (ioi > 0.05 && ioi < 2.5) iois.push(ioi);
  }
  const priorBpm = iois.length > 0 ? foldBpm(60 / median(iois)) : 120;

  const coarseErrors = new Map<number, number>();
  let bestError = Infinity;
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.5) {
    const sixteenth = 60 / bpm / 4;
    const { error } = bestPhaseFor(sorted, sixteenth, 12);
    coarseErrors.set(bpm, error);
    if (error < bestError) bestError = error;
  }

  // Among candidates that fit the data almost as well as the best one,
  // prefer whichever is closest to the simple median-IOI prior.
  const TOLERANCE = bestError * 0.03 + 1e-6;
  let bestBpm = 120;
  let bestPriorDistance = Infinity;
  for (const [bpm, error] of coarseErrors) {
    if (error > bestError + TOLERANCE) continue;
    const priorDistance = Math.abs(bpm - priorBpm);
    if (priorDistance < bestPriorDistance) {
      bestPriorDistance = priorDistance;
      bestBpm = bpm;
    }
  }

  // Refine finely around the coarse winner (tempo and phase together).
  let refinedBpm = bestBpm;
  bestError = Infinity;
  for (let bpm = bestBpm - 0.5; bpm <= bestBpm + 0.5; bpm += 0.02) {
    const sixteenth = 60 / bpm / 4;
    const { error } = bestPhaseFor(sorted, sixteenth, 48);
    if (error < bestError) {
      bestError = error;
      refinedBpm = bpm;
    }
  }

  const beatDuration = 60 / refinedBpm;
  const sixteenth = beatDuration / 4;
  const { offset: gridOffset } = bestPhaseFor(sorted, sixteenth, 48);

  return { bpm: refinedBpm, beatDuration, gridOffset };
}
