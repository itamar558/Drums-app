import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import type { Song } from '../dsp/types';
import { analyzeAudioFileWeb } from './decodeWeb';
import type { AudioAnalyzerBridgeHandle } from './AudioAnalyzerBridge';

/**
 * Decodes and transcribes an audio file. On web, decodes directly in the
 * browser. On native, reads the file as base64 and hands it to the hidden
 * WebView bridge (native RN has no Web Audio API of its own).
 */
export async function analyzeAudioFile(
  fileUri: string,
  mimeType: string,
  nativeBridge: React.RefObject<AudioAnalyzerBridgeHandle | null>,
): Promise<Song> {
  if (Platform.OS === 'web') {
    return analyzeAudioFileWeb(fileUri);
  }

  if (!nativeBridge.current) {
    throw new Error('Audio analyzer is not ready yet');
  }

  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return nativeBridge.current.analyze(base64, mimeType);
}
