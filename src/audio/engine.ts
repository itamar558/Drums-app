import * as Tone from "tone";
import { bassNoteString, chordNoteStrings, type NoteName } from "../music/theory";
import type { BassTone, ChordInstrument, Style } from "../music/styles";
import { audioBufferToWav } from "./wav";
import { DEFAULT_METER, scaleDurationSixteenths, scaleStep, type MeterOption } from "../music/meter";

interface PlayOptions {
  metronome: boolean;
  countIn: boolean;
  meter?: MeterOption;
  onChordChange?: (barIndex: number, label: string) => void;
}

export type RecordMode = "playback" | "click" | "both";

type PluckTone = { attackNoise: number; dampening: number; resonance: number };

const BASS_TONE_PARAMS: Record<BassTone, PluckTone> = {
  // Bright pick attack, decent sustain: rock/funk/metal.
  picked: { attackNoise: 3, dampening: 3800, resonance: 0.88 },
  // Rounder and warmer, longer bloom: reggae/pop.
  fingered: { attackNoise: 0.8, dampening: 2200, resonance: 0.92 },
  // Woody, dark, short decay like a plucked double bass: jazz/blues/bossa.
  upright: { attackNoise: 0.3, dampening: 1300, resonance: 0.78 },
};

const GUITAR_PARAMS: Record<"guitar-clean" | "guitar-dist", PluckTone & { distortion: number; distortionWet: number }> = {
  "guitar-clean": { attackNoise: 1.6, dampening: 3200, resonance: 0.6, distortion: 0, distortionWet: 0 },
  "guitar-dist": { attackNoise: 1.1, dampening: 2600, resonance: 0.92, distortion: 0.75, distortionWet: 0.55 },
};

const GUITAR_VOICE_COUNT = 4;

/** Sets volume for velocity (PluckSynth ignores the velocity arg on triggerAttackRelease) then plucks the string. */
function pluck(synth: Tone.PluckSynth, note: string, time: number, duration: number, velocity: number) {
  synth.volume.setValueAtTime(Tone.gainToDb(Math.max(velocity, 0.05)), time);
  synth.triggerAttack(note, time);
  synth.triggerRelease(time + duration);
}

/** A small round-robin pool of plucked-string voices so chords (multiple simultaneous notes) can use Karplus-Strong synthesis. */
class GuitarVoices {
  private voices: Tone.PluckSynth[];
  private index = 0;

  constructor(tone: PluckTone, destination: Tone.ToneAudioNode) {
    this.voices = Array.from({ length: GUITAR_VOICE_COUNT }, () => new Tone.PluckSynth(tone).connect(destination));
  }

  trigger(notes: string[], time: number, duration: number, velocity: number) {
    for (const note of notes) {
      const voice = this.voices[this.index];
      this.index = (this.index + 1) % this.voices.length;
      pluck(voice, note, time, duration, velocity);
    }
  }

  dispose() {
    for (const voice of this.voices) voice.dispose();
  }
}

/** Drives Tone.js playback of a generated drumless backing track. */
export class DrumlessEngine {
  private musicBus: Tone.Gain | null = null;
  private clickBus: Tone.Gain | null = null;
  private clickSynth: Tone.MembraneSynth | null = null;

  private keysPiano: Tone.PolySynth<Tone.FMSynth> | null = null;
  private keysOrgan: Tone.PolySynth<Tone.Synth> | null = null;
  private hornsSynth: Tone.PolySynth<Tone.MonoSynth> | null = null;

  private bassSynth: Tone.PluckSynth | null = null;
  private guitarDistortion: Tone.Distortion | null = null;
  private guitarVoices: GuitarVoices | null = null;

  private part: Tone.Part | null = null;
  private metronomePart: Tone.Part | null = null;
  private playbackRecorder: Tone.Recorder | null = null;
  private clickRecorder: Tone.Recorder | null = null;
  private bothRecorder: Tone.Recorder | null = null;
  private activeRecordMode: RecordMode = "playback";
  private ready = false;
  private metronomeEnabled = false;

