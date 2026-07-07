import type { TempoInfo } from './types';

const MIN_BPM = 60;
const MAX_BPM = 200;
const MIN_IOI_SEC = 0.05;
const MAX_IOI_SEC = 2.5;

/** Folds a candidate BPM into [MIN_BPM, MAX_BPM] by doubling/halving. */
function foldBpm(bpm: number): number {
  let b = bpm;
  while (b < MIN_BPM) b *= 2;
  while (b > MAX_BPM) b /= 2;
  return b;
}

/**
 * Estimates BPM from a histogram of inter-onset intervals (folded to a
 * common octave), then finds the sixteenth-note grid phase that best
 * aligns with the observed onsets.
 */
export function estimateTempo(onsetTimes: number[]): TempoInfo {
  if (onsetTimes.length < 2) {
    return { bpm: 120, beatDuration: 0.5, gridOffset: onsetTimes[0] ?? 0 };
  }

  const sorted = [...onsetTimes].sort((a, b) => a - b);
  const bpmVotes = new Map<number, number>();

  for (let i = 0; i < sorted.length - 1; i++) {
    const ioi = sorted[i + 1] - sorted[i];
    if (ioi < MIN_IOI_SEC || ioi > MAX_IOI_SEC) continue;
    const bpm = Math.round(foldBpm(60 / ioi));
    bpmVotes.set(bpm, (bpmVotes.get(bpm) ?? 0) + 1);
  }

  let bestBpm = 120;
  let bestVotes = -1;
  for (const [bpm, votes] of bpmVotes) {
    if (votes > bestVotes) {
      bestVotes = votes;
      bestBpm = bpm;
    }
  }

  const beatDuration = 60 / bestBpm;
  const sixteenth = beatDuration / 4;

  // Find the grid phase offset in [0, sixteenth) that minimizes total
  // quantization error of all onsets against the sixteenth-note grid.
  const STEPS = 32;
  let bestOffset = 0;
  let bestError = Infinity;
  for (let s = 0; s < STEPS; s++) {
    const candidateOffset = sorted[0] - (s / STEPS) * sixteenth;
    let error = 0;
    for (const t of sorted) {
      const rel = (t - candidateOffset) / sixteenth;
      const nearest = Math.round(rel);
      error += Math.abs(rel - nearest);
    }
    if (error < bestError) {
      bestError = error;
      bestOffset = candidateOffset;
    }
  }

  return { bpm: bestBpm, beatDuration, gridOffset: bestOffset };
}
