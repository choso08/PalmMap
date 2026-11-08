import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Place } from '../types/geo';

/**
 * Saved places, on the phone.
 *
 * They live in `AsyncStorage`, like the settings, so they are still there
 * without Internet — that is what they are for.
 */

const STORAGE_KEY = 'palmmap.favourites';

/** How many places are kept, at most. */
const LIMIT = 60;

export async function loadFavourites(): Promise<Place[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Place[]) : [];
  } catch {
    // With nothing stored, start with an empty list.
    return [];
  }
}

export async function saveFavourites(places: Place[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(places.slice(0, LIMIT)));
  } catch {
    // Saving is secondary: the list still holds for this session.
  }
}

/**
 * Two places are the same if they are at practically the same point.
 *
 * They are not compared by identifier: the same café can come from the search
 * (Nominatim) or from a pin on the map (Overpass), and then the identifiers
 * differ.
 */
export function isSamePlace(a: Place, b: Place): boolean {
  return (
    Math.abs(a.coordinates.latitude - b.coordinates.latitude) < 0.0002 &&
    Math.abs(a.coordinates.longitude - b.coordinates.longitude) < 0.0002
  );
}
