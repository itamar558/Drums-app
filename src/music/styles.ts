import type { ChordQuality, ChordSpec, NoteName } from "./theory";

export interface BassStep {
  /** 16th-note position within the bar, 0-15. */
  step: number;
  /** Semitone offset added on top of the chord's root note. */
  semitone: number;
  duration: string;
  velocity: number;
}

export interface CompStep {
  step: number;
  duration: string;
  velocity: number;
}

interface PatternCtx {
  bar: number;
  chord: ChordSpec;
  nextChord: ChordSpec;
}

/** Which synthesized instrument comps the chord pattern. */
export type ChordInstrument = "guitar-clean" | "guitar-dist" | "keys-piano" | "keys-organ";

/** Plucked-string voicing used for the bass line. */
export type BassTone = "picked" | "fingered" | "upright";

export interface Style {
  id: string;
  name: string;
  description: string;
  defaultTempo: number;
  tempoRange: [number, number];
  swing: number;
  swingSubdivision: string;
  bassOctave: number;
  chordOctave: number;
  chordInstrument: ChordInstrument;
  bassTone: BassTone;
  hornOctave: number;
  progression: ChordSpec[];
  bassPattern: (ctx: PatternCtx) => BassStep[];
  chordPattern: (ctx: PatternCtx) => CompStep[];
  /** Optional brass stab layer, only set for horn-driven styles. */
  hornPattern?: (ctx: PatternCtx) => CompStep[];
}

function chord(rootOffset: number, quality: ChordQuality, label: string): ChordSpec {
  return { rootOffset, quality, label };
}

// Scale-degree semitone offsets in a major key, for readable progression building.
const I = 0, ii = 2, IV = 5, V = 7, vi = 9, bVI = 8, bVII = 10;

