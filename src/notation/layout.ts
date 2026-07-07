import type { DrumVoice, Measure, Song } from '../dsp/types';
import {
  BEATS_PER_MEASURE,
  FIRST_SYSTEM_TOP_MARGIN,
  MEASURE_SLOT_PADDING_END,
  MEASURE_SLOT_PADDING_START,
  MEASURE_WIDTH,
  MEASURES_PER_SYSTEM,
  SIXTEENTHS_PER_BEAT,
  STEM_LENGTH,
  SYSTEM_LEFT_MARGIN,
  SYSTEM_VERTICAL_GAP,
  VOICE_USES_X_NOTEHEAD,
  VOICE_Y,
} from './constants';

export interface NoteGlyph {
  x: number;
  y: number;
  voice: DrumVoice;
  isX: boolean;
}

export interface StemGlyph {
  x: number;
  topY: number;
  bottomY: number;
}

export interface BeamGlyph {
  fromX: number;
  toX: number;
  y: number;
  doubled: boolean;
}

export interface MeasureLayout {
  x: number;
  width: number;
  measureNumber: number;
  isFill: boolean;
  isRepeat: boolean;
  notes: NoteGlyph[];
  stems: StemGlyph[];
  beams: BeamGlyph[];
}

export interface SystemLayout {
  y: number;
  sectionLabel?: string;
  measures: MeasureLayout[];
  isFirstSystem: boolean;
}

export interface SheetLayout {
  systems: SystemLayout[];
  totalWidth: number;
  totalHeight: number;
  bpm: number;
  timeSignature: [number, number];
}

function slotX(measureContentX: number, slotWidth: number, slot: number): number {
  return measureContentX + slot * slotWidth;
}

function buildMeasureLayout(measure: Measure, x: number, measureNumber: number): MeasureLayout {
  const contentWidth = MEASURE_WIDTH - MEASURE_SLOT_PADDING_START - MEASURE_SLOT_PADDING_END;
  const slotWidth = contentWidth / 16;
  const contentX = x + MEASURE_SLOT_PADDING_START;

  const base: MeasureLayout = {
    x,
    width: MEASURE_WIDTH,
    measureNumber,
    isFill: measure.isFill,
    isRepeat: measure.isRepeatOfPrevious,
    notes: [],
    stems: [],
    beams: [],
  };

  if (measure.isFill || measure.isRepeatOfPrevious) {
    return base;
  }

  const activeSlots = measure.slots.filter((s) => s.voices.length > 0);
  const notes: NoteGlyph[] = [];
  const stems: StemGlyph[] = [];
  for (const slot of activeSlots) {
    const px = slotX(contentX, slotWidth, slot.slot);
    for (const voice of slot.voices) {
      notes.push({ x: px, y: VOICE_Y[voice], voice, isX: VOICE_USES_X_NOTEHEAD[voice] });
    }
    const ys = slot.voices.map((v) => VOICE_Y[v]);
    stems.push({ x: px, topY: Math.min(...ys), bottomY: Math.max(...ys) });
  }

  const beams: BeamGlyph[] = [];
  for (let beat = 0; beat < BEATS_PER_MEASURE; beat++) {
    const beatSlots = activeSlots.filter(
      (s) => Math.floor(s.slot / SIXTEENTHS_PER_BEAT) === beat,
    );
    if (beatSlots.length < 2) continue;

    const beatStems = stems.filter((st) =>
      beatSlots.some((s) => slotX(contentX, slotWidth, s.slot) === st.x),
    );
    const beamY = Math.min(...beatStems.map((st) => st.topY)) - STEM_LENGTH;
    for (const st of beatStems) st.topY = beamY;

    const doubled = beatSlots.some((s, i) => i > 0 && s.slot - beatSlots[i - 1].slot === 1);
    beams.push({
      fromX: slotX(contentX, slotWidth, beatSlots[0].slot),
      toX: slotX(contentX, slotWidth, beatSlots[beatSlots.length - 1].slot),
      y: beamY,
      doubled,
    });
  }

  // Isolated (unbeamed) notes still need a stem reaching a standard height.
  for (const stem of stems) {
    if (isWithinAnyBeam(beams, stem.x)) continue;
    stem.topY = stem.topY - STEM_LENGTH;
  }

  base.notes = notes;
  base.stems = stems;
  base.beams = beams;
  return base;
}

function isWithinAnyBeam(beams: BeamGlyph[], x: number): boolean {
  return beams.some((b) => x >= b.fromX - 0.01 && x <= b.toX + 0.01);
}

/** Pure layout computation for a Song -- no React/SVG dependency, so it's
 * independently testable. The component that renders this scales the
 * whole result to fit the device width via SVG viewBox. */
export function buildSheetLayout(song: Song): SheetLayout {
  const allMeasures = song.sections.flatMap((section) =>
    section.measures.map((measure) => ({ measure, sectionLabel: section.label, isFirstOfSection: measure.index === section.startMeasure })),
  );

  const systems: SystemLayout[] = [];
  for (let i = 0; i < allMeasures.length; i += MEASURES_PER_SYSTEM) {
    const chunk = allMeasures.slice(i, i + MEASURES_PER_SYSTEM);
    const isFirstSystem = systems.length === 0;
    const y = isFirstSystem
      ? FIRST_SYSTEM_TOP_MARGIN
      : FIRST_SYSTEM_TOP_MARGIN + systems.length * SYSTEM_VERTICAL_GAP;

    const measures: MeasureLayout[] = chunk.map((entry, idx) =>
      buildMeasureLayout(entry.measure, SYSTEM_LEFT_MARGIN + idx * MEASURE_WIDTH, entry.measure.index + 1),
    );

    const sectionLabel = chunk[0]?.isFirstOfSection ? chunk[0].sectionLabel : undefined;

    systems.push({ y, sectionLabel, measures, isFirstSystem });
  }

  const totalWidth = SYSTEM_LEFT_MARGIN + MEASURES_PER_SYSTEM * MEASURE_WIDTH + SYSTEM_LEFT_MARGIN;
  const totalHeight =
    systems.length === 0
      ? FIRST_SYSTEM_TOP_MARGIN + SYSTEM_VERTICAL_GAP
      : FIRST_SYSTEM_TOP_MARGIN + systems.length * SYSTEM_VERTICAL_GAP + SYSTEM_VERTICAL_GAP / 2;

  return { systems, totalWidth, totalHeight, bpm: song.bpm, timeSignature: song.timeSignature };
}
