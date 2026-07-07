import { analyzeSamples } from '../dsp/analyze';
import type { Song } from '../dsp/types';

function toMonoFloat32(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const mono = new Float32Array(buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  return mono;
}

/**
 * Web target already runs in a real browser, so it can decode audio and
 * run the DSP pipeline directly -- no WebView indirection needed (that's
 * only for native, which has no Web Audio API of its own).
 */
export async function analyzeAudioFileWeb(fileUri: string): Promise<Song> {
  const response = await fetch(fileUri);
  const arrayBuffer = await response.arrayBuffer();
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextCtor();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const samples = toMonoFloat32(audioBuffer);
    return analyzeSamples(samples, audioBuffer.sampleRate);
  } finally {
    void ctx.close();
  }
}
