import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import type { TransitStop } from './transit';

/**
 * Favourite stops (author's request, November 2026, "as in Moovit"): starred
 * on a stop's panel, listed on the Saved screen with their next buses.
 *
 * One list for the whole app, kept here with listeners, so the star on the
 * stop and the Saved screen never disagree.
 */
const STORAGE_KEY = 'palmmap.paragensFavoritas';
const LIMIT = 20;

let stops: TransitStop[] = [];
let loaded: Promise<void> | null = null;
const listeners = new Set<(list: TransitStop[]) => void>();

function load(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const list = raw ? (JSON.parse(raw) as TransitStop[]) : [];
        stops = Array.isArray(list) ? list.filter((s) => s && s.id && s.coordinates) : [];
        listeners.forEach((l) => l(stops));
      })
      .catch(() => undefined);
  }
  return loaded;
}

function store(next: TransitStop[]): void {
  stops = next.slice(0, LIMIT);
  listeners.forEach((l) => l(stops));
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stops)).catch(() => undefined);
}

/** Stars or unstars a stop. */
export function toggleFavouriteStop(stop: TransitStop): void {
  void load().then(() => {
    store(
      stops.some((s) => s.id === stop.id)
        ? stops.filter((s) => s.id !== stop.id)
        : [{ ...stop, patterns: [] }, ...stops],
    );
  });
}

/** The favourite stops, kept up to date. */
export function useFavouriteStops(): TransitStop[] {
  const [list, setList] = useState(stops);
  useEffect(() => {
    listeners.add(setList);
    void load().then(() => setList(stops));
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return list;
}

/** Whether a stop is starred, and the toggle. */
export function useIsFavouriteStop(stop: TransitStop | null): [boolean, () => void] {
  const list = useFavouriteStops();
  const on = stop !== null && list.some((s) => s.id === stop.id);
  const toggle = useCallback(() => {
    if (stop) {
      toggleFavouriteStop(stop);
    }
  }, [stop]);
  return [on, toggle];
}
