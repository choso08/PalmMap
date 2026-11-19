import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { t } from '../i18n';
import type { Coordinates } from '../types/geo';
import { distanceMeters } from '../utils/geometry';
import { LEARNING_TASK } from './config';

/**
 * Learning from the person's own movements, with the app closed too (author,
 * 19 November 2026: "an option in Settings, off by default, to let the app
 * follow the person to learn habits and paces").
 *
 * What it keeps is only **what was learnt** — frequent places with how often
 * and when, and pace observations waiting to be blended in — never the path.
 * The trip under way is a few numbers (distance, start, a capped list of
 * speeds) until it ends.
 *
 * - **Stays**: within `STAY_RADIUS_M` for at least `STAY_MIN_MS`. Each stay
 *   joins the frequent place within `PLACE_MERGE_M`, or makes a new one; the
 *   nights (03:00 inside a stay) and the weekday working days (2 h or more
 *   between 09:00 and 18:00) it covers are counted by date.
 * - **Trips**: what happens between two stays. Classified by the GPS's own
 *   speeds (median and 95th percentile); walking and cycling ones teach the
 *   pace against the app's models, car and anything mixed teach nothing (a
 *   car's pace needs the route it was compared against, and the driving floor
 *   would undo it anyway).
 *
 * The task runs headless: what it learns waits in storage (`pending`) and the
 * app applies it when it is on screen (`takePending`), through the same
 * `learnPace` and `recordTrip` navigation uses.
 */

/** What is kept: places, and what still has to reach the app. Backed up. */
const LEARNT_KEY = 'palmmap.aprendizagem';
/** The trip under way and the current stay candidate. Not backed up. */
const STATE_KEY = 'palmmap.aprendizagem.estado';

const STAY_RADIUS_M = 100;
const STAY_MIN_MS = 10 * 60_000;
const PLACE_MERGE_M = 120;
const PLACES_MAX = 30;
/** A reading worse than this says nothing about speed or a stay's edge. */
const ACCURACY_MAX_M = 60;
/** A gap this long with the person elsewhere: the trip is not known. */
const GAP_MAX_MS = 30 * 60_000;
const SPEEDS_MAX = 400;
/** Like navigation's: shorter trips are dominated by a door or a light. */
const PACE_TRIP_MIN_MS = 3 * 60_000;
const PACE_TRIP_MIN_M = 500;
/** The app's models: OSRM's foot profile and the cycling floor (5-A). */
const WALK_MODEL_MS = 5 / 3.6;
const CYCLE_MODEL_MS = 12.5 / 3.6;
const PENDING_MAX = 50;
/** Home: the most nights, at least this many; Work: the most working days. */
const HOME_MIN_NIGHTS = 3;
const WORK_MIN_DAYS = 3;
const WORK_FROM_HOME_MIN_M = 300;

export interface FrequentPlace {
  id: string;
  coordinates: Coordinates;
  visits: number;
  minutes: number;
  /** Dates (YYYY-MM-DD) with 03:00 spent here; at most 60 kept. */
  nights: string[];
  /** Weekday dates with 2 h or more here between 09:00 and 18:00. */
  workdays: string[];
  lastAt: number;
}

export interface PaceObservation {
  key: 'walking' | 'cycling';
  factor: number;
}

export interface LearntTrip {
  from: Coordinates;
  to: Coordinates;
  /** When it started (ms). */
  at: number;
}

export interface Learnt {
  places: FrequentPlace[];
  pending: { paces: PaceObservation[]; trips: LearntTrip[] };
}

interface Point {
  latitude: number;
  longitude: number;
  at: number;
}

interface State {
  /** The current stay candidate: where readings have stayed close. */
  anchor: (Point & { since: number; metersAt: number; speedsAt: number }) | null;
  /** The trip since the last stay ended. */
  trip: { from: Coordinates | null; startAt: number; meters: number; speeds: number[] } | null;
  last: Point | null;
}

const EMPTY: Learnt = { places: [], pending: { paces: [], trips: [] } };

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

/** Every change goes through here, one at a time: batches can overlap. */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.catch(() => undefined);
  return next;
}

const listeners = new Set<(learnt: Learnt) => void>();
function told(learnt: Learnt) {
  listeners.forEach((listener) => listener(learnt));
}

export function watchLearnt(listener: (learnt: Learnt) => void): () => void {
  listeners.add(listener);
  void readJson(LEARNT_KEY, EMPTY).then(listener);
  return () => {
    listeners.delete(listener);
  };
}

function dateKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The nights and working days a stay from `since` to `until` covers. */
function coverage(since: number, until: number): { nights: string[]; workdays: string[] } {
  const nights = new Set<string>();
  const work = new globalThis.Map<string, number>();
  const step = 15 * 60_000;
  for (let at = since; at < until; at += step) {
    const d = new Date(at);
    const hour = d.getHours();
    if (hour === 3) {
      nights.add(dateKey(at));
    }
    const weekday = d.getDay();
    if (weekday >= 1 && weekday <= 5 && hour >= 9 && hour < 18) {
      work.set(dateKey(at), (work.get(dateKey(at)) ?? 0) + Math.min(step, until - at));
    }
  }
  return {
    nights: [...nights],
    workdays: [...work].filter(([, ms]) => ms >= 2 * 3_600_000).map(([day]) => day),
  };
}

