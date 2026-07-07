import type { Song } from '../dsp/types';

export type AnalyzeAudioFile = (fileUri: string, mimeType: string) => Promise<Song>;
