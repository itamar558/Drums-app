export type DrumVoice = 'kick' | 'snare' | 'hihat' | 'crash';

export interface BandEnergy {
  low: number;
  mid: number;
  high: number;
}

export interface OnsetEvent {
  time: number;
  strength: number;
  bands: BandEnergy;
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
