import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import type { File } from 'expo-file-system';
import { File as FsFile } from 'expo-file-system';

import { USER_AGENT } from './config';

/**
 * Downloads through Android's own DownloadManager (`DownloaderModule.kt`, in
 * `modules/palmmap-voice`), for the big files: the update's APK and the
 * country maps.
 *
 * Why (author's photo, 19 November 2026): the app's own connection
 * (`File.downloadFileAsync`) is cut when Android puts the app in the
 * background — "Software caused connection abort". The system's downloads
 * keep going in the background or with the app closed, with the system's own
 * progress notification.
 *
 * The file lands in the app's external files folder (no permission needed);
 * this asks how it goes every `POLL_MS`, and when done moves it to where the
 * caller wants it. The download's id is kept (`palmmap.descarga.<key>`), so a
 * download started before the app was closed is picked up again, not repeated.
 */

interface PalmMapDownloader {
  start(url: string, fileName: string, title: string, userAgent: string): string;
  status(id: string): {
    state: 'pending' | 'running' | 'paused' | 'done' | 'failed' | 'missing';
    bytes?: number;
    total?: number;
    reason?: number;
    path?: string;
  };
  remove(id: string): boolean;
}

const POLL_MS = 700;
const KEY_PREFIX = 'palmmap.descarga.';

function downloader(): PalmMapDownloader | null {
  try {
    return requireOptionalNativeModule<PalmMapDownloader>('PalmMapDownloader');
  } catch {
    return null;
  }
}

/** Whether this build has the system downloader (older ones do not). */
export function hasSystemDownloader(): boolean {
  return downloader() !== null;
}

export class SystemDownloadError extends Error {}

/**
 * Downloads `url` into `destination` through the system. `key` names the
 * download (one per file); `expectedBytes` is used when the server gives no
 * size. Progress is reported per whole percent. Throws `SystemDownloadError`
 * on failure; call only when `hasSystemDownloader()`.
 */
export async function systemDownload(options: {
  key: string;
  url: string;
  destination: File;
  title: string;
  expectedBytes?: number;
  onProgress?: (fraction: number) => void;
}): Promise<File> {
  const system = downloader();
  if (!system) {
    throw new SystemDownloadError('DownloadManager');
  }
  const { key, url, destination, title, expectedBytes = 0, onProgress } = options;
  const storeKey = KEY_PREFIX + key;

  // A download of the same file already under way (the app was closed
  // meanwhile) is picked up; one of another address is dropped.
  let id: string | null = null;
  try {
    const kept = JSON.parse((await AsyncStorage.getItem(storeKey)) ?? 'null') as
      | { id: string; url: string }
      | null;
    if (kept) {
      const state = system.status(kept.id).state;
      if (kept.url === url && state !== 'failed' && state !== 'missing') {
        id = kept.id;
      } else {
        system.remove(kept.id);
      }
    }
  } catch {
    // Nothing usable kept: a new download.
  }
  if (!id) {
    // The system's file name: the destination's, plus a mark it is unfinished.
    id = system.start(url, `${destination.name}.descarga`, title, USER_AGENT);
    if (!id) {
      throw new SystemDownloadError('DownloadManager');
    }
    await AsyncStorage.setItem(storeKey, JSON.stringify({ id, url }));
  }
  const downloadId = id;
  const forget = async () => {
    system.remove(downloadId);
    await AsyncStorage.removeItem(storeKey).catch(() => undefined);
  };

  let lastPercent = -1;
  for (;;) {
    const st = system.status(downloadId);
    if (st.state === 'done' && st.path) {
      const source = new FsFile(st.path);
      if (destination.exists) {
        destination.delete();
      }
      try {
        // Moved, not copied: a country map is hundreds of megabytes.
        source.move(destination);
      } catch {
        source.copy(destination);
      }
      await forget();
      onProgress?.(1);
      return destination;
    }
    if (st.state === 'failed' || st.state === 'missing' || st.state === 'done') {
      await forget();
      throw new SystemDownloadError(
        st.state === 'failed' ? `DownloadManager ${st.reason ?? ''}`.trim() : `DownloadManager ${st.state}`,
      );
    }
    const total = (st.total ?? 0) > 0 ? (st.total as number) : expectedBytes;
    if (total > 0 && st.bytes !== undefined) {
      const fraction = Math.min(1, st.bytes / total);
      const percent = Math.floor(fraction * 100);
      if (percent !== lastPercent) {
        lastPercent = percent;
        onProgress?.(fraction);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
