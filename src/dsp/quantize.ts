import { SIXTEENTHS_PER_MEASURE } from './types';
import type { ClassifiedHit, DrumVoice, GridSlot, Measure, TempoInfo } from './types';

const VOICE_ORDER: DrumVoice[] = ['kick', 'snare', 'hihat', 'crash'];
const VOICE_CODE: Record<DrumVoice, string> = { kick: 'K', snare: 'S', hihat: 'H', crash: 'C' };

function buildPatternKey(slots: GridSlot[]): string {
  return slots
    .filter((s) => s.voices.length > 0)
    .map((s) => `${s.slot}:${[...s.voices].sort().map((v) => VOICE_CODE[v]).join('')}`)
    .join('|');
}

/**
 * Quantizes classified hits onto a sixteenth-note grid (assumes 4/4 time)
 * and groups them into measures. Simultaneous hits (e.g. kick + hi-hat)
 * land on the same slot and are merged.
 */
export function quantizeToMeasures(hits: ClassifiedHit[], tempo: TempoInfo): Measure[] {
  if (hits.length === 0) return [];
  const sixteenth = tempo.beatDuration / 4;

  let maxSlot = 0;
  const slotVoices = new Map<number, Set<DrumVoice>>();
  for (const hit of hits) {
    const rawSlot = Math.round((hit.time - tempo.gridOffset) / sixteenth);
    const slot = Math.max(0, rawSlot);
    maxSlot = Math.max(maxSlot, slot);
    if (!slotVoices.has(slot)) slotVoices.set(slot, new Set());
    slotVoices.get(slot)!.add(hit.voice);
  }

  const numMeasures = Math.floor(maxSlot / SIXTEENTHS_PER_MEASURE) + 1;
  const measures: Measure[] = [];

  for (let m = 0; m < numMeasures; m++) {
    const slots: GridSlot[] = [];
    for (let s = 0; s < SIXTEENTHS_PER_MEASURE; s++) {
      const globalSlot = m * SIXTEENTHS_PER_MEASURE + s;
      const voices = slotVoices.get(globalSlot);
      slots.push({ slot: s, voices: voices ? VOICE_ORDER.filter((v) => voices.has(v)) : [] });
    }
    const patternKey = buildPatternKey(slots);
    measures.push({
      index: m,
      slots,
      patternKey,
      isFill: false,
      isRepeatOfPrevious: m > 0 && patternKey !== '' && patternKey === measures[m - 1].patternKey,
    });
  }

  return measures;
}
