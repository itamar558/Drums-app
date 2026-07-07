import { detectFills, groupSections } from '../structure';
import type { GridSlot, Measure } from '../types';

function makeMeasure(index: number, hitSlots: number[], voice: 'kick' | 'snare' | 'hihat' = 'kick'): Measure {
  const slots: GridSlot[] = Array.from({ length: 16 }, (_, s) => ({
    slot: s,
    voices: hitSlots.includes(s) ? [voice] : [],
  }));
  const patternKey = slots
    .filter((s) => s.voices.length > 0)
    .map((s) => `${s.slot}:${s.voices.join('')}`)
    .join('|');
  return { index, slots, patternKey, isFill: false, isRepeatOfPrevious: false };
}

describe('detectFills', () => {
  it('flags a measure much denser than the established baseline', () => {
    const normal = () => makeMeasure(0, [0, 4, 8, 12]);
    const busy = makeMeasure(0, Array.from({ length: 16 }, (_, i) => i));
    const measures = [normal(), normal(), normal(), normal(), busy];
    const flagged = detectFills(measures.map((m, i) => ({ ...m, index: i })));
    expect(flagged.slice(0, 4).every((m) => !m.isFill)).toBe(true);
    expect(flagged[4].isFill).toBe(true);
  });

  it('does not flag a steady, uniform groove', () => {
    const measures = Array.from({ length: 8 }, (_, i) => makeMeasure(i, [0, 4, 8, 12]));
    const flagged = detectFills(measures);
    expect(flagged.every((m) => !m.isFill)).toBe(true);
  });

  it('returns an empty array for no measures', () => {
    expect(detectFills([])).toEqual([]);
  });
});

describe('groupSections', () => {
  it('groups a verse/chorus/verse pattern into 3 sections, reusing the verse label', () => {
    const verse = () => makeMeasure(0, [0, 4, 8, 12], 'kick');
    const chorus = () => makeMeasure(0, [0, 2, 4, 6, 8, 10, 12, 14], 'snare');

    const measures: Measure[] = [
      ...Array.from({ length: 4 }, () => verse()),
      ...Array.from({ length: 4 }, () => chorus()),
      ...Array.from({ length: 4 }, () => verse()),
    ].map((m, i) => ({ ...m, index: i }));

    const sections = groupSections(measures);
    expect(sections).toHaveLength(3);
    expect(sections[0].label).toBe('Section A');
    expect(sections[1].label).toBe('Section B');
    expect(sections[2].label).toBe('Section A (2)');
    expect(sections[0].measures).toHaveLength(4);
    expect(sections[1].measures).toHaveLength(4);
    expect(sections[2].measures).toHaveLength(4);
  });

  it('keeps a fill measure within the current section instead of starting a new one', () => {
    const verse = () => makeMeasure(0, [0, 4, 8, 12]);
    const fillMeasure = { ...makeMeasure(0, Array.from({ length: 16 }, (_, i) => i)), isFill: true };

    const measures: Measure[] = [verse(), verse(), fillMeasure, verse(), verse()].map((m, i) => ({
      ...m,
      index: i,
    }));

    const sections = groupSections(measures);
    expect(sections).toHaveLength(1);
    expect(sections[0].measures).toHaveLength(5);
  });

  it('tolerates a 2-bar alternating groove as a single section', () => {
    const barA = () => makeMeasure(0, [0, 8], 'kick');
    const barB = () => makeMeasure(0, [4, 12], 'snare');
    const measures: Measure[] = [barA(), barB(), barA(), barB()].map((m, i) => ({ ...m, index: i }));
    const sections = groupSections(measures);
    expect(sections).toHaveLength(1);
  });

  it('returns an empty array for no measures', () => {
    expect(groupSections([])).toEqual([]);
  });
});
