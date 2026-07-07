import React, { useRef, useState } from 'react';
import { Platform, SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import { HomeScreen } from './src/screens/HomeScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { AudioAnalyzerBridge, AudioAnalyzerBridgeHandle } from './src/audio/AudioAnalyzerBridge';
import { analyzeAudioFile } from './src/audio/analyzeAudioFile';
import type { Song } from './src/dsp/types';

type AppState =
  | { phase: 'idle' }
  | { phase: 'processing' }
  | { phase: 'error'; message: string }
  | { phase: 'result'; song: Song; fileUri: string; fileName: string };

export default function App() {
  const [state, setState] = useState<AppState>({ phase: 'idle' });
  const bridgeRef = useRef<AudioAnalyzerBridgeHandle>(null);

  async function onPickFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setState({ phase: 'processing' });
    try {
      const song = await analyzeAudioFile(asset.uri, asset.mimeType ?? 'audio/mpeg', bridgeRef);
      setState({ phase: 'result', song, fileUri: asset.uri, fileName: asset.name });
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      {Platform.OS !== 'web' && <AudioAnalyzerBridge ref={bridgeRef} />}
      {state.phase === 'result' ? (
        <ResultScreen
          song={state.song}
          fileUri={state.fileUri}
          fileName={state.fileName}
          onReset={() => setState({ phase: 'idle' })}
        />
      ) : (
        <HomeScreen
          onPickFile={onPickFile}
          busy={state.phase === 'processing'}
          error={state.phase === 'error' ? state.message : undefined}
        />
      )}
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
