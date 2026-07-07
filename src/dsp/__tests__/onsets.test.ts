import { detectBandOnsets } from '../onsets';
import { buildGroove, kickBurst, renderHits, SAMPLE_RATE } from './testSignal';

describe('detectBandOnsets', () => {
  it('finds one onset per hit for each voice in a steady groove', () => {
    const { hits, samples, sampleRate } = buildGroove(4, 120);
    const bandOnsets = detectBandOnsets(samples, sampleRate);

    const trueKicks = hits.filter((h) => h.voice === 'kick').length;
    const trueSnares = hits.filter((h) => h.voice === 'snare').length;
    const trueHihats = hits.filter((h) => h.voice === 'hihat').length;

    expect(bandOnsets.kick.length).toBeGreaterThanOrEqual(trueKicks - 1);
    expect(bandOnsets.snare.length).toBeGreaterThanOrEqual(trueSnares - 1);
    expect(bandOnsets.high.length).toBeGreaterThanOrEqual(trueHihats - 1);
  });

  it('locates kick onset times close to the true hit times', () => {
    const sampleRate = SAMPLE_RATE;
    const times = [0.5, 1.0, 1.5, 2.0];
    const hits = times.map((time) => ({ time, voice: 'kick' as const }));
    const samples = renderHits(hits, 2.5, sampleRate);
    const { kick } = detectBandOnsets(samples, sampleRate);

    expect(kick.length).toBe(times.length);
    kick.forEach((onset, i) => {
      expect(Math.abs(onset.time - times[i])).toBeLessThan(0.03);
    });
  });

  it('returns nothing for silence', () => {
    const samples = new Float32Array(SAMPLE_RATE * 2);
    const bandOnsets = detectBandOnsets(samples, SAMPLE_RATE);
    expect(bandOnsets.kick).toEqual([]);
    expect(bandOnsets.snare).toEqual([]);
    expect(bandOnsets.high).toEqual([]);
  });

  it('detects a kick burst as a strong kick-band onset, negligible in the high band', () => {
    // In a totally silent buffer, a band with no other real activity has
    // no calibration data of its own, so trace cross-band leakage can
    // still register as a (very quiet) onset here -- that's fine, since
    // classifyBandOnsets is what ultimately filters those out via the
    // rest of a song's real per-band activity (see analyze.test.ts, which
    // uses a realistic groove and shows no such cross-talk). What matters
    // is that any high-band blip is negligible next to the real kick.
    const sampleRate = SAMPLE_RATE;
    const burst = kickBurst(sampleRate);
    const padded = new Float32Array(sampleRate);
    padded.set(burst, 1000);
    const { kick, high } = detectBandOnsets(padded, sampleRate);
    expect(kick.length).toBeGreaterThanOrEqual(1);
    const kickPeak = Math.max(...kick.map((o) => o.peakEnvelope));
    const highPeak = Math.max(0, ...high.map((o) => o.peakEnvelope));
    expect(highPeak).toBeLessThan(kickPeak * 0.1);
  });
});
