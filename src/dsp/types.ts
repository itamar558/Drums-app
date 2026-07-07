export type DrumVoice = 'kick' | 'snare' | 'hihat' | 'crash';

export interface OnsetEvent {
  time: number;
  /** Peak of the rising-edge derivative; used for within-band peak-picking. */
  strength: number;
  /**
   * Peak envelope (loudness) amplitude shortly after the onset. Unlike
   * `strength`, this is comparable across bands with different decay
   * characteristics, so it's what cross-band "is this a real simultaneous
   * hit or just leakage" comparisons should use.
   */
  peakEnvelope: number;
}

export interface ClassifiedHit {
  time: number;
  voice: DrumVoice;
  velocity: number;
}

export interface TempoInfo {
  bpm: number;
  beatDuration: number;
  gridOffset: number;
}

export const SIXTEENTHS_PER_MEASURE = 16;

export interface GridSlot {
  slot: number;
  voices: DrumVoice[];
}

export interface Measure {
  index: number;
  slots: GridSlot[];
  patternKey: string;
  isFill: boolean;
  isRepeatOfPrevious: boolean;
}

export interface Section {
  label: string;
  startMeasure: number;
  measures: Measure[];
}

export interface Song {
  bpm: number;
  timeSignature: [number, number];
  sections: Section[];
}
