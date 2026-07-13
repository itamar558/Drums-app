import * as Tone from "tone";
import { bassNoteString, chordNoteStrings, type NoteName } from "../music/theory";
import type { Style } from "../music/styles";
import { audioBufferToWav } from "./wav";
import { DEFAULT_METER, scaleDurationSixteenths, scaleStep, type MeterOption } from "../music/meter";

interface PlayOptions {
  metronome: boolean;
  countIn: boolean;
  meter?: MeterOption;
  onChordChange?: (barIndex: number, label: string) => void;
}

export type RecordMode = "playback" | "click" | "both";

/** Drives Tone.js playback of a generated drumless backing track. */
export class DrumlessEngine {
  private bassSynth: Tone.MonoSynth | null = null;
  private chordSynth: Tone.PolySynth<Tone.Synth> | null = null;
  private clickSynth: Tone.MembraneSynth | null = null;
  private musicBus: Tone.Gain | null = null;
  private clickBus: Tone.Gain | null = null;
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

    // Music (bass + chords) and the metronome click live on separate buses so
    // each can be recorded independently, or summed together.
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

    const bassFilter = new Tone.Filter({ frequency: 900, type: "lowpass" }).connect(this.musicBus);
    this.bassSynth = new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.3 },
      filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3, baseFrequency: 200, octaves: 2 },
      volume: -6,
    }).connect(bassFilter);

    const chordReverb = new Tone.Reverb({ decay: 1.8, wet: 0.18 }).connect(this.musicBus);
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

  private buildEvents(style: Style, keyRoot: NoteName, meter: MeterOption) {
    const events: {
      time: string;
      type: "bass" | "chord" | "marker";
      notes: string[];
      duration: number;
      velocity: number;
      bar?: number;
      label?: string;
    }[] = [];

    const sixteenthSeconds = Tone.Time("16n").toSeconds();

    style.progression.forEach((chordSpec, barIdx) => {
      const nextChord = style.progression[(barIdx + 1) % style.progression.length];
      const bassSteps = style.bassPattern({ bar: barIdx, chord: chordSpec, nextChord });
      const compSteps = style.chordPattern({ bar: barIdx, chord: chordSpec, nextChord });

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
        this.bassSynth?.triggerAttackRelease(value.notes[0], value.duration, time, value.velocity);
      } else if (value.type === "chord") {
        this.chordSynth?.triggerAttackRelease(value.notes, value.duration, time, value.velocity);
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
