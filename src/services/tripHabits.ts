import { savedStore } from './savedStore';
import type { HomeWork } from './homeWork';
import type { Coordinates, Place } from '../types/geo';
import { distanceMeters } from '../utils/geometry';

/**
 * The trips the person starts, to suggest the next one on opening the app
 * (author's request, November 2026: "as clever as possible"). Kept on the
 * phone only — where from, where to, the weekday and the time of day — the
 * last `MAX_TRIPS`. Nothing leaves the phone.
 */
interface StartedTrip {
  place: Place;
  from: Coordinates;
  /** Monday = 0. */
  weekday: number;
  /** Minutes from midnight. */
  minute: number;
}

const MAX_TRIPS = 200;
/** Within this of the usual time of day. */
const TIME_WINDOW_MIN = 75;
/** Started within this of where the person is now. */
const FROM_RADIUS_M = 1000;
/** Not a suggestion when already there. */
const ALREADY_THERE_M = 500;
/** Seen at least this many times to be a habit. */
const MIN_REPEATS = 2;

const store = savedStore<StartedTrip[]>('palmmap.viagensFeitas', [], (raw) =>
  Array.isArray(raw)
    ? (raw as StartedTrip[]).filter(
        (t) => t && t.place && t.from && typeof t.weekday === 'number' && typeof t.minute === 'number',
      )
    : [],
);

export const loadTripHabits = store.load;
export const useTripHabits = store.useValue;

/** Forgets every trip learnt (Settings → Notifications). */
export function forgetTripHabits(): void {
  store.update(() => []);
}

const weekdayOf = (d: Date) => (d.getDay() + 6) % 7;
const isWeekend = (weekday: number) => weekday >= 5;

/** A trip has started (navigation or a transport trip): remember it. */
export function recordTrip(from: Coordinates, place: Place): void {
  const now = new Date();
  store.update((list) =>
    [
      ...list,
      {
        place: { id: place.id, name: place.name, address: place.address, coordinates: place.coordinates },
        from,
        weekday: weekdayOf(now),
        minute: now.getHours() * 60 + now.getMinutes(),
      },
    ].slice(-MAX_TRIPS),
  );
}

export interface TripSuggestion {
  place: Place;
  /** Home or Work, when it is one of them (for the icon and the name). */
  kind: 'home' | 'work' | null;
}

/**
 * Where the person is likely going now: the destination most often started
 * from around here, on the same kind of day (weekday or weekend), at about
 * this time — at least twice. Without such a habit, Home and Work by the
 * clock: a weekday morning at home suggests Work, a weekday evening at work
 * suggests Home.
 */
export function suggestTrip(here: Coordinates, homeWork: HomeWork, now = new Date()): TripSuggestion | null {
  const weekday = weekdayOf(now);
  const minute = now.getHours() * 60 + now.getMinutes();
  const kindOf = (p: Place): 'home' | 'work' | null =>
    homeWork.home && distanceMeters(homeWork.home.coordinates, p.coordinates) < 150
      ? 'home'
      : homeWork.work && distanceMeters(homeWork.work.coordinates, p.coordinates) < 150
        ? 'work'
        : null;

  const counts = new Map<string, { place: Place; n: number }>();
  for (const t of store.current()) {
    const gap = Math.abs(t.minute - minute);
    if (
      isWeekend(t.weekday) !== isWeekend(weekday) ||
      Math.min(gap, 1440 - gap) > TIME_WINDOW_MIN ||
      distanceMeters(t.from, here) > FROM_RADIUS_M ||
      distanceMeters(t.place.coordinates, here) < ALREADY_THERE_M
    ) {
      continue;
    }
    // The same place within a stone's throw counts as one.
    const key = `${t.place.coordinates.latitude.toFixed(3)},${t.place.coordinates.longitude.toFixed(3)}`;
    const known = counts.get(key);
    counts.set(key, { place: known?.place ?? t.place, n: (known?.n ?? 0) + 1 });
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  if (best && best.n >= MIN_REPEATS) {
    return { place: best.place, kind: kindOf(best.place) };
  }

  if (isWeekend(weekday)) {
    return null;
  }
  const { home, work } = homeWork;
  const near = (p: Place | null) => !!p && distanceMeters(p.coordinates, here) < 400;
  const far = (p: Place | null) => !!p && distanceMeters(p.coordinates, here) > 1000;
  if (minute >= 6 * 60 && minute <= 10 * 60 + 30 && near(home) && far(work) && work) {
    return { place: work, kind: 'work' };
  }
  if (minute >= 16 * 60 && minute <= 20 * 60 + 30 && near(work) && far(home) && home) {
    return { place: home, kind: 'home' };
  }
  return null;
}
