// Core music theory helpers: note naming, chord construction, MIDI conversion.

export const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

export type NoteName = (typeof NOTE_NAMES)[number];

export const KEYS: NoteName[] = [...NOTE_NAMES];

export type ChordQuality =
  | "maj"
  | "min"
  | "7"
  | "maj7"
  | "min7"
  | "dim"
  | "m7b5"
  | "sus4"
  | "6"
  | "m6"
  | "9"
  | "5";

// Interval structure (semitones from chord root) for each supported chord quality.
export const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  m7b5: [0, 3, 6, 10],
  sus4: [0, 5, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "9": [0, 4, 7, 10, 14],
  "5": [0, 7, 12],
};

/** A chord in a progression, defined relative to the key's tonic. */
export interface ChordSpec {
  /** Semitone offset from the key root (e.g. 0 = I, 5 = IV, 7 = V, 9 = vi). */
  rootOffset: number;
  quality: ChordQuality;
  /** Roman-numeral-ish label for display, e.g. "Imaj7" */
  label: string;
}

/** Convert a note name + octave to a MIDI note number (C4 = 60). */
export function noteToMidi(note: NoteName, octave: number): number {
  const idx = NOTE_NAMES.indexOf(note);
  return (octave + 1) * 12 + idx;
}

/** Convert a MIDI note number to a Tone.js-compatible note string, e.g. "C#3". */
export function midiToNoteString(midi: number): string {
  const idx = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[idx]}${octave}`;
}

/** Build the note strings (with octave) for a chord given a key root and spec. */
export function chordNoteStrings(
  keyRoot: NoteName,
  spec: ChordSpec,
  baseOctave: number,
): string[] {
  const rootMidi = noteToMidi(keyRoot, baseOctave) + spec.rootOffset;
  const intervals = CHORD_INTERVALS[spec.quality];
  return intervals.map((i) => midiToNoteString(rootMidi + i));
}

/** Return just the bass-register root note (or an alternate scale tone) for a chord. */
export function bassNoteString(
  keyRoot: NoteName,
  spec: ChordSpec,
  bassOctave: number,
  semitoneOffset = 0,
): string {
  const rootMidi = noteToMidi(keyRoot, bassOctave) + spec.rootOffset + semitoneOffset;
  return midiToNoteString(rootMidi);
}
