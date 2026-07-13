import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function downloadInBrowser(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Saves a recorded file to disk. On native Android/iOS, a WebView anchor
 * download doesn't reliably reach the user's storage, so we write the file
 * via the Filesystem plugin and hand it to the native share sheet instead
 * (the standard Capacitor pattern for exporting generated files).
 */
export async function exportAudioFile(blob: Blob, filename: string) {
  if (!Capacitor.isNativePlatform()) {
    downloadInBrowser(blob, filename);
    return;
  }

  const base64 = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });

  await Share.share({
    title: filename,
    url: written.uri,
  });
}
