import type { File } from 'expo-file-system';
import { useCallback, useRef, useState } from 'react';

import { t } from './i18n';
import { downloadUpdate, installUpdate, type UpdateInfo } from './services/update';

/**
 * Download the new version and open the installer.
 *
 * It lives here, and not inside one of the screens, because **two places do
 * this**: the notice that appears when the app opens and the settings section.
 * Two copies of the same code would drift apart — and the part that would
 * drift is the error handling, which is exactly the part nobody tries.
 *
 * It sits at the level of `src/`, next to `settings.tsx`, where the hooks used
 * by more than one component already live.
 */
export function useUpdateDownload() {
  const [progress, setProgress] = useState<number | null>(null);
  /** The APK already downloaded, waiting to be installed. */
  const [ready, setReady] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Whether someone gave up while this was downloading.
   *
   * It exists because of the automatic download: someone who opens the app and
   * finds an update running on its own must be able to say "not now" **before**
   * the installer jumps in front of them. In a `ref` and not in state because
   * the reader is the function already running, which kept the value it
   * started with.
   */
  const gaveUp = useRef(false);

  const start = useCallback(async (info: UpdateInfo) => {
    gaveUp.current = false;
    setProgress(0);
    setError(null);
    try {
      const file = await downloadUpdate(info, setProgress);
      setReady(file);
      // The installer opens right after: whoever pressed "update" does not
      // want to press another button. If they close the installer without
      // installing, the button stays there to open it again.
      if (!gaveUp.current) {
        await installUpdate(file);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t().common.failed);
    } finally {
      setProgress(null);
    }
  }, []);

  /**
   * Give up: what is already downloading finishes, but the installer does not
   * open.
   *
   * The download is deliberately not cancelled halfway — the file stays in the
   * cache and, if the person changes their mind shortly, it is already here.
   */
  const cancel = useCallback(() => {
    gaveUp.current = true;
  }, []);

  const install = useCallback(async () => {
    if (!ready) {
      return;
    }
    setError(null);
    try {
      await installUpdate(ready);
    } catch (err) {
      setError(err instanceof Error ? err.message : t().common.failed);
    }
  }, [ready]);

  return {
    /** How far it has got, from 0 to 1. `null` when not downloading. */
    progress,
    downloading: progress !== null,
    ready: ready !== null,
    error,
    start,
    cancel,
    install,
  };
}
