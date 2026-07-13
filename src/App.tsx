import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { DrumlessEngine } from "./audio/engine";
import { KEYS, type NoteName } from "./music/theory";
import { listStyles } from "./music/styles";

const STYLES = listStyles();

function App() {
  const engineRef = useRef<DrumlessEngine | null>(null);
  if (!engineRef.current) engineRef.current = new DrumlessEngine();

  const [styleId, setStyleId] = useState(STYLES[0].id);
  const style = useMemo(() => STYLES.find((s) => s.id === styleId)!, [styleId]);

  const [keyRoot, setKeyRoot] = useState<NoteName>("C");
  const [tempo, setTempo] = useState(style.defaultTempo);
  const [metronome, setMetronome] = useState(false);
  const [countIn, setCountIn] = useState(true);
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
  }, [styleId, keyRoot]);

  useEffect(() => {
    engineRef.current?.setMetronome(metronome);
  }, [metronome]);

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

  async function toggleRecording() {
    if (!isRecording) {
      await engineRef.current!.startRecording();
      setIsRecording(true);
    } else {
      await finishRecording();
    }
  }

  async function finishRecording() {
    const blob = await engineRef.current!.stopRecording();
    setIsRecording(false);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${style.name.replace(/\s+/g, "-").toLowerCase()}-${keyRoot}-${tempo}bpm.wav`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

          <label className="control-row checkbox">
            <input type="checkbox" checked={countIn} onChange={(e) => setCountIn(e.target.checked)} />
            <span>1-bar count-in</span>
          </label>

          <div className="loop-info">
            {style.progression.length}-bar loop &middot; {style.progression.map((c) => c.label).join(" – ")}
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
          <p className="hint">Record captures the loop as a WAV file you can keep and reuse.</p>
        </section>
      </main>

      <footer className="footer">
        <p>All sounds are synthesized live in your browser — nothing to upload, nothing to download but your take.</p>
      </footer>
    </div>
  );
}

export default App;
