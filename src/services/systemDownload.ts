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
  start(
    url: string,
    fileName: string,
    title: string,
    userAgent: string,
    allowMetered: boolean,
    allowRoaming: boolean,
  ): string;
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
/**
 * How long a download may sit without a byte arriving before the caller is
 * told. DownloadManager never fails for want of a network — it waits — and a
 * caller left waiting forever was a full-screen update notice nobody could
 * close (code review, 19 November 2026). The system keeps the download: a
 * later call with the same key picks it up where it is.
 */
const STALL_MS = 90_000;
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
/** The system would not take the download at all: use the app's own instead. */
export class SystemDownloadRefused extends SystemDownloadError {}
/** No byte arrived for `STALL_MS` (no network, Wi-Fi-only off Wi-Fi): kept, not dropped. */
export class SystemDownloadStalled extends SystemDownloadError {}

interface Kept {
  id: string;
  url: string;
  metered?: boolean;
}

/**
 * One download per key at a time: a second call (Settings closed and opened
 * again mid-update) joins the first instead of polling the same system
 * download and finishing it twice — the second deleted the file the first had
 * just moved into place.
 */
const inFlight = new Map<
  string,
  { job: Promise<File>; listeners: Set<(fraction: number) => void> }
>();

/**
 * Downloads `url` into `destination` through the system. `key` names the
 * download (one per file); `expectedBytes`, when given, is the exact size the
 * file must have (the manifest's): a download of another size — an older
 * generation published at the same address — is refused. `allowMetered`
 * false keeps it to Wi-Fi (the automatic map refresh), and roaming is never
 * allowed then. Progress is reported per whole percent. Throws
 * `SystemDownloadError` (`…Refused` when the system will not take it,
 * `…Stalled` when it waits too long); call only when `hasSystemDownloader()`.
 */
export function systemDownload(options: {
  key: string;
  url: string;
  destination: File;
  title: string;
  expectedBytes?: number;
  allowMetered?: boolean;
  onProgress?: (fraction: number) => void;
}): Promise<File> {
  const running = inFlight.get(options.key);
  if (running) {
    if (options.onProgress) {
      running.listeners.add(options.onProgress);
    }
    return running.job;
  }
  const listeners = new Set<(fraction: number) => void>();
  if (options.onProgress) {
    listeners.add(options.onProgress);
  }
  const job = runDownload(options, (fraction) => listeners.forEach((l) => l(fraction))).finally(
    () => {
      inFlight.delete(options.key);
    },
  );
  inFlight.set(options.key, { job, listeners });
  return job;
}

async function runDownload(
  options: {
    key: string;
    url: string;
    destination: File;
    title: string;
    expectedBytes?: number;
    allowMetered?: boolean;
  },
  onProgress: (fraction: number) => void,
): Promise<File> {
  const system = downloader();
  if (!system) {
    throw new SystemDownloadRefused('DownloadManager');
  }
  const { key, url, destination, title, expectedBytes = 0, allowMetered = true } = options;
  const storeKey = KEY_PREFIX + key;

  // A download of the same file already under way (the app was closed
  // meanwhile) is picked up. Dropped instead: one of another address, one of
  // another size than the one wanted (the file was published again since),
  // and one kept to Wi-Fi when this one may use mobile data.
  let id: string | null = null;
  try {
    const kept = JSON.parse((await AsyncStorage.getItem(storeKey)) ?? 'null') as Kept | null;
    if (kept) {
      const st = system.status(kept.id);
      const otherSize =
        expectedBytes > 0 && (st.total ?? 0) > 0 && st.total !== expectedBytes;
      const tooStrict = allowMetered && kept.metered === false;
      if (
        kept.url === url &&
        st.state !== 'failed' &&
        st.state !== 'missing' &&
        !otherSize &&
        !tooStrict
      ) {
        id = kept.id;
      } else {
        system.remove(kept.id);
        await AsyncStorage.removeItem(storeKey).catch(() => undefined);
      }
    }
  } catch {
    // Nothing usable kept: a new download.
  }
  if (!id) {
    let started = '';
    try {
      // The system's file name: the destination's, plus a mark it is unfinished.
      started = system.start(
        url,
        `${destination.name}.descarga`,
        title,
        USER_AGENT,
        allowMetered,
        allowMetered,
      );
    } catch {
      started = '';
    }
    if (!started) {
      // Download Manager disabled or missing on this phone.
      throw new SystemDownloadRefused('DownloadManager');
    }
    id = started;
    await AsyncStorage.setItem(storeKey, JSON.stringify({ id, url, metered: allowMetered } satisfies Kept));
  }
  const downloadId = id;
  const forget = async () => {
    system.remove(downloadId);
    await AsyncStorage.removeItem(storeKey).catch(() => undefined);
  };

  let lastPercent = -1;
  let lastBytes = -1;
  let lastMoved = Date.now();
  for (;;) {
    const st = system.status(downloadId);
    if (st.state === 'done' && st.path) {
      try {
        await land(new FsFile(st.path), destination, expectedBytes > 0 ? expectedBytes : st.total ?? 0);
      } finally {
        // Whatever happened, the system's copy and the kept id go: a retry
        // starts clean instead of failing on the same file again.
        await forget();
      }
      onProgress(1);
      return destination;
    }
    if (st.state === 'failed' || st.state === 'missing' || st.state === 'done') {
      await forget();
      throw new SystemDownloadError(
        st.state === 'failed' ? `DownloadManager ${st.reason ?? ''}`.trim() : `DownloadManager ${st.state}`,
      );
    }
    const now = Date.now();
    if (st.bytes !== undefined && st.bytes !== lastBytes) {
      lastBytes = st.bytes;
      lastMoved = now;
    } else if (now - lastMoved > STALL_MS && st.state !== 'running') {
      throw new SystemDownloadStalled(`DownloadManager ${st.state} ${st.reason ?? ''}`.trim());
    }
    const total = expectedBytes > 0 ? expectedBytes : st.total ?? 0;
    if (total > 0 && st.bytes !== undefined) {
      const fraction = Math.min(1, st.bytes / total);
      const percent = Math.floor(fraction * 100);
      if (percent !== lastPercent) {
        lastPercent = percent;
        onProgress(fraction);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/**
 * Puts the finished file in place. It goes under a temporary name in the
 * destination's own folder first, is measured, and only then gets the final
 * name — a rename in one folder, which is atomic. From the system's folder to
 * the app's they are different filesystems, so the first step is a copy that
 * takes a while: done straight onto the final name, the file sat there half
 * written meanwhile (and a reader of the old one read the new bytes).
 *
 * **Awaited.** `move` and `copy` return promises; not awaited, the system
 * deleted its file mid-copy and the update arrived cut short — "there was a
 * problem parsing the package" (author's photo, 19 November 2026, 7.0.61).
 */
async function land(source: File, destination: File, expected: number): Promise<void> {
  const staging = new FsFile(destination.parentDirectory, `${destination.name}.recebido`);
  try {
    if (staging.exists) {
      staging.delete();
    }
    try {
      await source.move(staging);
    } catch {
      await source.copy(staging);
    }
    const landed = new FsFile(staging.uri);
    if (!landed.exists || (expected > 0 && landed.size !== expected)) {
      throw new SystemDownloadError(`DownloadManager size ${landed.exists ? landed.size : 0}/${expected}`);
    }
    if (destination.exists) {
      destination.delete();
    }
    await landed.move(destination);
  } catch (error) {
    if (staging.exists) {
      staging.delete();
    }
    throw error instanceof SystemDownloadError
      ? error
      : new SystemDownloadError(error instanceof Error ? error.message : String(error));
  }
}
