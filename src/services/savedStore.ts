import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/**
 * A small value kept on the phone and shared by every screen that shows it,
 * with listeners — so a star on one panel and the Saved screen never disagree.
 * Read from storage once; each change is written at once.
 */
export function savedStore<T>(key: string, empty: T, clean: (raw: unknown) => T) {
  let value = empty;
  let loaded: Promise<void> | null = null;
  const listeners = new Set<(v: T) => void>();

  const load = (): Promise<void> => {
    if (!loaded) {
      loaded = AsyncStorage.getItem(key)
        .then((raw) => {
          if (raw) {
            value = clean(JSON.parse(raw));
            listeners.forEach((l) => l(value));
          }
        })
        .catch(() => undefined);
    }
    return loaded;
  };

  /** Changes the value from the stored one (waits for it to be read first). */
  const update = (change: (now: T) => T): void => {
    void load().then(() => {
      value = change(value);
      listeners.forEach((l) => l(value));
      void AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
    });
  };

  /** The value, kept up to date. */
  const useValue = (): T => {
    const [now, setNow] = useState(value);
    useEffect(() => {
      listeners.add(setNow);
      void load().then(() => setNow(value));
      return () => {
        listeners.delete(setNow);
      };
    }, []);
    return now;
  };

  /** The value as it stands now (the empty one until storage is read). */
  const current = (): T => value;

  return { update, useValue, current, load };
}
