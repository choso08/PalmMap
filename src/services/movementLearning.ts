import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { requireOptionalNativeModule } from 'expo';

import { t } from '../i18n';
import type { Coordinates } from '../types/geo';
import { distanceMeters } from '../utils/geometry';
import { LEARNING_TASK } from './config';
import { requestPermission, setBeforeNavigationStart, whenNavigationServiceIdle } from './location';

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

/** What is kept: places, and what still has to reach the app. Never in the automatic copy. */
const LEARNT_KEY = 'palmmap.aprendizagem';
/** The trip under way and the current stay candidate. Never in the automatic copy. */
const STATE_KEY = 'palmmap.aprendizagem.estado';

const STAY_RADIUS_M = 100;
const STAY_MIN_MS = 10 * 60_000;
const PLACE_MERGE_M = 120;
const PLACES_MAX = 30;
/** A reading worse than this says nothing about speed or a stay's edge. */
const ACCURACY_MAX_M = 60;
/** A gap this long with the person elsewhere: the trip is not known. */
const GAP_MAX_MS = 30 * 60_000;
/**
 * …unless the first reading after the gap is this close: then the person was
 * still (no reading comes while still) and has just left — by car or bus the
 * first reading is already a few hundred metres off. Farther, the gap was a
 * trip without GPS (a tunnel, the metro, the phone off) and no stay is made of
 * its start.
 */
const GAP_DEPARTURE_MAX_M = 1500;
/** GPS altitude moves this much before a climb is counted: it is noisy. */
const CLIMB_STEP_M = 8;
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
  /** Metres climbed on the way, from the GPS altitude (rough). */
  climb?: number;
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
  trip: {
    from: Coordinates | null;
    startAt: number;
    meters: number;
    speeds: number[];
    /** Metres climbed so far, and the altitude the next climb counts from. */
    climb?: number;
    altitude?: number | null;
  } | null;
  last: Point | null;
}

const EMPTY: Learnt = { places: [], pending: { paces: [], trips: [] } };

/**
 * **Everything this file stores is sealed** (author: "it has to be
 * bulletproof"): AES-GCM with a key that lives only in Android's Keystore
 * (`VaultModule.kt`). Without the module (an older build) or if sealing fails,
 * nothing is stored at all — never the clear text.
 */
const vault = requireOptionalNativeModule<{
  seal(text: string): string;
  open(sealed: string): string | null;
  destroy(): boolean;
}>('PalmMapVault');

export function canLearn(): boolean {
  return vault != null;
}

/** The stored value could not be read this time: nothing is written on top. */
class Unreadable extends Error {}

/** Reads that failed in a row; past `UNREADABLE_GIVE_UP` the value is lost for good. */
let unreadable = 0;
const UNREADABLE_GIVE_UP = 5;

/**
 * Reads a sealed value: `fallback` when nothing is stored. **A value that is
 * stored but cannot be read now throws** (`Unreadable`) instead of passing for
 * an empty one — taken as empty, the batch then wrote one new stay over every
 * place learnt (code review, 19 November 2026). Only after several failures in
 * a row (the key gone for good, e.g. a phone restored from another) is it
 * given up as empty.
 */
async function readJson<T>(key: string, fallback: T): Promise<T> {
  if (!vault) {
    return fallback;
  }
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(key);
  } catch {
    throw new Unreadable(key);
  }
  if (!raw) {
    return fallback;
  }
  let text: string | null = null;
  try {
    text = vault.open(raw);
  } catch {
    text = null;
  }
  if (text) {
    try {
      const value = { ...fallback, ...(JSON.parse(text) as T) };
      unreadable = 0;
      return value;
    } catch {
      // A sealed text that is not JSON: corrupt for good.
      return fallback;
    }
  }
  unreadable += 1;
  if (unreadable >= UNREADABLE_GIVE_UP) {
    return fallback;
  }
  throw new Unreadable(key);
}

/** Writes a sealed value; if it cannot be sealed, what was stored stays (sealed). */
async function writeJson(key: string, value: unknown): Promise<void> {
  let sealed = '';
  try {
    sealed = vault?.seal(JSON.stringify(value)) ?? '';
  } catch {
    sealed = '';
  }
  if (!sealed) {
    // Not sealed, not kept — and never the clear text.
    return;
  }
  await AsyncStorage.setItem(key, sealed).catch(() => undefined);
}

/** What is older than this is forgotten: a habit not seen in 3 months is not one. */
const KEEP_DAYS = 90;

