import { CARRIS_LISBOA_FEED_ID } from './config';
import { scheduledRouteId } from './schedules';
import { bareId, vehicleProgress, vehicleTrip, type VehicleTrip } from './transit';
import type { RideLeg } from './transitGuide';
import { liveVehicles, metropolitanaVehiclesRecent, type LiveVehicle } from './vehicles';
import type { Coordinates } from '../types/geo';
import { distanceMeters } from '../utils/geometry';

/**
 * The bus of the ride one is taking, live, for the map during a transport trip
 * (author's request, 23 November 2026: "at least my bus on the map"), on any
 * map type.
 *
 * The vehicle is found among the operator's live ones by its line — Carris
 * Metropolitana's pattern, or the stored timetable's `route_id` for Carris de
 * Lisboa and other GTFS-RT feeds — and then:
 *
 * - **on board**: the one nearest the person (within `ON_BOARD_M`);
 * - **before boarding**: the one that has not passed the boarding stop yet and
 *   has the fewest stops to go to it, each placed on its way with
 *   `vehicleProgress` — the bus that will come, not the one that just left.
 *
 * The one chosen last time is kept while it still qualifies, so the map does
 * not jump between two buses of the same line.
 */

/** A bus within this of the person, on a ride under way, is theirs. */
const ON_BOARD_M = 250;
/** A stop of the vehicle's way within this of the boarding stop is that stop. */
const SAME_STOP_M = 60;
/** At most this many candidates are placed on their way (each may load a pattern). */
const MAX_CANDIDATES = 8;
/** Carris Metropolitana's list, shared with the map's and the stop panel's. */
const LIST_MAX_AGE_MS = 12000;

/** Whether this ride has a live feed the app can ask. */
export function rideHasLiveVehicles(leg: RideLeg): boolean {
  return leg.ride !== undefined;
}

async function candidatesFor(leg: RideLeg): Promise<LiveVehicle[]> {
  const ref = leg.ride;
  if (!ref) {
    return [];
  }
  if (ref.source === 'carris') {
    const pattern = bareId(ref.patternId);
    const list = await metropolitanaVehiclesRecent(LIST_MAX_AGE_MS);
    return list.filter((v) => v.patternId !== null && bareId(v.patternId) === pattern);
  }
  const routeId = scheduledRouteId(ref);
  if (!routeId) {
    return [];
  }
  const operator = ref.feedId === CARRIS_LISBOA_FEED_ID ? 'cl' : ref.feedId;
  const list = await liveVehicles({ [operator]: true });
  return list.filter((v) => v.operator === operator && v.routeId === routeId);
}

/** Stops of a vehicle's way that are the boarding stop. */
function boardingIndices(trip: VehicleTrip, boarding: Coordinates): number[] {
  const out: number[] = [];
  trip.stops.forEach((s, i) => {
    if (distanceMeters(s.coordinates, boarding) <= SAME_STOP_M) {
      out.push(i);
    }
  });
  return out;
}

/**
 * The ride's vehicle now, or null when none can be told. `onBoard` says the
 * ride has begun; `me` is where the person is.
 */
export async function findRideVehicle(
  leg: RideLeg,
  onBoard: boolean,
  me: Coordinates | null,
  keptId: string | null,
): Promise<LiveVehicle | null> {
  const candidates = await candidatesFor(leg);
  if (candidates.length === 0) {
    return null;
  }
  if (onBoard && me) {
    let best: LiveVehicle | null = null;
    let bestM = ON_BOARD_M;
    for (const v of candidates) {
      // The bus kept from before wins a near tie: a second one of the same
      // line passing close by is not a reason to switch.
      const m = distanceMeters(v.coordinates, me) - (v.id === keptId ? 60 : 0);
      if (m <= bestM) {
        bestM = m;
        best = v;
      }
    }
    if (best) {
      return best;
    }
  }

  const boarding = leg.stops[0]?.coordinates;
  if (!boarding) {
    return null;
  }
  // The kept one first, then the nearest to the boarding stop.
  const ordered = [...candidates].sort((a, b) => {
    if (a.id === keptId) return -1;
    if (b.id === keptId) return 1;
    return distanceMeters(a.coordinates, boarding) - distanceMeters(b.coordinates, boarding);
  });
  let best: { vehicle: LiveVehicle; stopsAway: number } | null = null;
  for (const v of ordered.slice(0, MAX_CANDIDATES)) {
    let trip: VehicleTrip;
    try {
      trip = await vehicleTrip(v);
    } catch {
      continue;
    }
    const at = boardingIndices(trip, boarding);
    if (at.length === 0) {
      continue;
    }
    const progress = vehicleProgress(trip, v);
    // Of the passes by the boarding stop (a circular line has two), the next one.
    const ahead = at
      .map((i) =>
        progress.atIndex === i ? 0 : i >= progress.nextIndex ? i - progress.nextIndex + 1 : -1,
      )
      .filter((n) => n >= 0);
    if (ahead.length === 0) {
      continue;
    }
    const stopsAway = Math.min(...ahead);
    if (!best || stopsAway < best.stopsAway) {
      best = { vehicle: v, stopsAway };
    }
  }
  return best?.vehicle ?? null;
}
