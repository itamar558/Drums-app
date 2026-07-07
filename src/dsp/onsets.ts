import { bandpassFilter, highpassFilter, lowpassFilter } from './filters';
import type { OnsetEvent } from './types';

const FRAME_SIZE = 1024;
const HOP_SIZE = 512;
const MIN_ONSET_GAP_SEC = 0.06;
const DECAY_TAIL_WINDOW_SEC = 0.13;
const DECAY_TAIL_MAX_RATIO = 0.5;
const PEAK_WINDOW = 8;
const PEAK_THRESHOLD_MULTIPLIER = 1.5;

// Kick, snare (body) and hi-hat/cymbal live in mostly-disjoint frequency
// ranges, so each gets its own independent time-domain bandpass filter and
// onset detector. This lets simultaneous hits -- e.g. kick + hi-hat on the
// same beat, the normal case in a rock groove -- register as two separate
// events instead of one ambiguous blend. The kick/snare boundary leaves a
// deliberate gap (120-190Hz) rather than an exact split: a snare's body
// resonance often sits right around 150-200Hz, close enough to a kick's
// upper harmonics that a shared boundary there let real snare hits
// systematically bleed into the kick band.
const KICK_MAX_HZ = 120;
const SNARE_BAND: [number, number] = [190, 2000];
const HIGH_MIN_HZ = 2000;

function rmsEnvelope(signal: Float32Array): number[] {
  const numFrames = Math.max(0, Math.floor((signal.length - FRAME_SIZE) / HOP_SIZE) + 1);
  const env: number[] = [];
  for (let f = 0; f < numFrames; f++) {
    const start = f * HOP_SIZE;
    let sumSq = 0;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const s = signal[start + i] ?? 0;
      sumSq += s * s;
    }
    env.push(Math.sqrt(sumSq / FRAME_SIZE));
  }
  return env;
}

function risingFlux(envelope: number[]): number[] {
  // Treat the start of the buffer as implicit silence, so a hit occurring
  // right at the very beginning (no lead-in) still registers as a rise
  // instead of being invisible to a frame-to-frame difference.
  const flux: number[] = [envelope[0] ?? 0];
  for (let i = 1; i < envelope.length; i++) {
    const diff = envelope[i] - envelope[i - 1];
    flux.push(diff > 0 ? diff : 0);
  }
  return flux;
}

// A rise must clear both the local adaptive threshold AND this fraction of
// the loudest rise anywhere in the track. Without the second (absolute)
// floor, a near-silent baseline -- e.g. no other hits nearby -- makes the
// *relative* threshold collapse toward zero, so trace amounts of filter
// leakage from an unrelated band's transient would spuriously "peak".
const MIN_FLUX_FRACTION_OF_PEAK = 0.12;
// Window after an onset's flux peak, searched for the envelope's true peak
// amplitude (a fast attack's envelope can keep climbing a few ms past the
// derivative's own peak).
const PEAK_ENVELOPE_LOOKAHEAD_FRAMES = 3;

function peakEnvelopeNear(envelope: number[], frameIndex: number): number {
  const hi = Math.min(envelope.length - 1, frameIndex + PEAK_ENVELOPE_LOOKAHEAD_FRAMES);
  let peak = 0;
  for (let k = frameIndex; k <= hi; k++) peak = Math.max(peak, envelope[k]);
  return peak;
}

function pickPeaks(flux: number[], envelope: number[], sampleRate: number): OnsetEvent[] {
  const maxFlux = Math.max(0, ...flux);
  const absoluteFloor = maxFlux * MIN_FLUX_FRACTION_OF_PEAK;
  const candidates: OnsetEvent[] = [];

  for (let f = 0; f < flux.length; f++) {
    const lo = Math.max(0, f - PEAK_WINDOW);
    const hi = Math.min(flux.length - 1, f + PEAK_WINDOW);
    let sum = 0;
    let count = 0;
    for (let k = lo; k <= hi; k++) {
      sum += flux[k];
      count++;
    }
    const localMean = sum / count;
    const threshold = Math.max(localMean * PEAK_THRESHOLD_MULTIPLIER, absoluteFloor) + 1e-9;
    const isLocalPeak =
      flux[f] > threshold && flux[f] >= (flux[f - 1] ?? 0) && flux[f] >= (flux[f + 1] ?? 0);
    if (isLocalPeak) {
      candidates.push({
        time: (f * HOP_SIZE) / sampleRate,
        strength: flux[f],
        peakEnvelope: peakEnvelopeNear(envelope, f),
      });
    }
  }

  // Non-maximum suppression: a single hit's decay can produce more than one
  // "greater than immediate neighbors" bump within MIN_ONSET_GAP_SEC, so
  // keep the strongest candidate per cluster rather than just the earliest.
  // A second, wider tier covers noisy decay tails specifically: a hit's
  // random noise texture riding on its exponential decay can occasionally
  // produce a secondary bump beyond MIN_ONSET_GAP_SEC that's still clearly
  // part of the same hit's tail rather than a new one -- but only when
  // it's much weaker than the onset it trails, so a genuine subsequent hit
  // of similar loudness (fast repeated notes) is never swallowed by it.
  const accepted: OnsetEvent[] = [];
  for (const candidate of [...candidates].sort((a, b) => b.strength - a.strength)) {
    const suppressed = accepted.some((a) => {
      const dt = Math.abs(a.time - candidate.time);
      if (dt < MIN_ONSET_GAP_SEC) return true;
      if (dt < DECAY_TAIL_WINDOW_SEC && candidate.strength < a.strength * DECAY_TAIL_MAX_RATIO) return true;
      return false;
    });
    if (!suppressed) accepted.push(candidate);
  }
  return accepted.sort((a, b) => a.time - b.time);
}

function detectOnsetsInFiltered(filtered: Float32Array, sampleRate: number): OnsetEvent[] {
  const envelope = rmsEnvelope(filtered);
  return pickPeaks(risingFlux(envelope), envelope, sampleRate);
}

export interface BandOnsets {
  kick: OnsetEvent[];
  snare: OnsetEvent[];
  high: OnsetEvent[];
}

/** Detects onsets independently in the kick/snare/high-frequency bands. */
export function detectBandOnsets(samples: Float32Array, sampleRate: number): BandOnsets {
  if (samples.length < FRAME_SIZE) return { kick: [], snare: [], high: [] };

  const kickFiltered = lowpassFilter(samples, KICK_MAX_HZ, sampleRate);
  const snareFiltered = bandpassFilter(samples, SNARE_BAND[0], SNARE_BAND[1], sampleRate);
  const highFiltered = highpassFilter(samples, HIGH_MIN_HZ, sampleRate);

  return {
    kick: detectOnsetsInFiltered(kickFiltered, sampleRate),
    snare: detectOnsetsInFiltered(snareFiltered, sampleRate),
    high: detectOnsetsInFiltered(highFiltered, sampleRate),
  };
}
