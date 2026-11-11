import AsyncStorage from '@react-native-async-storage/async-storage';

import { isSamePlace } from './favourites';
import type { Place } from '../types/geo';
import { distanceMeters } from '../utils/geometry';

/**
 * The last places a route was planned to.
 *
 * Kept on the phone, like the favourites, so they are still there without
 * Internet. The difference between the two is who puts them on the list:
 * favourites are the person's choice, this happens on its own.
 *
 * **Only a destination chosen on purpose goes in here.** A pin dropped on the
 * map by mistake, or a business opened to check its hours and closed straight
 * after, does not count — otherwise the list would fill up with things nobody
 * wanted.
 */

const STORAGE_KEY = 'palmmap.recents';

/** How many are kept. Nobody scrolls through more than this. */
const LIMIT = 12;

/** A name compared without case, accents or spacing. */
function plain(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Whether two entries are the same destination.
 *
 * Position alone was not enough: the same school came from the search (the
 * middle of its grounds), from a pin (its entrance) and from a business file,
 * a few dozen metres apart each time — and the list showed it three times. The
 * same name within `SAME_NAME_M` is the same place.
 */
const SAME_NAME_M = 300;
function sameDestination(a: Place, b: Place): boolean {
  if (isSamePlace(a, b)) {
    return true;
  }
  return (
    !!a.name &&
    plain(a.name) === plain(b.name ?? '') &&
    distanceMeters(a.coordinates, b.coordinates) <= SAME_NAME_M
  );
}

/** The list with the older copy of each destination dropped. */
function unique(places: Place[]): Place[] {
  const kept: Place[] = [];
  for (const place of places) {
    if (!kept.some((k) => sameDestination(k, place))) {
      kept.push(place);
    }
  }
  return kept;
}

export async function loadRecents(): Promise<Place[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    // Cleaned on reading too, so lists stored by older versions lose their
    // repeats without anyone doing anything.
    return stored ? unique(JSON.parse(stored) as Place[]) : [];
  } catch {
    return [];
  }
}

/**
 * Writes one at a time. Two destinations remembered at once (choosing a place
 * and starting a route straight after) each read the list before the other
 * wrote it, and one of them was lost or doubled.
 */
let writing: Promise<unknown> = Promise.resolve();

/**
 * Puts a place at the head of the list.
 *
 * If it was already there, it moves up instead of appearing twice — the
 * comparison is by position and not by identifier, because the same place can
 * come from the search or from a map pin with different identifiers.
 */
export function rememberRecent(place: Place): Promise<Place[]> {
  const run = writing.then(async () => {
    const current = await loadRecents();
    const next = unique([place, ...current]).slice(0, LIMIT);

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Saving is secondary: the list still holds for this session.
    }

    return next;
  });
  writing = run.catch(() => undefined);
  return run;
}

/**
 * Forgets one destination — swiped away, or its ✕, in the search list
 * (author's request, November 2026). Through the same one-at-a-time queue as
 * `rememberRecent`, so the two never overwrite each other.
 */
export function forgetRecent(place: Place): Promise<Place[]> {
  const run = writing.then(async () => {
    const next = (await loadRecents()).filter((p) => !sameDestination(p, place));
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // As above: the list still holds for this session.
    }
    return next;
  });
  writing = run.catch(() => undefined);
  return run;
}

/** Forgets everything. Lives in the settings, for anyone who does not want this history. */
export async function clearRecents(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // With nothing stored, there is nothing to delete.
  }
}
