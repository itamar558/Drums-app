import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export function HomeScreen({
  onPickFile,
  busy,
  error,
}: {
  onPickFile: () => void;
  busy: boolean;
  error?: string;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Drum Transcriber</Text>
      <Text style={styles.subtitle}>
        Pick a song and get a best-effort drum sheet: kick, snare, hi-hat and crash, grouped into
        sections, with dense fills marked as "Drum Fill" rather than note-for-note.
      </Text>

      <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={onPickFile} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Choose Audio File</Text>}
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.disclaimer}>
        This uses signal-processing heuristics, not a trained model -- expect it to nail simple,
        drum-forward grooves and struggle on dense mixes or unusual kits.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#444',
    textAlign: 'center',
    marginBottom: 28,
  },
  button: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    minWidth: 220,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#b00020',
    marginTop: 16,
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 36,
    lineHeight: 18,
  },
});
