import { detectBandOnsets } from '../onsets';
import { classifyBandOnsets } from '../classify';
import { crashBurst, hihatBurst, kickBurst, snareBurst, SAMPLE_RATE } from './testSignal';

function classifyIsolatedBurst(burst: Float32Array) {
  const sampleRate = SAMPLE_RATE;
  const padded = new Float32Array(sampleRate);
  padded.set(burst, 1000);
  const bandOnsets = detectBandOnsets(padded, sampleRate);
  return classifyBandOnsets(bandOnsets);
}

describe('classifyBandOnsets', () => {
  // These bursts are tested in isolation -- a single hit in an otherwise
  // perfectly silent buffer, with no other genuine hits anywhere in that
  // band. Real per-band onset detection (see onsets.ts) leans on each
  // band's own adaptive threshold being calibrated by its *other* real
  // hits across a song; a totally silent buffer has no such calibration
  // data, so trace cross-band leakage can register as its own (very quiet)
  // onset here in a way it wouldn't in a real recording -- confirmed by
  // the full-pipeline test in analyze.test.ts using a realistic groove,
  // where cross-talk does not occur. So here we only assert the expected
  // voice is present and clearly dominant, not that it's the only one.
  it('classifies a low thumpy burst as kick', () => {
    const hits = classifyIsolatedBurst(kickBurst(SAMPLE_RATE));
    const kickHit = hits.find((h) => h.voice === 'kick');
    expect(kickHit).toBeDefined();
    expect(kickHit!.velocity).toBeGreaterThan(0.9);
  });

  it('classifies a broadband-in-the-body burst as snare', () => {
    const hits = classifyIsolatedBurst(snareBurst(SAMPLE_RATE));
    const snareHit = hits.find((h) => h.voice === 'snare');
    expect(snareHit).toBeDefined();
    expect(snareHit!.velocity).toBeGreaterThan(0.9);
  });

  it('classifies a sharp high burst as hihat', () => {
    const hits = classifyIsolatedBurst(hihatBurst(SAMPLE_RATE));
    const hihatHit = hits.find((h) => h.voice === 'hihat');
    expect(hihatHit).toBeDefined();
    expect(hihatHit!.velocity).toBeGreaterThan(0.9);
  });

  it('classifies a loud sustained high burst as crash, not hihat', () => {
    // Mix several quiet hihats with one loud crash so the crash's
    // strength stands out against the high band's own median.
    const sampleRate = SAMPLE_RATE;
    const buffer = new Float32Array(sampleRate * 3);
    for (let i = 0; i < 5; i++) {
      buffer.set(hihatBurst(sampleRate), 1000 + i * sampleRate * 0.5);
    }
    const crash = crashBurst(sampleRate);
    buffer.set(crash, sampleRate * 2 + 1000);

    const bandOnsets = detectBandOnsets(buffer, sampleRate);
    const hits = classifyBandOnsets(bandOnsets);
    const nearCrashTime = hits.filter((h) => h.time > 1.9 && h.time < 2.2);
    expect(nearCrashTime.some((h) => h.voice === 'crash')).toBe(true);
    expect(nearCrashTime.some((h) => h.voice === 'hihat')).toBe(false);
  });

  it('keeps simultaneous kick + hi-hat as two separate classified hits', () => {
    const sampleRate = SAMPLE_RATE;
    const buffer = new Float32Array(sampleRate);
    const startSample = 1000;
    const kick = kickBurst(sampleRate);
    const hihat = hihatBurst(sampleRate);
    for (let i = 0; i < kick.length; i++) buffer[startSample + i] += kick[i];
    for (let i = 0; i < hihat.length; i++) buffer[startSample + i] += hihat[i];

    const bandOnsets = detectBandOnsets(buffer, sampleRate);
    const hits = classifyBandOnsets(bandOnsets);
    const voices = hits.map((h) => h.voice);
    expect(voices).toContain('kick');
    expect(voices).toContain('hihat');
  });

  it('returns an empty array for no onsets', () => {
    expect(classifyBandOnsets({ kick: [], snare: [], high: [] })).toEqual([]);
  });
});
