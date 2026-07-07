import { detectOnsets } from './onsets';
import { classifyOnsets } from './classify';
import { estimateTempo } from './tempo';
import { quantizeToMeasures } from './quantize';
import { detectFills, groupSections } from './structure';
import type { Song } from './types';

/**
 * Full pipeline: raw mono PCM samples -> transcribed Song (tempo, measures,
 * sections, fills). This module has no DOM/WebAudio dependency, so it runs
 * identically in Node (tests), a Web Audio context, or inside a WebView.
 */
export function analyzeSamples(samples: Float32Array, sampleRate: number): Song {
  const onsets = detectOnsets(samples, sampleRate);
  const hits = classifyOnsets(onsets);
  const tempo = estimateTempo(hits.map((h) => h.time));
  const rawMeasures = quantizeToMeasures(hits, tempo);
  const measures = detectFills(rawMeasures);
  const sections = groupSections(measures);

  return {
    bpm: Math.round(tempo.bpm),
    timeSignature: [4, 4],
    sections,
  };
}
