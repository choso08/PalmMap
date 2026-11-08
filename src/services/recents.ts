import AsyncStorage from '@react-native-async-storage/async-storage';

import { isSamePlace } from './favourites';
import type { Place } from '../types/geo';

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

export async function loadRecents(): Promise<Place[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Place[]) : [];
  } catch {
    return [];
  }
}

/**
 * Puts a place at the head of the list.
 *
 * If it was already there, it moves up instead of appearing twice — the
 * comparison is by position and not by identifier, because the same place can
 * come from the search or from a map pin with different identifiers.
 */
export async function rememberRecent(place: Place): Promise<Place[]> {
  const current = await loadRecents();
  const next = [place, ...current.filter((p) => !isSamePlace(p, place))].slice(0, LIMIT);

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Saving is secondary: the list still holds for this session.
  }

  return next;
}

/** Forgets everything. Lives in the settings, for anyone who does not want this history. */
export async function clearRecents(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // With nothing stored, there is nothing to delete.
  }
}
