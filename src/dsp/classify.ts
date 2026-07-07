import type { BandOnsets } from './onsets';
import type { ClassifiedHit, DrumVoice } from './types';
import { median } from './util';

const CRASH_ENVELOPE_MULTIPLIER = 2.2;

/**
 * Labels each band's independently-detected onsets with a drum voice. Kick
 * and snare onsets map directly; the high band is shared by hi-hat and
 * crash cymbal, split by loudness relative to the high band's own median
 * (crashes ring out much louder/longer than hi-hat taps). Each band was
 * already thresholded independently against its own adaptive baseline (see
 * onsets.ts), so a hit doesn't need to "win" against the other bands here --
 * that's what correctly keeps simultaneous kick + hi-hat hits as two
 * separate voices instead of collapsing to whichever is louder.
 */
export function classifyBandOnsets(bandOnsets: BandOnsets): ClassifiedHit[] {
  const highMedianEnvelope = median(bandOnsets.high.map((o) => o.peakEnvelope)) || 1;
  const kickMax = Math.max(1e-12, ...bandOnsets.kick.map((o) => o.peakEnvelope));
  const snareMax = Math.max(1e-12, ...bandOnsets.snare.map((o) => o.peakEnvelope));
  const highMax = Math.max(1e-12, ...bandOnsets.high.map((o) => o.peakEnvelope));

  const hits: ClassifiedHit[] = [
    ...bandOnsets.kick.map((o) => ({ time: o.time, voice: 'kick' as DrumVoice, velocity: o.peakEnvelope / kickMax })),
    ...bandOnsets.snare.map((o) => ({
      time: o.time,
      voice: 'snare' as DrumVoice,
      velocity: o.peakEnvelope / snareMax,
    })),
    ...bandOnsets.high.map((o) => {
      const voice: DrumVoice = o.peakEnvelope >= highMedianEnvelope * CRASH_ENVELOPE_MULTIPLIER ? 'crash' : 'hihat';
      return { time: o.time, voice, velocity: o.peakEnvelope / highMax };
    }),
  ];

  hits.sort((a, b) => a.time - b.time);
  return hits;
}
