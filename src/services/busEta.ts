import { distanceMeters } from '../utils/geometry';
import {
  bareId,
  clockOf,
  vehicleProgress,
  vehicleTrip,
  type TransitArrival,
  type VehicleTrip,
} from './transit';
import { metropolitanaVehiclesRecent, type LiveVehicle } from './vehicles';

/**
 * The service's estimate checked against where its bus really is.
 *
 * Author's report, 20 November 2026: a stop said "1 min, real time" and the
 * bus took 3. TML's `estimated_arrival` is worked out on their side and can
 * lag behind a bus stuck in traffic. The bus's own position is in
 * `/vehicles`, under the same `trip_id`: placed on its pattern
 * (`vehicleProgress`), the timetable says how long the rest of the way
 * normally takes from there. An estimate that would need the bus to do that
 * stretch much faster than the timetable — `PACE_FLOOR` of it — or faster
 * than `MAX_BUS_MS` on average is moved later.
 *
 * **Only ever later.** An estimate later than the position suggests is left
 * alone: the bus may wait at a terminal or a timing point, which the service
 * knows and the position does not, and showing it sooner could make someone
 * run for a bus that is not leaving.
 */
const PACE_FLOOR = 0.7;
/** Faster than this on average, stops included, a city bus does not go (40 km/h). */
const MAX_BUS_MS = 11;
/** Only buses due within this are looked for: further off, the position says little. */
const LOOK_AHEAD_S = 30 * 60;
/** A list of buses younger than this is reused (the map refreshes every 10–60 s). */
const VEHICLES_FRESH_MS = 25000;
/** Moved by less than this, the estimate is kept as it came. */
const MIN_SHIFT_S = 30;

/** Each bus's trip (pattern, stops, timetable), kept for the session. */
const trips = new Map<string, Promise<VehicleTrip | null>>();

function tripOf(v: LiveVehicle): Promise<VehicleTrip | null> {
  const key = `${v.patternId}|${v.tripId}`;
  let found = trips.get(key);
  if (!found) {
    found = vehicleTrip(v).catch(() => null);
    trips.set(key, found);
    if (trips.size > 60) {
      trips.delete(trips.keys().next().value as string);
    }
  }
  return found;
}

async function checked(
  arrival: TransitArrival,
  stopId: string,
  bus: LiveVehicle,
  now: number,
): Promise<TransitArrival> {
  const trip = await tripOf(bus);
  if (!trip) {
    return arrival;
  }
  const progress = vehicleProgress(trip, bus);
  const matches = (j: number) => trip.stops[j].id === stopId || trip.stops[j].ids?.includes(stopId);
  if (progress.atIndex >= 0 && matches(progress.atIndex)) {
    return { ...arrival, stopsAway: 0, busMeters: 0 };
  }
  let j = progress.nextIndex;
  while (j < trip.stops.length && !matches(j)) {
    j += 1;
  }
  if (j >= trip.stops.length) {
    // Not ahead of the bus: it has gone by, or the pattern does not match.
    return arrival;
  }

  let meters = distanceMeters(bus.coordinates, trip.stops[progress.nextIndex].coordinates);
  for (let k = progress.nextIndex + 1; k <= j; k += 1) {
    meters += distanceMeters(trip.stops[k - 1].coordinates, trip.stops[k].coordinates);
  }
  const stopsAway = j - progress.nextIndex + 1;

  let floor = bus.reportedAt + meters / MAX_BUS_MS;
  const eta = progress.etas[j - progress.nextIndex];
  if (typeof eta === 'number') {
    floor = Math.max(floor, bus.reportedAt + PACE_FLOOR * (eta - bus.reportedAt));
  }
  if (floor - arrival.unix < MIN_SHIFT_S) {
    return { ...arrival, stopsAway, busMeters: meters };
  }
  return {
    ...arrival,
    unix: floor,
    minutes: Math.max(0, Math.round((floor - now) / 60)),
    time: clockOf(floor),
    stopsAway,
    busMeters: meters,
    adjusted: true,
  };
}

/**
 * The arrivals at a stop with each real-time bus found on the map: how many
 * stops away it is, and its time moved later when the position says the
 * service's estimate cannot be met. Any failure leaves the list as it came.
 */
export async function withBusPositions(
  stopId: string,
  arrivals: TransitArrival[],
): Promise<TransitArrival[]> {
  const now = Date.now() / 1000;
  const wanted = (a: TransitArrival) => a.live && !!a.tripId && a.unix - now < LOOK_AHEAD_S;
  if (!arrivals.some(wanted)) {
    return arrivals;
  }
  let buses: LiveVehicle[];
  try {
    buses = await metropolitanaVehiclesRecent(VEHICLES_FRESH_MS);
  } catch {
    return arrivals;
  }
  const byTrip = new Map<string, LiveVehicle>();
  for (const v of buses) {
    if (v.operator === 'cm' && v.tripId) {
      byTrip.set(bareId(v.tripId), v);
    }
  }
  const out = await Promise.all(
    arrivals.map((a) => {
      const bus = wanted(a) ? byTrip.get(bareId(a.tripId as string)) : undefined;
      return bus ? checked(a, stopId, bus, now).catch(() => a) : Promise.resolve(a);
    }),
  );
  return out.sort((a, b) => a.unix - b.unix);
}
