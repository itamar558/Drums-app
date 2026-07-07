/** Synthetic drum-audio generator used only by tests, to validate the DSP
 * pipeline without needing a real recording or device. */

import { highpassFilter, lowpassFilter } from '../filters';

export const SAMPLE_RATE = 44100;

function noise(n: number, rng: () => number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rng() * 2 - 1;
  return out;
}

// Deterministic PRNG so tests are reproducible.
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Reuse the engine's own steep (cascaded biquad) filters to shape the test
// instruments, applied twice for even cleaner separation -- a real drum
// genuinely has very little energy outside its natural register (a hi-hat
// has almost no sub-150Hz content, a kick almost none above 2kHz), so the
// synthetic signal should reflect that instead of leaking across bands via
// a weak filter and confusing what the classifier is even being tested
// against.
function lowpass(signal: Float32Array, cutoffHz: number, sampleRate: number): Float32Array {
  return lowpassFilter(lowpassFilter(signal, cutoffHz, sampleRate), cutoffHz, sampleRate);
}

function highpass(signal: Float32Array, cutoffHz: number, sampleRate: number): Float32Array {
  return highpassFilter(highpassFilter(signal, cutoffHz, sampleRate), cutoffHz, sampleRate);
}

// A hard 0-to-peak jump is an artificial step discontinuity that briefly
// excites *any* filter's transient response regardless of its passband
// (impulses are broadband), which would make a "pure kick" spuriously
// register in the snare/hi-hat bands too. Real drum hits ramp up over a
// couple of milliseconds, so a short attack avoids that artifact.
const ATTACK_SEC = 0.002;

function envelope(n: number, sampleRate: number, decaySec: number): Float32Array {
  const out = new Float32Array(n);
  const attackSamples = Math.max(1, Math.floor(sampleRate * ATTACK_SEC));
  for (let i = 0; i < n; i++) {
    const attack = Math.min(1, i / attackSamples);
    out[i] = attack * Math.exp(-i / (sampleRate * decaySec));
  }
  return out;
}

function mixInto(dest: Float32Array, src: Float32Array, startSample: number, gain: number): void {
  for (let i = 0; i < src.length; i++) {
    const idx = startSample + i;
    if (idx >= 0 && idx < dest.length) dest[idx] += src[i] * gain;
  }
}

let rngSeed = 1;

// Filtering happens AFTER the percussive envelope is applied, not before.
// Multiplying an already-band-limited signal by a sharp time-domain window
// re-spreads its spectrum (multiplication in time = convolution in
// frequency), so filtering the raw noise first and enveloping second still
// leaks energy outside the intended band proportional to how sharp the
// envelope is. An LTI filter applied *last* cannot output energy outside
// its passband no matter how sharp its input is -- exactly like how a real
// drum's resonant shell, not the stick strike itself, shapes the sound.

/** Low, thumpy, fast-decaying burst -- stands in for a kick drum. */
export function kickBurst(sampleRate: number): Float32Array {
  const n = Math.floor(sampleRate * 0.15);
  const env = envelope(n, sampleRate, 0.05);
  const shaped = noise(n, mulberry32(rngSeed++)).map((v, i) => v * env[i]);
  return lowpass(shaped, 100, sampleRate);
}

/**
 * Band-limited noise (snare-wire buzz, rolled off above ~4kHz like a real
 * snare's mic response) -- stands in for a snare. A literal flat
 * white-noise burst isn't representative: white noise's energy
 * concentrates in whichever band spans the most Hz, which would be "high"
 * by bandwidth alone, not because it resembles a snare.
 */
export function snareBurst(sampleRate: number): Float32Array {
  const n = Math.floor(sampleRate * 0.12);
  const env = envelope(n, sampleRate, 0.04);
  const shaped = noise(n, mulberry32(rngSeed++)).map((v, i) => v * env[i] * 1.5);
  return lowpass(highpass(shaped, 300, sampleRate), 4000, sampleRate);
}

/** High, sharp, very fast-decaying burst -- stands in for a closed hi-hat. */
export function hihatBurst(sampleRate: number): Float32Array {
  const n = Math.floor(sampleRate * 0.05);
  const env = envelope(n, sampleRate, 0.015);
  const shaped = noise(n, mulberry32(rngSeed++)).map((v, i) => v * env[i]);
  return highpass(shaped, 6000, sampleRate);
}

/** High-frequency burst, louder and much longer decay -- stands in for a crash cymbal. */
export function crashBurst(sampleRate: number): Float32Array {
  const n = Math.floor(sampleRate * 0.8);
  const env = envelope(n, sampleRate, 0.35);
  const shaped = noise(n, mulberry32(rngSeed++)).map((v, i) => v * env[i] * 2.5);
  return highpass(shaped, 5000, sampleRate);
}

export type HitSpec = { time: number; voice: 'kick' | 'snare' | 'hihat' | 'crash' };

/** Renders a list of (time, voice) hits into a single mono PCM buffer. */
export function renderHits(hits: HitSpec[], durationSec: number, sampleRate: number = SAMPLE_RATE): Float32Array {
  const buffer = new Float32Array(Math.ceil(durationSec * sampleRate) + sampleRate);
  for (const hit of hits) {
    const startSample = Math.round(hit.time * sampleRate);
    const burst =
      hit.voice === 'kick'
        ? kickBurst(sampleRate)
        : hit.voice === 'snare'
          ? snareBurst(sampleRate)
          : hit.voice === 'hihat'
            ? hihatBurst(sampleRate)
            : crashBurst(sampleRate);
    mixInto(buffer, burst, startSample, 1);
  }
  return buffer;
}

/**
 * Builds a steady 4/4 rock-groove pattern over `numMeasures` bars at `bpm`:
 * kick on 1 & 3, snare on 2 & 4, 8th-note hi-hats throughout. Returns the
 * hit list (for assertions) and the rendered PCM.
 */
export function buildGroove(
  numMeasures: number,
  bpm: number,
  opts: { fillEveryNMeasures?: number; sampleRate?: number } = {},
): { hits: HitSpec[]; samples: Float32Array; sampleRate: number; beatDuration: number } {
  const sampleRate = opts.sampleRate ?? SAMPLE_RATE;
  const beatDuration = 60 / bpm;
  const measureDuration = beatDuration * 4;
  const hits: HitSpec[] = [];

  for (let m = 0; m < numMeasures; m++) {
    const measureStart = m * measureDuration;
    const isFillMeasure = opts.fillEveryNMeasures ? (m + 1) % opts.fillEveryNMeasures === 0 : false;

    if (isFillMeasure) {
      // Busy 16th-note snare/kick alternation standing in for a fill.
      for (let s = 0; s < 16; s++) {
        hits.push({
          time: measureStart + s * (beatDuration / 4),
          voice: s % 2 === 0 ? 'snare' : 'kick',
        });
      }
      continue;
    }

    hits.push({ time: measureStart + 0 * beatDuration, voice: 'kick' });
    hits.push({ time: measureStart + 2 * beatDuration, voice: 'kick' });
    hits.push({ time: measureStart + 1 * beatDuration, voice: 'snare' });
    hits.push({ time: measureStart + 3 * beatDuration, voice: 'snare' });
    for (let e = 0; e < 8; e++) {
      hits.push({ time: measureStart + e * (beatDuration / 2), voice: 'hihat' });
    }
  }

  hits.sort((a, b) => a.time - b.time);
  const samples = renderHits(hits, numMeasures * measureDuration, sampleRate);
  return { hits, samples, sampleRate, beatDuration };
}
