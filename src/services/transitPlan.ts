import { t } from '../i18n';
import {
  ensureFeedsFor,
  planScheduledTransfers,
  planScheduledTrips,
  scheduledBoardingsTo,
  scheduledOnward,
  scheduledReachedFrom,
} from './schedules';
import {
  beatsWalking,
  busFromPoints,
  busToPoints,
  changesOf,
  planBusTrips,
  type TransitTrip,
} from './transit';
import { distanceMeters } from '../utils/geometry';
import { TRANSIT_WALK_MAX_M } from './config';
import type { Coordinates } from '../types/geo';

/**
 * Every public transport option from one point to another: the stored
 * timetables (train, metro, ferry, Carris de Lisboa — at once, offline) and
 * Carris Metropolitana's buses (real time, through the network), in one list,
 * earliest arrival first, none slower than walking.
 *
 * **Asked as soon as a destination is chosen, whatever the mode** (author's
 * request, November 2026): the transport chip shows its time like car, bike
 * and walking do, and switching to it shows the trips at once. The answer is
 * kept for `PLAN_FRESH_MS`, so that switch asks nothing again.
 */
export interface TransitPlan {
  trips: TransitTrip[];
  /** Why there are none, when there are none and something failed. */
  error: string | null;
}

/** How long a plan is reused: buses move, a plan older than this is stale. */
const PLAN_FRESH_MS = 2 * 60 * 1000;

const plans = new Map<string, { at: number; plan: Promise<TransitPlan> }>();

/** About 10 m: the same origin and destination, give or take a GPS wobble. */
function keyOf(origin: Coordinates, destination: Coordinates): string {
  return [origin.latitude, origin.longitude, destination.latitude, destination.longitude]
    .map((n) => n.toFixed(4))
    .join(',');
}

export function planTransit(origin: Coordinates, destination: Coordinates): Promise<TransitPlan> {
  const key = keyOf(origin, destination);
  const kept = plans.get(key);
  if (kept && Date.now() - kept.at < PLAN_FRESH_MS) {
    return kept.plan;
  }
  const plan = compute(origin, destination);
  plans.set(key, { at: Date.now(), plan });
  // A failure is not kept: the next ask tries again.
  void plan.then((p) => {
    if (p.error && p.trips.length === 0) {
      plans.delete(key);
    }
  });
  return plan;
}

async function compute(origin: Coordinates, destination: Coordinates): Promise<TransitPlan> {
  // The area's timetables (metro, train, Carris de Lisboa…) download by
  // themselves the first time a trip is planned there, as when the transport
  // map opens: without them a trip in central Lisbon, where Carris
  // Metropolitana has no stops, answered "no stops nearby" (author's photo).
  // Already there, this asks nothing.
  await Promise.all([ensureFeedsFor(origin), ensureFeedsFor(destination)]);

  // The stored timetable first: it answers even with the bus service down.
  let stored: TransitTrip[] = [];
  try {
    const direct = planScheduledTrips(origin, destination);
    // With one change (Azul to Verde, metro to train): most journeys in
    // Lisbon need one. Offered when there are few direct trips, or when
    // changing gets there sooner than the best of them.
    const best = direct[0]?.reachAt ?? Infinity;
    const changing = planScheduledTransfers(origin, destination).filter(
      (trip) => direct.length < 2 || trip.reachAt < best,
    );
    stored = [...direct, ...changing];
  } catch {
    // A broken timetable must not stop the buses from showing.
  }

  // Earliest arrival first, wherever it comes from, and nothing that arrives
  // after one could have walked there (`beatsWalking`).
  const merge = (others: TransitTrip[]) =>
    [...others, ...stored]
      .filter((trip) => beatsWalking(trip, origin, destination))
      .sort((a, b) => a.reachAt - b.reachAt);

  try {
    const buses = await planBusTrips(origin, destination);
    let trips = merge(buses ?? []);
    // Few answers: try a bus and a train, metro or Carris de Lisboa bus
    // together. Only then — each way asks the arrivals of a dozen stops.
    if (trips.length < 2) {
      const mixed = await mixedTrips(origin, destination).catch(() => []);
      trips = merge([...(buses ?? []), ...mixed]);
    }
    return {
      trips,
      error: buses === null && trips.length === 0 ? t().errors.noTransitStops : null,
    };
  } catch (error) {
    const trips = merge([]);
    // The message says what really failed — the service answering with a
    // number, taking too long or the network down.
    return {
      trips,
      error:
        trips.length > 0
          ? null
          : error instanceof Error
            ? error.message
            : t().errors.schedulesFailed,
    };
  }
}


/** The walk between a bus stop and a station, at the planner's pace. */
const WALK_SPEED_MS = 1.35;
/** Minimum time to change, on top of the walk, in seconds. */
const MIXED_CHANGE_S = 180;

function joined(first: TransitTrip, second: TransitTrip, walkMeters: number): TransitTrip {
  return {
    tripId: `${first.tripId}>${second.tripId}`,
    kind: first.kind,
    line: first.line,
    headsign: first.headsign,
    from: first.from,
    to: second.to,
    departsAt: first.departsAt,
    arrivesAt: second.arrivesAt,
    leaveAt: first.leaveAt,
    reachAt: second.reachAt,
    stops: first.stops + second.stops,
    live: first.live,
    ride: first.ride,
    change: {
      at: first.to,
      boardAt: second.from,
      walkMeters,
      arrivesAt: first.arrivesAt,
      kind: second.kind,
      line: second.line,
      headsign: second.headsign,
      departsAt: second.departsAt,
      ride: second.ride,
    },
  };
}

/**
 * Trips with one change between a Carris Metropolitana bus (live) and a
 * stored timetable (metro, train, ferry, Carris de Lisboa) — both ways round:
 * bus then rail (Caparica → Marquês by bus, then the metro: the author's
 * Estefânia trip), and rail then bus. The best per pair of lines.
 */
async function mixedTrips(origin: Coordinates, destination: Coordinates): Promise<TransitTrip[]> {
  // Too close for a change to be worth anything.
  if (distanceMeters(origin, destination) <= 2 * TRANSIT_WALK_MAX_M) {
    return [];
  }
  const out: TransitTrip[] = [];

  const boardings = scheduledBoardingsTo(destination);
  const reached = scheduledReachedFrom(origin, destination);
  const [toRail, fromRail] = await Promise.all([
    busToPoints(origin, destination, boardings.points).catch(() => []),
    busFromPoints(origin, destination, reached.points).catch(() => []),
  ]);

  // Bus, then rail.
  const onward = scheduledOnward(
    toRail.map((half) => ({
      ref: boardings.refs[half.point],
      earliest: half.trip.arrivesAt + MIXED_CHANGE_S + half.walkMeters / WALK_SPEED_MS,
    })),
    destination,
  );
  toRail.forEach((half, i) => {
    const second = onward[i];
    if (second) {
      out.push(joined(half.trip, second, half.walkMeters));
    }
  });

  // Rail, then bus. `busFromPoints` already kept only buses leaving after the
  // train arrives plus the walk.
  for (const half of fromRail) {
    out.push(joined(reached.legs[half.point], half.trip, half.walkMeters));
  }

  // The best per pair of lines.
  const byPair = new Map<string, TransitTrip>();
  for (const trip of out.sort((a, b) => a.reachAt - b.reachAt)) {
    const key = [trip.line, ...changesOf(trip).map((c) => c.line)].join('>');
    if (!byPair.has(key)) {
      byPair.set(key, trip);
    }
  }
  return [...byPair.values()].slice(0, 4);
}
