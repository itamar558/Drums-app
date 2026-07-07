import { buildSheetLayout } from '../layout';
import { MEASURES_PER_SYSTEM } from '../constants';
import type { GridSlot, Measure, Section, Song } from '../../dsp/types';

function emptySlots(active: Record<number, Measure['slots'][number]['voices']> = {}): GridSlot[] {
  return Array.from({ length: 16 }, (_, i) => ({ slot: i, voices: active[i] ?? [] }));
}

function makeMeasure(index: number, overrides: Partial<Measure> = {}): Measure {
  return {
    index,
    slots: emptySlots({ 0: ['kick'], 4: ['snare'] }),
    patternKey: `${index}`,
    isFill: false,
    isRepeatOfPrevious: false,
    ...overrides,
  };
}

function songWithMeasures(measures: Measure[], sectionLabel = 'Section A'): Song {
  const section: Section = { label: sectionLabel, startMeasure: measures[0]?.index ?? 0, measures };
  return { bpm: 120, timeSignature: [4, 4], sections: [section] };
}

describe('buildSheetLayout', () => {
  it('groups measures into systems of MEASURES_PER_SYSTEM', () => {
    const measures = [0, 1, 2, 3, 4].map((i) => makeMeasure(i));
    const layout = buildSheetLayout(songWithMeasures(measures));
    const expectedSystems = Math.ceil(measures.length / MEASURES_PER_SYSTEM);
    expect(layout.systems).toHaveLength(expectedSystems);
    expect(layout.systems[0].measures).toHaveLength(MEASURES_PER_SYSTEM);
  });

  it('attaches the section label only to the system containing the section start', () => {
    const verse = [0, 1].map((i) => makeMeasure(i));
    const chorus = [2, 3].map((i) => makeMeasure(i));
    const song: Song = {
      bpm: 120,
      timeSignature: [4, 4],
      sections: [
        { label: 'Verse 1', startMeasure: 0, measures: verse },
        { label: 'Chorus 1', startMeasure: 2, measures: chorus },
      ],
    };
    const layout = buildSheetLayout(song);
    expect(layout.systems[0].sectionLabel).toBe('Verse 1');
    expect(layout.systems[1].sectionLabel).toBe('Chorus 1');
  });

  it('does not attach a section label to a system that starts mid-section', () => {
    const measures = [0, 1, 2, 3].map((i) => makeMeasure(i));
    const layout = buildSheetLayout(songWithMeasures(measures));
    // With MEASURES_PER_SYSTEM=2, system 1 starts at measure index 2, which
    // is mid-section (the whole thing is one section starting at 0).
    expect(layout.systems[1].sectionLabel).toBeUndefined();
  });

  it('produces no notes/stems/beams for a fill measure, but keeps its position', () => {
    const measures = [makeMeasure(0, { isFill: true })];
    const layout = buildSheetLayout(songWithMeasures(measures));
    const m = layout.systems[0].measures[0];
    expect(m.isFill).toBe(true);
    expect(m.notes).toEqual([]);
    expect(m.stems).toEqual([]);
    expect(m.beams).toEqual([]);
  });

  it('produces no notes for a repeated measure', () => {
    const measures = [makeMeasure(0), makeMeasure(1, { isRepeatOfPrevious: true })];
    const layout = buildSheetLayout(songWithMeasures(measures));
    const repeated = layout.systems[0].measures[1];
    expect(repeated.isRepeat).toBe(true);
    expect(repeated.notes).toEqual([]);
  });

  it('places a note per active slot and merges simultaneous voices onto one stem', () => {
    const measure = makeMeasure(0, { slots: emptySlots({ 0: ['kick', 'hihat'] }) });
    const layout = buildSheetLayout(songWithMeasures([measure]));
    const m = layout.systems[0].measures[0];
    expect(m.notes).toHaveLength(2);
    expect(m.notes.map((n) => n.voice).sort()).toEqual(['hihat', 'kick']);
    expect(m.stems).toHaveLength(1);
  });

  it('beams two eighth-note-spaced hits within a beat as a single beam', () => {
    const measure = makeMeasure(0, { slots: emptySlots({ 0: ['hihat'], 2: ['hihat'] }) });
    const layout = buildSheetLayout(songWithMeasures([measure]));
    const m = layout.systems[0].measures[0];
    expect(m.beams).toHaveLength(1);
    expect(m.beams[0].doubled).toBe(false);
  });

  it('beams sixteenth-adjacent hits within a beat as a double beam', () => {
    const measure = makeMeasure(0, { slots: emptySlots({ 0: ['snare'], 1: ['snare'] }) });
    const layout = buildSheetLayout(songWithMeasures([measure]));
    const m = layout.systems[0].measures[0];
    expect(m.beams).toHaveLength(1);
    expect(m.beams[0].doubled).toBe(true);
  });

  it('does not beam a single isolated hit within a beat', () => {
    const measure = makeMeasure(0, { slots: emptySlots({ 0: ['kick'] }) });
    const layout = buildSheetLayout(songWithMeasures([measure]));
    const m = layout.systems[0].measures[0];
    expect(m.beams).toEqual([]);
    expect(m.stems).toHaveLength(1);
  });

  it('handles an empty song', () => {
    const layout = buildSheetLayout({ bpm: 120, timeSignature: [4, 4], sections: [] });
    expect(layout.systems).toEqual([]);
  });
});
