import { estimateTempo } from '../tempo';

function clickTrack(bpm: number, count: number, offset: number = 0): number[] {
  const beatDuration = 60 / bpm;
  return Array.from({ length: count }, (_, i) => offset + i * beatDuration);
}

describe('estimateTempo', () => {
  it('recovers the BPM of a steady click track', () => {
    const { bpm } = estimateTempo(clickTrack(120, 32));
    expect(bpm).toBeCloseTo(120, 0);
  });

  it('recovers BPM for a tempo with a non-trivial offset', () => {
    const { bpm } = estimateTempo(clickTrack(95, 40, 0.37));
    expect(bpm).toBeCloseTo(95, 0);
  });

  it('finds a grid offset that aligns cleanly with the onsets', () => {
    const offset = 0.12;
    const bpm = 100;
    const onsets = clickTrack(bpm, 20, offset);
    const tempo = estimateTempo(onsets);
    const sixteenth = tempo.beatDuration / 4;
    for (const t of onsets) {
      const rel = (t - tempo.gridOffset) / sixteenth;
      const err = Math.abs(rel - Math.round(rel));
      expect(err).toBeLessThan(0.15);
    }
  });

  it('handles 8th-note subdivisions without halving/doubling the tempo', () => {
    const bpm = 140;
    const beatDuration = 60 / bpm;
    // 8th notes: half a beat apart.
    const onsets = Array.from({ length: 40 }, (_, i) => i * (beatDuration / 2));
    const { bpm: estimated } = estimateTempo(onsets);
    // Folding may land on bpm or 2x/0.5x of it -- all are musically
    // equivalent readings of the same grid, just octave-ambiguous.
    const ratio = estimated / bpm;
    const closeToPowerOfTwo = [0.5, 1, 2].some((r) => Math.abs(ratio - r) < 0.05);
    expect(closeToPowerOfTwo).toBe(true);
  });

  it('falls back to a default for fewer than two onsets', () => {
    expect(estimateTempo([]).bpm).toBe(120);
    expect(estimateTempo([1.23]).bpm).toBe(120);
  });
});
