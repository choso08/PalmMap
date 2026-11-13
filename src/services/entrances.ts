import { localDoorsNear } from './localPois';
import { isOnline } from './network';
import { askOverpass, overpassSchedule } from './overpass';
import { ENTRANCE_WAIT_MS } from './config';
import type { Coordinates, Place } from '../types/geo';
import { distanceMeters } from '../utils/geometry';

/**
 * Where to arrive at a place: its door, not its middle (author's photo,
 * November 2026 — the walk to Almada Forum ended on the road behind the
 * building, where the routing engine had snapped the pin in the middle of the
 * roof).
 *
 * OpenStreetMap marks doors as `entrance=*` nodes on a building's outline. The
 * query takes the buildings (and malls, hospitals, monuments…) that contain the
 * place, the doors on or within 3 m of their outlines, and any door within 60 m
 * of the point — the last for a shop whose building has no name, so no area.
 * The door used is the one nearest to where one comes from, with the main one
 * preferred when it is not much further.
 *
 * **Offline too** (author's request): the country's business file carries
 * every door (`build-pois.py`), read by `localDoorsNear`.
 *
 * Only for walking, cycling and transport: a car goes to the car park, and a
 * pedestrian door may be the wrong side of the building for it.
 */
export interface Entrance {
  coordinates: Coordinates;
  main: boolean;
}

/** Doors that are no way in for a visitor. */
const NOT_A_WAY_IN = new Set(['service', 'emergency', 'exit', 'garage', 'staircase', 'no']);

/**
 * Offline, the doors come from the downloaded country's file, which knows the
 * doors but not whose building they are on: only those this close to the
 * place count.
 */
const LOCAL_DOORS_M = 150;

/** A main door wins over a nearer side door up to this many metres further. */
const MAIN_BONUS_M = 120;

/** Doors further than this from the place are someone else's. */
const ENTRANCE_MAX_M = 500;

const known = new Map<string, Promise<Entrance[]>>();

function keyOf(point: Coordinates): string {
  return `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
}

/** The downloaded country's doors near the point; empty without a file. */
function localEntrances(point: Coordinates): Entrance[] {
  return (localDoorsNear(point, LOCAL_DOORS_M) ?? []).map((d) => ({
    coordinates: { latitude: d.latitude, longitude: d.longitude },
    main: d.main,
  }));
}

/**
 * The place's doors: from Overpass with a network (it knows which building
 * each door is on), from the downloaded country with none — and from the
 * country too when Overpass fails or knows none. Only Overpass's answers are
 * kept: back online, it is asked.
 */
export async function findEntrances(point: Coordinates): Promise<Entrance[]> {
  if (!isOnline()) {
    return localEntrances(point);
  }
  const remote = await remoteEntrances(point);
  return remote.length > 0 ? remote : localEntrances(point);
}

function remoteEntrances(point: Coordinates): Promise<Entrance[]> {
  const key = keyOf(point);
  const kept = known.get(key);
  if (kept) {
    return kept;
  }
  const { latitude: lat, longitude: lon } = point;
  const tags = '"^(building|shop|amenity|tourism|leisure|healthcare|office|historic)$"~"."';
  const query = `[out:json][timeout:20];
is_in(${lat},${lon})->.a;
(way(pivot.a)[~${tags}];rel(pivot.a)[~${tags}];)->.p;
(way(r.p);.p;)->.p;
(node(around.p:3)[entrance];node(around:60,${lat},${lon})[entrance];);
out;`;
  const request = overpassSchedule(() => askOverpass(query))
    .then((data) =>
      (data.elements ?? [])
        .filter(
          (el) =>
            el.type === 'node' &&
            typeof el.lat === 'number' &&
            typeof el.lon === 'number' &&
            !NOT_A_WAY_IN.has(el.tags?.entrance ?? '') &&
            el.tags?.access !== 'private' &&
            el.tags?.access !== 'no',
        )
        .map((el) => ({
          coordinates: { latitude: el.lat as number, longitude: el.lon as number },
          main: el.tags?.entrance === 'main',
        }))
        .filter((e) => distanceMeters(e.coordinates, point) <= ENTRANCE_MAX_M),
    )
    .catch(() => {
      // A failure is not kept: the next ask tries again.
      known.delete(key);
      return [] as Entrance[];
    });
  known.set(key, request);
  return request;
}

/** The door to use coming from `from`, or null when there is none. */
export function bestEntrance(entrances: Entrance[], from: Coordinates): Entrance | null {
  let best: Entrance | null = null;
  let bestScore = Infinity;
  for (const e of entrances) {
    const score = distanceMeters(from, e.coordinates) - (e.main ? MAIN_BONUS_M : 0);
    if (score < bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The point to route to for a place: its best door coming from `from`, or the
 * place itself. Waits at most `ENTRANCE_WAIT_MS` — a slow Overpass must not
 * hold the route back; the place's own point then, as before. Dropped pins
 * (negative ids) are exact points the person chose and are left alone.
 */
export async function arrivalPoint(place: Place, from: Coordinates): Promise<Coordinates> {
  if (place.id < 0) {
    return place.coordinates;
  }
  const entrances = await Promise.race([
    findEntrances(place.coordinates),
    // Too slow: the country's doors, when downloaded, or none.
    new Promise<Entrance[]>((resolve) =>
      setTimeout(() => resolve(localEntrances(place.coordinates)), ENTRANCE_WAIT_MS),
    ),
  ]);
  return bestEntrance(entrances, from)?.coordinates ?? place.coordinates;
}