function median(sorted: number[]): number {
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

/** Walking, cycling, or something this does not learn from. */
function classify(speeds: number[]): 'walking' | 'cycling' | null {
  const moving = speeds.filter((v) => v > 0.4).sort((a, b) => a - b);
  if (moving.length < 8) {
    return null;
  }
  const mid = median(moving);
  const high = moving[Math.floor(moving.length * 0.95)];
  if (mid >= 0.7 && mid <= 2.2 && high < 3.5) {
    return 'walking';
  }
  if (mid >= 3 && mid <= 7 && high <= 10) {
    return 'cycling';
  }
  return null;
}

function addStay(places: FrequentPlace[], at: Coordinates, since: number, until: number): FrequentPlace[] {
  const { nights, workdays } = coverage(since, until);
  const minutes = Math.round((until - since) / 60_000);
  const near = places
    .map((p) => ({ p, d: distanceMeters(p.coordinates, at) }))
    .filter(({ d }) => d <= PLACE_MERGE_M)
    .sort((a, b) => a.d - b.d)[0]?.p;
  if (near) {
    // The centre drifts towards where time is spent.
    const w = minutes / (near.minutes + minutes || 1);
    const merged: FrequentPlace = {
      ...near,
      coordinates: {
        latitude: near.coordinates.latitude + (at.latitude - near.coordinates.latitude) * w,
        longitude: near.coordinates.longitude + (at.longitude - near.coordinates.longitude) * w,
      },
      visits: near.visits + 1,
      minutes: near.minutes + minutes,
      nights: [...new Set([...near.nights, ...nights])].slice(-60),
      workdays: [...new Set([...near.workdays, ...workdays])].slice(-60),
      lastAt: until,
    };
    return places.map((p) => (p === near ? merged : p));
  }
  const fresh: FrequentPlace = {
    id: `${Math.round(since / 1000).toString(36)}`,
    coordinates: at,
    visits: 1,
    minutes,
    nights,
    workdays,
    lastAt: until,
  };
  return [...places, fresh]
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, PLACES_MAX);
}

/** One batch of readings from the task. */
function handle(readings: Location.LocationObject[]): Promise<void> {
  return serial(async () => {
    const state = await readJson<State>(STATE_KEY, { anchor: null, trip: null, last: null });
    let learnt = await readJson(LEARNT_KEY, EMPTY);
    let changed = false;

    for (const reading of readings) {
      const accuracy = reading.coords.accuracy ?? 999;
      if (accuracy > ACCURACY_MAX_M) {
        continue;
      }
      const point: Point = {
        latitude: reading.coords.latitude,
        longitude: reading.coords.longitude,
        at: reading.timestamp,
      };
      const last = state.last;
      if (last && point.at <= last.at) {
        continue;
      }
      const step = last ? distanceMeters(last, point) : 0;

      // A long silence somewhere else: nothing is known about the way.
      if (last && point.at - last.at > GAP_MAX_MS && step > STAY_RADIUS_M) {
        state.trip = null;
        state.anchor = null;
      }

      if (state.trip) {
        state.trip.meters += step;
        const gps = reading.coords.speed;
        const speed =
          gps != null && gps >= 0 ? gps : last ? step / Math.max(1, (point.at - last.at) / 1000) : 0;
        state.trip.speeds.push(Math.round(speed * 10) / 10);
        if (state.trip.speeds.length > SPEEDS_MAX) {
          // Every other one: the shape of the trip stays, the size halves.
          state.trip.speeds = state.trip.speeds.filter((_, i) => i % 2 === 0);
          if (state.anchor) {
            state.anchor.speedsAt = Math.floor(state.anchor.speedsAt / 2);
          }
        }
      }

      if (state.anchor && distanceMeters(state.anchor, point) <= STAY_RADIUS_M) {
        state.anchor.at = point.at;
      } else {
        const anchor = state.anchor;
        // No reading arrives while still (distance filter): the stay lasted
        // until the first reading outside it.
        if (anchor && point.at - anchor.since >= STAY_MIN_MS) {
          const here = { latitude: anchor.latitude, longitude: anchor.longitude };
          learnt = { ...learnt, places: addStay(learnt.places, here, anchor.since, point.at) };
          const trip = state.trip;
          if (trip?.from) {
            const ms = anchor.since - trip.startAt;
            const meters = anchor.metersAt;
            const mode = classify(trip.speeds.slice(0, anchor.speedsAt));
            const paces = [...learnt.pending.paces];
            const trips = [...learnt.pending.trips];
            if (mode && ms >= PACE_TRIP_MIN_MS && meters >= PACE_TRIP_MIN_M) {
              const model = mode === 'walking' ? WALK_MODEL_MS : CYCLE_MODEL_MS;
              const factor = ms / 1000 / (meters / model);
              if (factor >= 0.5 && factor <= 2.5) {
                paces.push({ key: mode, factor: Math.round(factor * 100) / 100 });
              }
            }
            if (distanceMeters(trip.from, here) > STAY_RADIUS_M * 3) {
              trips.push({ from: trip.from, to: here, at: trip.startAt });
            }
            learnt = {
              ...learnt,
              pending: { paces: paces.slice(-PENDING_MAX), trips: trips.slice(-PENDING_MAX) },
            };
          }
          state.trip = { from: here, startAt: point.at, meters: 0, speeds: [] };
        } else if (!state.trip) {
          // The first movement seen, from nowhere known.
          state.trip = { from: null, startAt: point.at, meters: 0, speeds: [] };
        }
        state.anchor = {
          ...point,
          since: point.at,
          metersAt: state.trip.meters,
          speedsAt: state.trip.speeds.length,
        };
        changed = true;
      }
      state.last = point;
    }

    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state)).catch(() => undefined);
    if (changed) {
      await AsyncStorage.setItem(LEARNT_KEY, JSON.stringify(learnt)).catch(() => undefined);
      told(learnt);
    }
  });
}

