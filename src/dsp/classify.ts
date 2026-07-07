import type { ClassifiedHit, DrumVoice, OnsetEvent } from './types';
import { median } from './util';

const KICK_LOW_FRACTION = 0.45;
const CYMBAL_HIGH_FRACTION = 0.5;
const CRASH_STRENGTH_MULTIPLIER = 2.2;

/**
 * Voice heuristic: kick = low-frequency energy dominates the onset frame;
 * hi-hat/crash = high-frequency energy dominates; everything else is treated
 * as snare (broadband transient + mid/high noise from the snare wires).
 * Among the high-frequency group, unusually loud/sustained hits are labeled
 * crash rather than hi-hat.
 */
export function classifyOnsets(onsets: OnsetEvent[]): ClassifiedHit[] {
  if (onsets.length === 0) return [];
  const maxStrength = Math.max(...onsets.map((o) => o.strength)) || 1;
  const medianStrength = median(onsets.map((o) => o.strength)) || 1;

  return onsets.map((onset) => {
    const { low, high } = onset.bands;
    let voice: DrumVoice;
    if (low >= KICK_LOW_FRACTION && low >= high) {
      voice = 'kick';
    } else if (high >= CYMBAL_HIGH_FRACTION) {
      voice = onset.strength >= medianStrength * CRASH_STRENGTH_MULTIPLIER ? 'crash' : 'hihat';
    } else {
      voice = 'snare';
    }
    return {
      time: onset.time,
      voice,
      velocity: Math.min(1, onset.strength / maxStrength),
    };
  });
}