const STYLES: Style[] = [
  {
    id: "rock",
    name: "Rock",
    description: "Driving I-IV-V-IV in straight eighths.",
    defaultTempo: 120,
    tempoRange: [90, 160],
    swing: 0,
    swingSubdivision: "8n",
    bassOctave: 2,
    chordOctave: 3,
    chordInstrument: "guitar-dist",
    bassTone: "picked",
    hornOctave: 4,
    progression: [chord(I, "maj", "I"), chord(IV, "maj", "IV"), chord(V, "maj", "V"), chord(IV, "maj", "IV")],
    bassPattern: () => [
      { step: 0, semitone: 0, duration: "8n", velocity: 0.9 },
      { step: 2, semitone: 0, duration: "8n", velocity: 0.7 },
      { step: 4, semitone: 7, duration: "8n", velocity: 0.8 },
      { step: 6, semitone: 0, duration: "8n", velocity: 0.7 },
      { step: 8, semitone: 0, duration: "8n", velocity: 0.9 },
      { step: 10, semitone: 0, duration: "8n", velocity: 0.7 },
      { step: 12, semitone: 7, duration: "8n", velocity: 0.8 },
      { step: 14, semitone: 0, duration: "8n", velocity: 0.7 },
    ],
    chordPattern: () => [
      { step: 0, duration: "2n", velocity: 0.6 },
      { step: 8, duration: "2n", velocity: 0.6 },
    ],
  },
  {
    id: "funk",
    name: "Funk",
    description: "Syncopated one-chord dominant vamp.",
    defaultTempo: 102,
    tempoRange: [85, 116],
    swing: 0.1,
    swingSubdivision: "16n",
    bassOctave: 2,
    chordOctave: 3,
    chordInstrument: "guitar-clean",
    bassTone: "picked",
    hornOctave: 4,
    progression: [chord(I, "7", "I7"), chord(I, "7", "I7"), chord(IV, "7", "IV7"), chord(I, "7", "I7")],
    bassPattern: () => [
      { step: 0, semitone: 0, duration: "16n", velocity: 1.0 },
      { step: 3, semitone: 0, duration: "16n", velocity: 0.6 },
      { step: 6, semitone: 0, duration: "16n", velocity: 0.8 },
      { step: 7, semitone: 3, duration: "16n", velocity: 0.5 },
      { step: 10, semitone: 0, duration: "16n", velocity: 0.9 },
      { step: 14, semitone: 10, duration: "16n", velocity: 0.6 },
    ],
    chordPattern: () => [
      { step: 2, duration: "16n", velocity: 0.55 },
      { step: 6, duration: "16n", velocity: 0.5 },
      { step: 9, duration: "16n", velocity: 0.65 },
      { step: 14, duration: "16n", velocity: 0.5 },
    ],
    hornPattern: () => [
      { step: 0, duration: "16n", velocity: 0.85 },
      { step: 10, duration: "16n", velocity: 0.7 },
    ],
  },
  {
    id: "blues",
    name: "Blues Shuffle",
    description: "Classic 12-bar walking blues with a shuffle feel.",
    defaultTempo: 96,
    tempoRange: [70, 140],
    swing: 0.55,
    swingSubdivision: "8n",
    bassOctave: 2,
    chordOctave: 3,
    chordInstrument: "guitar-clean",
    bassTone: "fingered",
    hornOctave: 4,
    progression: [
      chord(I, "7", "I7"), chord(I, "7", "I7"), chord(I, "7", "I7"), chord(I, "7", "I7"),
      chord(IV, "7", "IV7"), chord(IV, "7", "IV7"), chord(I, "7", "I7"), chord(I, "7", "I7"),
      chord(V, "7", "V7"), chord(IV, "7", "IV7"), chord(I, "7", "I7"), chord(V, "7", "V7"),
    ],
    bassPattern: ({ nextChord, chord: c }) => {
      const approach = nextChord.rootOffset - c.rootOffset - 1;
      return [
        { step: 0, semitone: 0, duration: "8n", velocity: 0.9 },
        { step: 4, semitone: 4, duration: "8n", velocity: 0.7 },
        { step: 8, semitone: 7, duration: "8n", velocity: 0.8 },
        { step: 12, semitone: approach, duration: "8n", velocity: 0.7 },
      ];
    },
    chordPattern: () => [
      { step: 4, duration: "8n", velocity: 0.4 },
      { step: 12, duration: "8n", velocity: 0.4 },
    ],
    hornPattern: (ctx) =>
      ctx.bar % 4 === 3 ? [{ step: 8, duration: "8n", velocity: 0.8 }] : [],
  },
  {
    id: "jazz",
    name: "Jazz Swing",
    description: "ii-V-I turnaround, walking bass, swung eighths.",
    defaultTempo: 132,
    tempoRange: [100, 200],
    swing: 0.62,
    swingSubdivision: "8n",
    bassOctave: 2,
    chordOctave: 4,
    chordInstrument: "keys-piano",
    bassTone: "upright",
    hornOctave: 5,
    progression: [chord(ii, "min7", "ii7"), chord(V, "7", "V7"), chord(I, "maj7", "Imaj7"), chord(vi, "min7", "vi7")],
    bassPattern: ({ nextChord, chord: c }) => {
      const approach = nextChord.rootOffset - c.rootOffset - 1;
      return [
        { step: 0, semitone: 0, duration: "8n", velocity: 0.85 },
        { step: 4, semitone: 3, duration: "8n", velocity: 0.65 },
        { step: 8, semitone: 7, duration: "8n", velocity: 0.75 },
        { step: 12, semitone: approach, duration: "8n", velocity: 0.65 },
      ];
    },
    chordPattern: () => [
      { step: 2, duration: "16n", velocity: 0.4 },
      { step: 10, duration: "16n", velocity: 0.45 },
    ],
  },
  {
    id: "reggae",
    name: "Reggae One-Drop",
    description: "Off-beat skank with bass emphasis on beat three.",
    defaultTempo: 78,
    tempoRange: [65, 95],
    swing: 0,
    swingSubdivision: "8n",
    bassOctave: 2,
    chordOctave: 3,
    chordInstrument: "keys-organ",
    bassTone: "fingered",
    hornOctave: 4,
    progression: [chord(I, "maj", "I"), chord(IV, "maj", "IV"), chord(V, "maj", "V"), chord(I, "maj", "I")],
    bassPattern: () => [
      { step: 8, semitone: 0, duration: "8n", velocity: 0.9 },
      { step: 10, semitone: 7, duration: "16n", velocity: 0.6 },
    ],
    chordPattern: () => [
      { step: 2, duration: "16n", velocity: 0.7 },
      { step: 6, duration: "16n", velocity: 0.7 },
      { step: 10, duration: "16n", velocity: 0.7 },
      { step: 14, duration: "16n", velocity: 0.7 },
    ],
  },
  {
    id: "bossa",
    name: "Bossa Nova",
    description: "Syncopated Brazilian bass and comping.",
    defaultTempo: 122,
    tempoRange: [100, 145],
    swing: 0,
    swingSubdivision: "16n",
    bassOctave: 2,
    chordOctave: 4,
    chordInstrument: "guitar-clean",
    bassTone: "upright",
    hornOctave: 5,
    progression: [chord(I, "maj7", "Imaj7"), chord(ii, "min7", "ii7"), chord(V, "7", "V7"), chord(I, "maj7", "Imaj7")],
    bassPattern: () => [
      { step: 0, semitone: 0, duration: "8n", velocity: 0.8 },
      { step: 6, semitone: 7, duration: "8n", velocity: 0.6 },
      { step: 8, semitone: 0, duration: "8n", velocity: 0.75 },
      { step: 14, semitone: 7, duration: "8n", velocity: 0.55 },
    ],
    chordPattern: () => [
      { step: 0, duration: "8n", velocity: 0.5 },
      { step: 3, duration: "16n", velocity: 0.45 },
      { step: 7, duration: "8n", velocity: 0.5 },
      { step: 10, duration: "16n", velocity: 0.4 },
      { step: 12, duration: "8n", velocity: 0.45 },
    ],
  },
  {
    id: "metal",
    name: "Metal",
    description: "Fast palm-muted power-chord riff in a minor key.",
    defaultTempo: 168,
    tempoRange: [140, 220],
    swing: 0,
    swingSubdivision: "16n",
    bassOctave: 1,
    chordOctave: 2,
    chordInstrument: "guitar-dist",
    bassTone: "picked",
    hornOctave: 3,
    progression: [chord(I, "5", "i5"), chord(bVI, "5", "bVI5"), chord(bVII, "5", "bVII5"), chord(I, "5", "i5")],
    bassPattern: () => [
      { step: 0, semitone: 0, duration: "16n", velocity: 1.0 },
      { step: 2, semitone: 0, duration: "16n", velocity: 0.7 },
      { step: 4, semitone: 0, duration: "16n", velocity: 0.9 },
      { step: 6, semitone: 0, duration: "16n", velocity: 0.7 },
      { step: 8, semitone: 0, duration: "16n", velocity: 1.0 },
      { step: 10, semitone: 0, duration: "16n", velocity: 0.7 },
      { step: 12, semitone: 3, duration: "16n", velocity: 0.85 },
      { step: 14, semitone: 0, duration: "16n", velocity: 0.7 },
    ],
    chordPattern: ({ chord: _c }) =>
      [0, 2, 4, 6, 8, 10, 12, 14].map((step) => ({ step, duration: "16n", velocity: step === 0 || step === 8 ? 0.9 : 0.6 })),
  },
  {
    id: "pop",
    name: "Pop",
    description: "Friendly I-V-vi-IV with steady quarter-note bass.",
    defaultTempo: 112,
    tempoRange: [90, 128],
    swing: 0,
    swingSubdivision: "8n",
    bassOctave: 2,
    chordOctave: 4,
    chordInstrument: "keys-piano",
    bassTone: "fingered",
    hornOctave: 5,
    progression: [chord(I, "maj", "I"), chord(V, "maj", "V"), chord(vi, "min", "vi"), chord(IV, "maj", "IV")],
    bassPattern: () => [
      { step: 0, semitone: 0, duration: "4n", velocity: 0.85 },
      { step: 4, semitone: 0, duration: "4n", velocity: 0.7 },
      { step: 8, semitone: 0, duration: "4n", velocity: 0.8 },
      { step: 12, semitone: 0, duration: "4n", velocity: 0.7 },
    ],
    chordPattern: () => [{ step: 0, duration: "1n", velocity: 0.5 }],
  },
];

export const STYLE_MAP: Record<string, Style> = Object.fromEntries(STYLES.map((s) => [s.id, s]));

export function listStyles(): Style[] {
  return STYLES;
}

export type { NoteName };
