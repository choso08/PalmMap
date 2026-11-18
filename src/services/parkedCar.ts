import { savedStore } from './savedStore';
import type { Coordinates } from '../types/geo';

/**
 * Where the car was left (author's request, November 2026: "where I parked").
 *
 * Kept on the phone only. Saved by hand from the Saved screen, and by itself
 * when a car navigation arrives; forgotten when the car is driven again — on
 * reaching it while walking to it, or starting a car trip next to it.
 *
 * While it is set and the person is away from it, a car trip starts **at the
 * car**, and the walk to it is worked out and added to the trip's time
 * (`walkToCar` on `Route`).
 */
export interface ParkedCar {
  coordinates: Coordinates;
  /** When it was saved, in ms since 1970. */
  at: number;
}

const isParked = (p: unknown): p is ParkedCar => {
  const c = (p as ParkedCar | null)?.coordinates;
  return (
    !!c &&
    typeof c.latitude === 'number' &&
    typeof c.longitude === 'number' &&
    typeof (p as ParkedCar).at === 'number'
  );
};

const store = savedStore<ParkedCar | null>('palmmap.carroEstacionado', null, (raw) =>
  isParked(raw) ? raw : null,
);

export const useParkedCar = store.useValue;
export const parkedCarNow = store.current;
export const loadParkedCar = store.load;

export function parkCar(coordinates: Coordinates): void {
  store.update(() => ({ coordinates, at: Date.now() }));
}

export function forgetParkedCar(): void {
  store.update(() => null);
}
