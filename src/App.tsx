import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { CLICK_SOUNDS, DrumlessEngine, type ClickSound, type RecordMode } from "./audio/engine";
import { KEYS, type NoteName } from "./music/theory";
import { listStyles } from "./music/styles";
import { DEFAULT_METER, METERS, findMeter } from "./music/meter";
import { exportAudioFile } from "./native/exportFile";

const STYLES = listStyles();

const RECORD_MODES: { id: RecordMode; label: string; suffix: string }[] = [
  { id: "playback", label: "Playback only", suffix: "playback" },
  { id: "click", label: "Click only", suffix: "click" },
  { id: "both", label: "Click + Playback", suffix: "click+playback" },
];

function App() {
  const engineRef = useRef<DrumlessEngine | null>(null);
  if (!engineRef.current) engineRef.current = new DrumlessEngine();

  const [styleId, setStyleId] = useState(STYLES[0].id);
  const style = useMemo(() => STYLES.find((s) => s.id === styleId)!, [styleId]);

  const [keyRoot, setKeyRoot] = useState<NoteName>("C");
  const [meterId, setMeterId] = useState(DEFAULT_METER.id);
  const meter = useMemo(() => findMeter(meterId), [meterId]);
  const [tempo, setTempo] = useState(style.defaultTempo);
  const [metronome, setMetronome] = useState(false);
  const [clickSound, setClickSound] = useState<ClickSound>("click");
  const [countIn, setCountIn] = useState(true);
  const [recordMode, setRecordMode] = useState<RecordMode>("playback");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentBar, setCurrentBar] = useState<number | null>(null);
  const [currentLabel, setCurrentLabel] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTempo(style.defaultTempo);
  }, [style]);

  useEffect(() => {
    if (isPlaying) {
      stopPlayback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId, keyRoot, meterId]);

  useEffect(() => {
    engineRef.current?.setMetronome(metronome);
  }, [metronome]);

  useEffect(() => {
    engineRef.current?.setClickSound(clickSound);
  }, [clickSound]);

  useEffect(() => {
    const engine = engineRef.current;
    return () => {
      engine?.stop();
    };
  }, []);

  async function startPlayback() {
    setBusy(true);
    try {
      await engineRef.current!.play(style, keyRoot, tempo, {
        metronome,
        countIn,
        meter,
        onChordChange: (bar, label) => {
          setCurrentBar(bar);
          setCurrentLabel(label);
        },
      });
      setIsPlaying(true);
    } finally {
      setBusy(false);
    }
  }

  function stopPlayback() {
    engineRef.current?.stop();
    setIsPlaying(false);
    setCurrentBar(null);
    setCurrentLabel("");
    if (isRecording) {
      void finishRecording();
    }
  }

  function selectRecordMode(mode: RecordMode) {
    setRecordMode(mode);
    if (mode !== "playback") setMetronome(true);
  }

  async function toggleRecording() {
    if (!isRecording) {
      await engineRef.current!.startRecording(recordMode);
      setIsRecording(true);
    } else {
      await finishRecording();
    }
  }

  async function finishRecording() {
    const blob = await engineRef.current!.stopRecording();
    setIsRecording(false);
    if (!blob) return;
    const suffix = RECORD_MODES.find((m) => m.id === recordMode)!.suffix;
    const filename = `${style.name.replace(/\s+/g, "-").toLowerCase()}-${keyRoot}-${tempo}bpm-${suffix}.wav`;
    await exportAudioFile(blob, filename);
  }

  return (
    <div className="app">
      <header className="hero">
        <h1>Drumless</h1>
        <p className="tagline">Generate backing tracks in any style. Grab your sticks and play along.</p>
      </header>

      <main className="layout">
        <section className="panel">
          <h2>Style</h2>
          <div className="style-grid">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`style-card ${s.id === styleId ? "active" : ""}`}
                onClick={() => setStyleId(s.id)}
              >
                <span className="style-name">{s.name}</span>
                <span className="style-desc">{s.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel controls">
          <h2>Settings</h2>

          <label className="control-row">
            <span>Key</span>
            <select value={keyRoot} onChange={(e) => setKeyRoot(e.target.value as NoteName)}>
              {KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label className="control-row">
            <span>Meter</span>
            <select value={meterId} onChange={(e) => setMeterId(e.target.value)}>
              {METERS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="control-row">
            <span>Tempo</span>
            <input
              type="range"
              min={style.tempoRange[0]}
              max={style.tempoRange[1]}
              value={tempo}
              onChange={(e) => setTempo(Number(e.target.value))}
            />
            <span className="tempo-value">{tempo} BPM</span>
          </label>

          <label className="control-row checkbox">
            <input type="checkbox" checked={metronome} onChange={(e) => setMetronome(e.target.checked)} />
            <span>Metronome click</span>
          </label>

          <label className="control-row">
            <span>Click</span>
            <select value={clickSound} onChange={(e) => setClickSound(e.target.value as ClickSound)}>
              {CLICK_SOUNDS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="control-row checkbox">
            <input type="checkbox" checked={countIn} onChange={(e) => setCountIn(e.target.checked)} />
            <span>1-bar count-in</span>
          </label>

          <div className="loop-info">
            {style.progression.length}-bar loop in {meter.label} &middot;{" "}
            {style.progression.map((c) => c.label).join(" – ")}
          </div>
        </section>

        <section className="panel transport">
          <h2>Transport</h2>

          <div className="now-playing" aria-live="polite">
            {isPlaying ? (
              <>
                <span className="pulse" />
                Bar {currentBar !== null ? currentBar + 1 : "–"} / {style.progression.length} &middot;{" "}
                {currentLabel || "…"}
              </>
            ) : (
              <span className="idle">Ready</span>
            )}
          </div>

          <div className="buttons">
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => (isPlaying ? stopPlayback() : startPlayback())}
            >
              {isPlaying ? "Stop" : "Play"}
            </button>
            <button
              type="button"
              className={`record ${isRecording ? "active" : ""}`}
              disabled={!isPlaying}
              onClick={toggleRecording}
            >
              {isRecording ? "Stop & Download" : "Record"}
            </button>
          </div>

          <label className="control-row record-mode">
            <span>Export</span>
            <select
              value={recordMode}
              disabled={isRecording}
              onChange={(e) => selectRecordMode(e.target.value as RecordMode)}
            >
              {RECORD_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">
            The click lives on its own channel, separate from the backing track. Export the click alone as a
            reference while you record real drums, the playback alone, or both mixed together.
          </p>
        </section>
      </main>

      <footer className="footer">
        <p>All sounds are synthesized live in your browser — nothing to upload, nothing to download but your take.</p>
      </footer>
    </div>
  );
}

export default App;
