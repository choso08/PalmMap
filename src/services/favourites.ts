import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Place } from '../types/geo';

/**
 * Sítios guardados, no telemóvel.
 *
 * Ficam no `AsyncStorage`, tal como as definições, por isso continuam lá
 * sem Internet — é para isso que servem.
 */

const STORAGE_KEY = 'palmmap.favourites';

/** Quantos sítios se guardam, no máximo. */
const LIMIT = 60;

export async function loadFavourites(): Promise<Place[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Place[]) : [];
  } catch {
    // Sem nada guardado, começa-se com a lista vazia.
    return [];
  }
}

export async function saveFavourites(places: Place[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(places.slice(0, LIMIT)));
  } catch {
    // Guardar é secundário: a lista continua a valer nesta sessão.
  }
}

/**
 * Dois sítios são o mesmo se estiverem praticamente no mesmo ponto.
 *
 * Não se compara pelo identificador: o mesmo café pode chegar pela pesquisa
 * (Nominatim) ou por um pino no mapa (Overpass), e nesse caso os
 * identificadores são diferentes.
 */
export function isSamePlace(a: Place, b: Place): boolean {
  return (
    Math.abs(a.coordinates.latitude - b.coordinates.latitude) < 0.0002 &&
    Math.abs(a.coordinates.longitude - b.coordinates.longitude) < 0.0002
  );
}
