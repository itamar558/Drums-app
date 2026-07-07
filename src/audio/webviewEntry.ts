import { analyzeSamples } from '../dsp/analyze';
import type { Song } from '../dsp/types';

/**
 * Entry point bundled (via scripts/build-webview-bundle.mjs) into a
 * standalone JS file embedded in a hidden WebView on native platforms.
 * Native RN has no Web Audio API and no way to decode compressed audio
 * (mp3/m4a) to raw PCM on its own; a WebView's JS engine does, so audio
 * decoding + the whole DSP pipeline runs in there, and only the small
 * resulting Song JSON is sent back over the RN bridge.
 */

type InMessage = { type: 'analyze'; base64: string; mimeType: string };
type OutMessage = { type: 'result'; song: Song } | { type: 'error'; message: string };

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

function post(message: OutMessage): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function toMonoFloat32(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const mono = new Float32Array(buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  return mono;
}

async function handleAnalyze(message: InMessage): Promise<void> {
  try {
    const arrayBuffer = base64ToArrayBuffer(message.base64);
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextCtor();
    const audioBuffer: AudioBuffer = await new Promise((resolve, reject) => {
      ctx.decodeAudioData(arrayBuffer, resolve, reject);
    });
    const samples = toMonoFloat32(audioBuffer);
    const song = analyzeSamples(samples, audioBuffer.sampleRate);
    post({ type: 'result', song });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

function onMessage(event: Event): void {
  try {
    const data = (event as unknown as { data: string }).data;
    const message: InMessage = JSON.parse(data);
    if (message.type === 'analyze') void handleAnalyze(message);
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

// react-native-webview delivers messages via `document` on Android and
// `window` on iOS -- register both.
document.addEventListener('message', onMessage);
window.addEventListener('message', onMessage);
