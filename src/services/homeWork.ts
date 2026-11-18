import { savedStore } from './savedStore';
import type { Place } from '../types/geo';

/**
 * Home and Work, the two shortcuts at the top of the Saved screen, as Moovit
 * and Maps have them (author's request, November 2026). Each is one of the
 * person's places, picked on that screen; a tap there makes it the
 * destination.
 */
export type HomeWorkKind = 'home' | 'work';
export type HomeWork = Record<HomeWorkKind, Place | null>;

const isPlace = (p: unknown): p is Place =>
  !!p && typeof p === 'object' && 'coordinates' in p && typeof (p as Place).name === 'string';

const store = savedStore<HomeWork>('palmmap.casaTrabalho', { home: null, work: null }, (raw) => {
  const r = (raw ?? {}) as Partial<HomeWork>;
  return { home: isPlace(r.home) ? r.home : null, work: isPlace(r.work) ? r.work : null };
});

export const useHomeWork = store.useValue;
export const loadHomeWork = store.load;
export const homeWorkNow = store.current;

/** Sets or clears one of the two. */
export function setHomeWork(kind: HomeWorkKind, place: Place | null): void {
  store.update((now) => ({ ...now, [kind]: place }));
}
