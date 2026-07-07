import { median } from './util';
import type { Measure, Section } from './types';

const FILL_HISTORY_WINDOW = 8;
const FILL_RATIO_THRESHOLD = 1.8;
const FILL_MIN_MARGIN = 3;
const MAX_SECTION_PATTERNS = 2;

function density(measure: Measure): number {
  return measure.slots.filter((s) => s.voices.length > 0).length;
}

/**
 * Flags measures whose note density spikes far above the recent local
 * baseline as drum fills. Per the product decision, fills are not
 * transcribed note-for-note -- they're just marked, and the renderer shows
 * "Drum Fill" instead of notation for these measures.
 */
export function detectFills(measures: Measure[]): Measure[] {
  if (measures.length === 0) return [];
  const densities = measures.map(density);
  const globalMedian = median(densities);

  return measures.map((m, i) => {
    const historySlice = densities.slice(Math.max(0, i - FILL_HISTORY_WINDOW), i);
    const baseline = historySlice.length >= 3 ? median(historySlice) : globalMedian;
    const d = densities[i];
    const isFill = baseline > 0 && d > baseline * FILL_RATIO_THRESHOLD && d - baseline >= FILL_MIN_MARGIN;
    return { ...m, isFill };
  });
}

/**
 * Groups measures into sections purely from repeated-pattern structure
 * (there's no lyrical/semantic info available to know "this is the
 * chorus") -- a new section starts once the groove drifts away from the
 * last 1-2 distinct bar patterns established in the current section.
 * Sections whose pattern set recurs later reuse the same letter, with an
 * occurrence count, similar to how "Verse 2" reuses "Verse".
 */
export function groupSections(measures: Measure[]): Section[] {
  if (measures.length === 0) return [];

  type RawSection = { measures: Measure[]; patterns: string[] };
  const raw: RawSection[] = [];

  for (const m of measures) {
    const current = raw[raw.length - 1];
    if (!current) {
      raw.push({ measures: [m], patterns: m.isFill || m.patternKey === '' ? [] : [m.patternKey] });
      continue;
    }
    if (m.isFill || m.patternKey === '') {
      current.measures.push(m);
      continue;
    }
    if (current.patterns.includes(m.patternKey) || current.patterns.length < MAX_SECTION_PATTERNS) {
      current.measures.push(m);
      if (!current.patterns.includes(m.patternKey)) current.patterns.push(m.patternKey);
    } else {
      raw.push({ measures: [m], patterns: [m.patternKey] });
    }
  }

  const letterForSignature = new Map<string, string>();
  const occurrencesForSignature = new Map<string, number>();
  let nextLetterCode = 'A'.charCodeAt(0);

  return raw.map((section): Section => {
    const signature = [...section.patterns].sort().join(';');
    let letter = letterForSignature.get(signature);
    if (letter === undefined) {
      letter = signature === '' ? '-' : String.fromCharCode(nextLetterCode++);
      letterForSignature.set(signature, letter);
    }
    const occurrence = (occurrencesForSignature.get(signature) ?? 0) + 1;
    occurrencesForSignature.set(signature, occurrence);

    const label =
      signature === ''
        ? 'Section'
        : occurrence === 1
          ? `Section ${letter}`
          : `Section ${letter} (${occurrence})`;

    return { label, startMeasure: section.measures[0].index, measures: section.measures };
  });
}
