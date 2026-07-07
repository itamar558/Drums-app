import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import type { Song } from '../dsp/types';
import { DrumSheet } from '../components/DrumSheet';

export function ResultScreen({ song, fileUri, fileName, onReset }: { song: Song; fileUri: string; fileName: string; onReset: () => void }) {
  const { width } = useWindowDimensions();
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Audio.Sound.createAsync({ uri: fileUri }, { shouldPlay: false }, onPlaybackStatusUpdate)
      .then(({ sound }) => {
        if (cancelled) {
          void sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));

    return () => {
      cancelled = true;
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, [fileUri]);

  function onPlaybackStatusUpdate(status: AVPlaybackStatus) {
    if (!status.isLoaded) return;
    setIsPlaying(status.isPlaying);
    if (status.didJustFinish) setIsPlaying(false);
  }

  async function togglePlayback() {
    const sound = soundRef.current;
    if (!sound) return;
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await sound.pauseAsync();
    } else {
      if (status.didJustFinish || status.positionMillis >= (status.durationMillis ?? Infinity)) {
        await sound.setPositionAsync(0);
      }
      await sound.playAsync();
    }
  }

  const measureCount = song.sections.reduce((sum, s) => sum + s.measures.length, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onReset} hitSlop={12}>
          <Text style={styles.backLink}>{'‹ New file'}</Text>
        </Pressable>
        <Text style={styles.fileName} numberOfLines={1}>
          {fileName}
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>{song.bpm} BPM</Text>
        <Text style={styles.summaryText}>{song.timeSignature[0]}/{song.timeSignature[1]}</Text>
        <Text style={styles.summaryText}>{measureCount} measures</Text>
      </View>

      <Pressable style={styles.playButton} onPress={togglePlayback}>
        <Text style={styles.playButtonText}>{isPlaying ? 'Pause' : 'Play'}</Text>
      </Pressable>
      {loadError && <Text style={styles.error}>Couldn't load audio for playback: {loadError}</Text>}

      <ScrollView contentContainerStyle={styles.sheetScroll}>
        <DrumSheet song={song} width={width - 24} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 56,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  backLink: {
    fontSize: 16,
    color: '#1a56db',
  },
  fileName: {
    fontSize: 13,
    color: '#666',
    flexShrink: 1,
    marginLeft: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
  },
  playButton: {
    alignSelf: 'center',
    backgroundColor: '#1a1a1a',
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
  },
  playButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  error: {
    color: '#b00020',
    textAlign: 'center',
    fontSize: 12,
    marginBottom: 8,
  },
  sheetScroll: {
    paddingHorizontal: 12,
    paddingBottom: 48,
  },
});