function pruned(learnt: Learnt, now: number): Learnt {
  const oldest = now - KEEP_DAYS * 86_400_000;
  const since = dateKey(oldest);
  return {
    ...learnt,
    places: learnt.places
      .filter((p) => p.lastAt >= oldest)
      .map((p) => ({
        ...p,
        nights: p.nights.filter((d) => d >= since),
        workdays: p.workdays.filter((d) => d >= since),
      })),
  };
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
  void readJson(LEARNT_KEY, EMPTY)
    .catch(() => EMPTY)
    .then(listener);
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

      // A long silence and then far away: nothing is known about the way, and
      // no stay is made of where the silence began. A long silence and then a
      // reading just outside it is the normal end of a stay (nothing comes
      // while still) — left to the stay check below: nulled here, every stay
      // left by car or bus was lost.
      const silent = last != null && point.at - last.at > GAP_MAX_MS;
      if (silent && step > GAP_DEPARTURE_MAX_M) {
        state.trip = null;
        state.anchor = null;
      }

      if (state.trip) {
        const trip = state.trip;
        const altitude = reading.coords.altitude;
        if (altitude != null && Number.isFinite(altitude)) {
          if (trip.altitude == null) {
            trip.altitude = altitude;
          } else if (altitude - trip.altitude >= CLIMB_STEP_M) {
            trip.climb = (trip.climb ?? 0) + (altitude - trip.altitude);
            trip.altitude = altitude;
          } else if (trip.altitude - altitude >= CLIMB_STEP_M) {
            trip.altitude = altitude;
          }
        }
      }

      if (state.trip && !silent) {
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
                paces.push({
                  key: mode,
                  factor: Math.round(factor * 100) / 100,
                  climb: Math.round(trip.climb ?? 0),
                });
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

    await writeJson(STATE_KEY, state);
    if (changed) {
      learnt = pruned(learnt, Date.now());
      await writeJson(LEARNT_KEY, learnt);
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
    await writeJson(LEARNT_KEY, next);
    told(next);
    return learnt.pending;
  });
}

/**
 * Forgets every place, every pending observation and the trip under way — and
 * destroys the key, so even a copy of the old sealed text made before can
 * never be opened again.
 */
export function forgetLearnt(): Promise<void> {
  return serial(async () => {
    await AsyncStorage.multiRemove([LEARNT_KEY, STATE_KEY]).catch(() => undefined);
    try {
      vault?.destroy();
    } catch {
      // Already gone.
    }
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
    // Through location.ts, which keeps to one permission request at a time
    // (two at once crash a release build).
    if (!(await requestPermission())) {
      return false;
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
export function syncLearning(wanted: boolean, paused: boolean): Promise<void> {
  // The latest wish wins, and syncs run one at a time: two overlapping ones
  // (one stopping, one starting) could leave the task stopped.
  desired = { wanted, paused };
  const next = syncing.then(applyDesired, applyDesired);
  syncing = next.catch(() => undefined);
  return next;
}

let desired = { wanted: false, paused: false };
let syncing: Promise<unknown> = Promise.resolve();

async function applyDesired(): Promise<void> {
  try {
    let { wanted, paused } = desired;
    let run = wanted && !paused && canLearn() && (await hasBackgroundPermission());
    if (run) {
      // Not while navigation's service is still to stop: its stop would take
      // the shared foreground service with it (`whenNavigationServiceIdle`).
      await whenNavigationServiceIdle();
      ({ wanted, paused } = desired);
      run = wanted && !paused && run;
    }
    const running = await Location.hasStartedLocationUpdatesAsync(LEARNING_TASK).catch(() => false);
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

/**
 * Before navigation starts its service, learning's is stopped and the stop
 * waited for: done the other way round, learning's stop took the shared
 * foreground service from navigation (`location.ts`).
 */
setBeforeNavigationStart(async () => {
  desired = { ...desired, paused: true };
  const stopped = syncing.then(async () => {
    if (await Location.hasStartedLocationUpdatesAsync(LEARNING_TASK).catch(() => false)) {
      await Location.stopLocationUpdatesAsync(LEARNING_TASK).catch(() => undefined);
    }
  });
  syncing = stopped.catch(() => undefined);
  // Never holding navigation up for long, whatever the queue is waiting for.
  await Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, 3000))]);
});

/** Whether "Allow all the time" is missing while learning is switched on. */
export async function learningNeedsPermission(): Promise<boolean> {
  return canLearn() && !(await hasBackgroundPermission());
}