  async init() {
    if (this.ready) return;
    await Tone.start();

    // Music (bass + chords + horns) and the metronome click live on separate
    // buses so each can be recorded independently, or summed together.
    this.musicBus = new Tone.Gain().toDestination();
    this.clickBus = new Tone.Gain().toDestination();

    // Chrome's MediaRecorder truncates stretches of bit-for-bit digital
    // silence when capturing a MediaStreamAudioDestinationNode, which chops
    // up a click-only recording since the gaps between clicks are silent.
    // An inaudible noise floor keeps each bus's signal technically nonzero.
    const keepAlive = new Tone.Noise({ type: "white", volume: -95 });
    keepAlive.connect(this.musicBus);
    keepAlive.connect(this.clickBus);
    keepAlive.start();

    // Electric piano: FM synthesis gives the classic bell-like Rhodes tone.
    const keysPianoChorus = new Tone.Chorus({ frequency: 0.8, depth: 0.4, wet: 0.25 }).connect(this.musicBus);
    this.keysPiano = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 1,
      modulationIndex: 3,
      oscillator: { type: "sine" },
      modulation: { type: "sine" },
      envelope: { attack: 0.005, decay: 1.2, sustain: 0.15, release: 0.9 },
      modulationEnvelope: { attack: 0.005, decay: 0.5, sustain: 0.1, release: 0.5 },
      volume: -10,
    }).connect(keysPianoChorus);

    // Organ: stacked partials with a slow tremolo for the classic reggae "bubble".
    const organTremolo = new Tone.Tremolo({ frequency: 4.5, depth: 0.6 }).start().connect(this.musicBus);
    this.keysOrgan = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsine", count: 3, spread: 25 },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.2 },
      volume: -12,
    }).connect(organTremolo);

    // Brass stab: sawtooth through a filter envelope for that "wah" articulation.
    const hornsReverb = new Tone.Reverb({ decay: 1.2, wet: 0.15 }).connect(this.musicBus);
    this.hornsSynth = new Tone.PolySynth(Tone.MonoSynth, {
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.03, decay: 0.15, sustain: 0.3, release: 0.25 },
      filterEnvelope: { attack: 0.04, decay: 0.2, sustain: 0.3, release: 0.3, baseFrequency: 400, octaves: 3.2 },
      filter: { Q: 2, type: "lowpass" },
      volume: -13,
    }).connect(hornsReverb);

    this.clickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.15, sustain: 0 },
      volume: -10,
    }).connect(this.clickBus);

    this.playbackRecorder = new Tone.Recorder();
    this.clickRecorder = new Tone.Recorder();
    this.bothRecorder = new Tone.Recorder();
    this.musicBus.connect(this.playbackRecorder);
    this.musicBus.connect(this.bothRecorder);
    this.clickBus.connect(this.clickRecorder);
    this.clickBus.connect(this.bothRecorder);

    this.ready = true;
  }

  /** Bass and guitar are rebuilt per style since their plucked-string tone is tuned per style. */
  private setupPluckedInstruments(bassTone: BassTone, chordInstrument: ChordInstrument) {
    this.bassSynth?.dispose();
    this.guitarVoices?.dispose();
    this.guitarDistortion?.dispose();
    this.guitarVoices = null;
    this.guitarDistortion = null;

    if (!this.musicBus) return;

    this.bassSynth = new Tone.PluckSynth(BASS_TONE_PARAMS[bassTone]).connect(this.musicBus);

    if (chordInstrument === "guitar-clean" || chordInstrument === "guitar-dist") {
      const params = GUITAR_PARAMS[chordInstrument];
      this.guitarDistortion = new Tone.Distortion({ distortion: params.distortion, wet: params.distortionWet }).connect(
        this.musicBus,
      );
      this.guitarVoices = new GuitarVoices(params, this.guitarDistortion);
    }
  }

  private chordInstrumentFor(style: Style) {
    if (style.chordInstrument === "keys-piano") return this.keysPiano;
    if (style.chordInstrument === "keys-organ") return this.keysOrgan;
    return null;
  }

  private buildEvents(style: Style, keyRoot: NoteName, meter: MeterOption) {
    const events: {
      time: string;
      type: "bass" | "chord" | "horn" | "marker";
      notes: string[];
      duration: number;
      velocity: number;
      bar?: number;
      label?: string;
    }[] = [];

    const sixteenthSeconds = Tone.Time("16n").toSeconds();

    style.progression.forEach((chordSpec, barIdx) => {
      const nextChord = style.progression[(barIdx + 1) % style.progression.length];
      const ctx = { bar: barIdx, chord: chordSpec, nextChord };
      const bassSteps = style.bassPattern(ctx);
      const compSteps = style.chordPattern(ctx);
      const hornSteps = style.hornPattern?.(ctx) ?? [];

      events.push({
        time: `${barIdx}:0:0`,
        type: "marker",
        notes: [],
        duration: 0,
        velocity: 0,
        bar: barIdx,
        label: chordSpec.label,
      });

      for (const s of bassSteps) {
        const step = scaleStep(s.step, meter.stepsPerBar);
        const duration = scaleDurationSixteenths(s.duration, meter.stepsPerBar) * sixteenthSeconds;
        events.push({
          time: `${barIdx}:0:${step}`,
          type: "bass",
          notes: [bassNoteString(keyRoot, chordSpec, style.bassOctave, s.semitone)],
          duration,
          velocity: s.velocity,
        });
      }

      for (const s of compSteps) {
        const step = scaleStep(s.step, meter.stepsPerBar);
        const duration = scaleDurationSixteenths(s.duration, meter.stepsPerBar) * sixteenthSeconds;
        events.push({
          time: `${barIdx}:0:${step}`,
          type: "chord",
          notes: chordNoteStrings(keyRoot, chordSpec, style.chordOctave),
          duration,
          velocity: s.velocity,
        });
      }

      for (const s of hornSteps) {
        const step = scaleStep(s.step, meter.stepsPerBar);
        const duration = scaleDurationSixteenths(s.duration, meter.stepsPerBar) * sixteenthSeconds;
        events.push({
          time: `${barIdx}:0:${step}`,
          type: "horn",
          notes: chordNoteStrings(keyRoot, chordSpec, style.hornOctave),
          duration,
          velocity: s.velocity,
        });
      }
    });

    return events;
  }

  private buildMetronomeEvents(meter: MeterOption) {
    const events: { time: string; accent: boolean }[] = [];
    let offset = 0;
    for (const group of meter.pulseGroups) {
      events.push({ time: `0:0:${offset}`, accent: offset === 0 });
      offset += group;
    }
    return events;
  }

  async play(style: Style, keyRoot: NoteName, tempo: number, options: PlayOptions) {
    await this.init();
    this.stop();

    this.setupPluckedInstruments(style.bassTone, style.chordInstrument);
    const chordInstrument = this.chordInstrumentFor(style);

    const meter = options.meter ?? DEFAULT_METER;

    Tone.getTransport().bpm.value = tempo;
    Tone.getTransport().timeSignature = meter.transportTimeSignature;
    Tone.getTransport().swing = style.swing;
    Tone.getTransport().swingSubdivision = style.swingSubdivision as Tone.Unit.Subdivision;

    const events = this.buildEvents(style, keyRoot, meter);
    const bars = style.progression.length;
    const startTime = options.countIn ? "1m" : 0;

    this.part = new Tone.Part((time, value) => {
      if (value.type === "bass") {
        if (this.bassSynth) pluck(this.bassSynth, value.notes[0], time, value.duration, value.velocity);
      } else if (value.type === "chord") {
        if (this.guitarVoices) {
          this.guitarVoices.trigger(value.notes, time, value.duration, value.velocity);
        } else {
          chordInstrument?.triggerAttackRelease(value.notes, value.duration, time, value.velocity);
        }
      } else if (value.type === "horn") {
        this.hornsSynth?.triggerAttackRelease(value.notes, value.duration, time, value.velocity);
      } else if (value.type === "marker" && options.onChordChange) {
        Tone.getDraw().schedule(() => {
          options.onChordChange?.(value.bar ?? 0, value.label ?? "");
        }, time);
      }
    }, events).start(startTime);
    this.part.loop = true;
    this.part.loopStart = 0;
    this.part.loopEnd = `${bars}m`;

    this.metronomeEnabled = options.metronome;
    this.metronomePart = new Tone.Part((time, value) => {
      if (this.metronomeEnabled) {
        this.clickSynth?.triggerAttackRelease(value.accent ? "C5" : "G3", "16n", time, value.accent ? 0.9 : 0.5);
      }
    }, this.buildMetronomeEvents(meter)).start(startTime);
    this.metronomePart.loop = true;
    this.metronomePart.loopStart = 0;
    this.metronomePart.loopEnd = "1m";

    if (options.countIn) {
      for (const ev of this.buildMetronomeEvents(meter)) {
        Tone.getTransport().scheduleOnce((time) => {
          this.clickSynth?.triggerAttackRelease(ev.accent ? "C5" : "G4", "16n", time, 0.9);
        }, ev.time);
      }
    }

    Tone.getTransport().start();
  }

  setMetronome(enabled: boolean) {
    this.metronomeEnabled = enabled;
  }

  stop() {
    const transport = Tone.getTransport();
    transport.stop();
    transport.position = 0;
    transport.cancel();
    this.part?.dispose();
    this.part = null;
    this.metronomePart?.dispose();
    this.metronomePart = null;
  }

  private recorderFor(mode: RecordMode): Tone.Recorder | null {
    if (mode === "playback") return this.playbackRecorder;
    if (mode === "click") return this.clickRecorder;
    return this.bothRecorder;
  }

  async startRecording(mode: RecordMode) {
    await this.init();
    this.activeRecordMode = mode;
    this.recorderFor(mode)?.start();
  }

  async stopRecording(): Promise<Blob | null> {
    const recorder = this.recorderFor(this.activeRecordMode);
    if (!recorder) return null;
    const raw = await recorder.stop();
    const arrayBuffer = await raw.arrayBuffer();
    const audioBuffer = await Tone.getContext().rawContext.decodeAudioData(arrayBuffer);
    return audioBufferToWav(audioBuffer);
  }

  get isRecording() {
    return this.recorderFor(this.activeRecordMode)?.state === "started";
  }
}
