import { analyzeSamples } from '../analyze';
import { buildGroove } from './testSignal';

describe('analyzeSamples (full pipeline)', () => {
  it('transcribes a steady 4/4 groove with a fill every 4th bar', () => {
    const bpm = 120;
    const { samples, sampleRate } = buildGroove(12, bpm, { fillEveryNMeasures: 4 });
    const song = analyzeSamples(samples, sampleRate);

    // Onset times are quantized to the ~11.6ms STFT hop, so BPM recovery
    // won't be pixel-perfect -- a few BPM of slack is expected here.
    expect(Math.abs(song.bpm - bpm)).toBeLessThanOrEqual(5);
    expect(song.timeSignature).toEqual([4, 4]);

    const allMeasures = song.sections.flatMap((s) => s.measures);
    expect(allMeasures).toHaveLength(12);

    // Fills land on measures 3, 7, 11 (0-indexed), matching fillEveryNMeasures: 4.
    const fillIndices = allMeasures.filter((m) => m.isFill).map((m) => m.index);
    expect(fillIndices).toEqual([3, 7, 11]);

    // Every section should have a real label.
    for (const section of song.sections) {
      expect(section.label.length).toBeGreaterThan(0);
    }

    // Non-fill measures should carry the expected kick/snare/hihat groove,
    // not empty slots.
    const groove = allMeasures.find((m) => !m.isFill)!;
    const kickSlots = groove.slots.filter((s) => s.voices.includes('kick'));
    const snareSlots = groove.slots.filter((s) => s.voices.includes('snare'));
    const hihatSlots = groove.slots.filter((s) => s.voices.includes('hihat'));
    expect(kickSlots.length).toBeGreaterThan(0);
    expect(snareSlots.length).toBeGreaterThan(0);
    expect(hihatSlots.length).toBeGreaterThan(0);
  });

  it('handles a very short or silent input without throwing', () => {
    const silence = new Float32Array(44100 * 2);
    const song = analyzeSamples(silence, 44100);
    expect(song.sections).toEqual([]);
  });
});
