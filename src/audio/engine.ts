import * as Tone from "tone";
import { bassNoteString, chordNoteStrings, type NoteName } from "../music/theory";
import type { Style } from "../music/styles";
import { audioBufferToWav } from "./wav";

interface PlayOptions {
  metronome: boolean;
  countIn: boolean;
  onChordChange?: (barIndex: number, label: string) => void;
}

/** Drives Tone.js playback of a generated drumless backing track. */
export class DrumlessEngine {
  private bassSynth: Tone.MonoSynth | null = null;
  private chordSynth: Tone.PolySynth<Tone.Synth> | null = null;
  private clickSynth: Tone.MembraneSynth | null = null;
  private part: Tone.Part | null = null;
  private countInEventId: number | null = null;
  private metronomeLoop: Tone.Loop | null = null;
  private recorder: Tone.Recorder | null = null;
  private ready = false;
  private metronomeEnabled = false;

  async init() {
    if (this.ready) return;
    await Tone.start();

    const bassFilter = new Tone.Filter({ frequency: 900, type: "lowpass" }).toDestination();
    this.bassSynth = new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.3 },
      filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3, baseFrequency: 200, octaves: 2 },
      volume: -6,
    }).connect(bassFilter);

    const chordReverb = new Tone.Reverb({ decay: 1.8, wet: 0.18 }).toDestination();
    this.chordSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 3, spread: 20 },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.6 },
      volume: -16,
    }).connect(chordReverb);

    this.clickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.15, sustain: 0 },
      volume: -10,
    }).toDestination();

    this.recorder = new Tone.Recorder();
    Tone.getDestination().connect(this.recorder);

    this.ready = true;
  }

  private buildEvents(style: Style, keyRoot: NoteName) {
    const events: {
      time: string;
      type: "bass" | "chord" | "marker";
      notes: string[];
      duration: string;
      velocity: number;
      bar?: number;
      label?: string;
    }[] = [];

    style.progression.forEach((chordSpec, barIdx) => {
      const nextChord = style.progression[(barIdx + 1) % style.progression.length];
      const bassSteps = style.bassPattern({ bar: barIdx, chord: chordSpec, nextChord });
      const compSteps = style.chordPattern({ bar: barIdx, chord: chordSpec, nextChord });

      events.push({
        time: `${barIdx}:0:0`,
        type: "marker",
        notes: [],
        duration: "0",
        velocity: 0,
        bar: barIdx,
        label: chordSpec.label,
      });

      for (const s of bassSteps) {
        const beat = Math.floor(s.step / 4);
        const sixteenth = s.step % 4;
        events.push({
          time: `${barIdx}:${beat}:${sixteenth}`,
          type: "bass",
          notes: [bassNoteString(keyRoot, chordSpec, style.bassOctave, s.semitone)],
          duration: s.duration,
          velocity: s.velocity,
        });
      }

      for (const s of compSteps) {
        const beat = Math.floor(s.step / 4);
        const sixteenth = s.step % 4;
        events.push({
          time: `${barIdx}:${beat}:${sixteenth}`,
          type: "chord",
          notes: chordNoteStrings(keyRoot, chordSpec, style.chordOctave),
          duration: s.duration,
          velocity: s.velocity,
        });
      }
    });

    return events;
  }

  async play(style: Style, keyRoot: NoteName, tempo: number, options: PlayOptions) {
    await this.init();
    this.stop();

    Tone.getTransport().bpm.value = tempo;
    Tone.getTransport().swing = style.swing;
    Tone.getTransport().swingSubdivision = style.swingSubdivision as Tone.Unit.Subdivision;

    const events = this.buildEvents(style, keyRoot);
    const bars = style.progression.length;

    this.part = new Tone.Part((time, value) => {
      if (value.type === "bass") {
        this.bassSynth?.triggerAttackRelease(value.notes[0], value.duration, time, value.velocity);
      } else if (value.type === "chord") {
        this.chordSynth?.triggerAttackRelease(value.notes, value.duration, time, value.velocity);
      } else if (value.type === "marker" && options.onChordChange) {
        Tone.getDraw().schedule(() => {
          options.onChordChange?.(value.bar ?? 0, value.label ?? "");
        }, time);
      }
    }, events).start(options.countIn ? "1m" : 0);
    this.part.loop = true;
    this.part.loopStart = 0;
    this.part.loopEnd = `${bars}m`;

    this.metronomeEnabled = options.metronome;
    this.metronomeLoop = new Tone.Loop((time) => {
      if (this.metronomeEnabled) {
        this.clickSynth?.triggerAttackRelease("G3", "16n", time, 0.5);
      }
    }, "4n").start(options.countIn ? "1m" : 0);

    if (options.countIn) {
      let count = 0;
      this.countInEventId = Tone.getTransport().scheduleRepeat((time) => {
        this.clickSynth?.triggerAttackRelease(count % 4 === 0 ? "C5" : "G4", "16n", time, 0.9);
        count++;
        if (count >= 4 && this.countInEventId !== null) {
          Tone.getTransport().clear(this.countInEventId);
          this.countInEventId = null;
        }
      }, "4n", 0);
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
    this.metronomeLoop?.dispose();
    this.metronomeLoop = null;
    this.countInEventId = null;
  }

  async startRecording() {
    await this.init();
    this.recorder?.start();
  }

  async stopRecording(): Promise<Blob | null> {
    if (!this.recorder) return null;
    const raw = await this.recorder.stop();
    const arrayBuffer = await raw.arrayBuffer();
    const audioBuffer = await Tone.getContext().rawContext.decodeAudioData(arrayBuffer);
    return audioBufferToWav(audioBuffer);
  }

  get isRecording() {
    return this.recorder?.state === "started";
  }
}
