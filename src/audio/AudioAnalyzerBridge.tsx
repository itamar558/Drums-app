import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { WebView as RNWebView, WebViewMessageEvent } from 'react-native-webview';
import { WEBVIEW_BUNDLE_JS } from './generatedWebviewBundle';
import type { Song } from '../dsp/types';

// react-native-webview's type definitions aren't yet updated for React 19's
// stricter JSX prop inference (every valid prop combination resolves to a
// "never" overload mismatch), so the component is used through a loosely
// typed local alias rather than disabling type-checking more broadly.
const WebView = RNWebView as unknown as React.ComponentType<
  React.ComponentProps<typeof RNWebView> & { ref?: React.Ref<RNWebView> }
>;

export interface AudioAnalyzerBridgeHandle {
  analyze: (base64: string, mimeType: string) => Promise<Song>;
}

type PendingRequest = { resolve: (song: Song) => void; reject: (err: Error) => void };

const html = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <script>${WEBVIEW_BUNDLE_JS}</script>
  </body>
</html>`;

/**
 * Hidden WebView that runs the DSP pipeline on native platforms (iOS/
 * Android have no Web Audio API to decode compressed audio with; a
 * WebView's browser engine does). Mount once near the app root and drive
 * it via the imperative `analyze` method.
 */
export const AudioAnalyzerBridge = forwardRef<AudioAnalyzerBridgeHandle>((_props, ref) => {
  const webviewRef = useRef<RNWebView>(null);
  const pending = useRef<PendingRequest | null>(null);

  useImperativeHandle(ref, () => ({
    analyze(base64: string, mimeType: string) {
      return new Promise<Song>((resolve, reject) => {
        if (pending.current) {
          reject(new Error('An analysis is already in progress'));
          return;
        }
        pending.current = { resolve, reject };
        webviewRef.current?.postMessage(JSON.stringify({ type: 'analyze', base64, mimeType }));
      });
    },
  }));

  const onMessage = (event: WebViewMessageEvent) => {
    const request = pending.current;
    if (!request) return;
    pending.current = null;
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'result') {
        request.resolve(message.song as Song);
      } else {
        request.reject(new Error(message.message ?? 'Unknown analysis error'));
      }
    } catch (err) {
      request.reject(err instanceof Error ? err : new Error(String(err)));
    }
  };

  return (
    <WebView
      ref={webviewRef}
      source={{ html }}
      onMessage={onMessage}
      style={{ width: 0, height: 0 }}
      originWhitelist={['*']}
    />
  );
});

AudioAnalyzerBridge.displayName = 'AudioAnalyzerBridge';
