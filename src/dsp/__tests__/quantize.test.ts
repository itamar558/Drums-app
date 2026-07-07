import { quantizeToMeasures } from '../quantize';
import type { ClassifiedHit, TempoInfo } from '../types';

function tempoFor(bpm: number, gridOffset: number = 0): TempoInfo {
  return { bpm, beatDuration: 60 / bpm, gridOffset };
}

describe('quantizeToMeasures', () => {
  it('places a basic rock beat onto the expected 16th-note slots', () => {
    const bpm = 120;
    const beat = 60 / bpm;
    const hits: ClassifiedHit[] = [
      { time: 0, voice: 'kick', velocity: 1 },
      { time: beat, voice: 'snare', velocity: 1 },
      { time: 2 * beat, voice: 'kick', velocity: 1 },
      { time: 3 * beat, voice: 'snare', velocity: 1 },
    ];
    const measures = quantizeToMeasures(hits, tempoFor(bpm));
    expect(measures).toHaveLength(1);
    const slots = measures[0].slots;
    expect(slots[0].voices).toEqual(['kick']);
    expect(slots[4].voices).toEqual(['snare']);
    expect(slots[8].voices).toEqual(['kick']);
    expect(slots[12].voices).toEqual(['snare']);
    expect(slots[2].voices).toEqual([]);
  });

  it('merges simultaneous hits (kick + hi-hat) onto the same slot', () => {
    const bpm = 120;
    const hits: ClassifiedHit[] = [
      { time: 0, voice: 'kick', velocity: 1 },
      { time: 0.001, voice: 'hihat', velocity: 1 },
    ];
    const measures = quantizeToMeasures(hits, tempoFor(bpm));
    expect(measures[0].slots[0].voices.sort()).toEqual(['hihat', 'kick']);
  });

  it('marks a measure identical to the previous one as a repeat', () => {
    const bpm = 120;
    const beat = 60 / bpm;
    const measureDuration = beat * 4;
    const hits: ClassifiedHit[] = [];
    for (let m = 0; m < 2; m++) {
      hits.push({ time: m * measureDuration, voice: 'kick', velocity: 1 });
      hits.push({ time: m * measureDuration + beat, voice: 'snare', velocity: 1 });
    }
    const measures = quantizeToMeasures(hits, tempoFor(bpm));
    expect(measures).toHaveLength(2);
    expect(measures[0].isRepeatOfPrevious).toBe(false);
    expect(measures[1].isRepeatOfPrevious).toBe(true);
    expect(measures[1].patternKey).toBe(measures[0].patternKey);
  });

  it('does not mark a differing measure as a repeat', () => {
    const bpm = 120;
    const beat = 60 / bpm;
    const measureDuration = beat * 4;
    const hits: ClassifiedHit[] = [
      { time: 0, voice: 'kick', velocity: 1 },
      { time: measureDuration, voice: 'snare', velocity: 1 },
    ];
    const measures = quantizeToMeasures(hits, tempoFor(bpm));
    expect(measures[1].isRepeatOfPrevious).toBe(false);
  });

  it('returns an empty array for no hits', () => {
    expect(quantizeToMeasures([], tempoFor(120))).toEqual([]);
  });
});