/**
 * Defined when the file loads, like the navigation task: Android may start the
 * app headless just to hand it readings.
 */
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LEARNING_TASK,
  async ({ data, error }) => {
    if (error || !data?.locations?.length) {
      return;
    }
    await handle(data.locations).catch(() => undefined);
  },
);

/** What the app has not applied yet; emptied as it is taken. */
export function takePending(): Promise<Learnt['pending']> {
  return serial(async () => {
    const learnt = await readJson(LEARNT_KEY, EMPTY);
    if (!learnt.pending.paces.length && !learnt.pending.trips.length) {
      return learnt.pending;
    }
    const next = { ...learnt, pending: { paces: [], trips: [] } };
    await AsyncStorage.setItem(LEARNT_KEY, JSON.stringify(next)).catch(() => undefined);
    told(next);
    return learnt.pending;
  });
}

/** Forgets every place, every pending observation and the trip under way. */
export function forgetLearnt(): Promise<void> {
  return serial(async () => {
    await AsyncStorage.multiRemove([LEARNT_KEY, STATE_KEY]).catch(() => undefined);
    told(EMPTY);
  });
}

/** A frequent place that looks like Home, and one that looks like Work. */
export function guessHomeWork(places: FrequentPlace[]): {
  home: FrequentPlace | null;
  work: FrequentPlace | null;
} {
  const home =
    [...places].sort((a, b) => b.nights.length - a.nights.length)[0] ?? null;
  const isHome = home && home.nights.length >= HOME_MIN_NIGHTS ? home : null;
  const work =
    [...places]
      .filter(
        (p) =>
          p !== isHome &&
          (!isHome || distanceMeters(p.coordinates, isHome.coordinates) > WORK_FROM_HOME_MIN_M),
      )
      .sort((a, b) => b.workdays.length - a.workdays.length)[0] ?? null;
  return { home: isHome, work: work && work.workdays.length >= WORK_MIN_DAYS ? work : null };
}

/**
 * Asks for "Allow all the time". On Android 11 and later the system shows its
 * own settings page for it; the answer counts only once granted.
 */
export async function askBackgroundPermission(): Promise<boolean> {
  try {
    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) {
      const asked = await Location.requestForegroundPermissionsAsync();
      if (!asked.granted) {
        return false;
      }
    }
    const current = await Location.getBackgroundPermissionsAsync();
    if (current.granted) {
      return true;
    }
    return (await Location.requestBackgroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

async function hasBackgroundPermission(): Promise<boolean> {
  try {
    return (await Location.getBackgroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Puts the task where it should be: running when wanted, permitted and not
 * paused (navigation and transport trips have their own service, and
 * navigation already measures the pace), stopped otherwise. Called with the
 * app on screen — Android only lets a foreground service start from there.
 */
export async function syncLearning(wanted: boolean, paused: boolean): Promise<void> {
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(LEARNING_TASK).catch(() => false);
    const run = wanted && !paused && (await hasBackgroundPermission());
    if (run && !running) {
      await Location.startLocationUpdatesAsync(LEARNING_TASK, {
        // GPS, not Wi-Fi and cell towers: speeds need it. The distance filter
        // keeps it to a reading every few dozen metres while moving and next
        // to none while still.
        accuracy: Location.Accuracy.High,
        distanceInterval: 30,
        timeInterval: 20_000,
        deferredUpdatesInterval: 60_000,
        pausesUpdatesAutomatically: true,
        foregroundService: {
          notificationTitle: t().learning.serviceTitle,
          notificationBody: t().learning.serviceBody,
          // It is meant to outlive the app: that is the point of it. The
          // notification says what it is, and the setting turns it off.
          killServiceOnDestroy: false,
        },
      });
    } else if (!run && running) {
      await Location.stopLocationUpdatesAsync(LEARNING_TASK);
    }
    if (!wanted) {
      // The trip under way is dropped too: turned off means nothing is kept
      // half-way.
      await AsyncStorage.removeItem(STATE_KEY).catch(() => undefined);
    }
  } catch {
    // A phone that refuses the service: nothing is learnt, nothing breaks.
  }
}
