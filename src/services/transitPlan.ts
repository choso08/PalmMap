import { t } from '../i18n';
import {
  ensureFeedsFor,
  planScheduledTransfers,
  planScheduledRaptor,
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
import { isOnline } from './network';
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

/**
 * When the trip is: leaving now, leaving at a time, or arriving by a time —
 * the choice Maps offers under "Leave now" (author's request, November 2026).
 */
export type TransitWhen =
  | { kind: 'now' }
  | { kind: 'depart'; at: number }
  | { kind: 'arrive'; at: number };

export const LEAVE_NOW: TransitWhen = { kind: 'now' };

/** How long a plan is reused: buses move, a plan older than this is stale. */
const PLAN_FRESH_MS = 2 * 60 * 1000;

/** For "arrive by", trips are looked for from this long before the time. */
const ARRIVE_LOOKBACK_S = 2 * 3600;

const plans = new Map<string, { at: number; plan: Promise<TransitPlan> }>();

/** About 10 m: the same origin and destination, give or take a GPS wobble. */
function keyOf(origin: Coordinates, destination: Coordinates, when: TransitWhen): string {
  return [origin.latitude, origin.longitude, destination.latitude, destination.longitude]
    .map((n) => n.toFixed(4))
    .concat(when.kind === 'now' ? ['now'] : [when.kind, String(Math.round(when.at / 60))])
    // Offline and online plans differ: one has the live buses.
    .concat(isOnline() ? [] : ['offline'])
    .join(',');
}

export function planTransit(
  origin: Coordinates,
  destination: Coordinates,
  when: TransitWhen = LEAVE_NOW,
): Promise<TransitPlan> {
  const key = keyOf(origin, destination, when);
  const kept = plans.get(key);
  if (kept && Date.now() - kept.at < PLAN_FRESH_MS) {
    return kept.plan;
  }
  const plan = compute(origin, destination, when);
  plans.set(key, { at: Date.now(), plan });
  // A failure is not kept: the next ask tries again.
  void plan.then((p) => {
    if (p.error && p.trips.length === 0) {
      plans.delete(key);
    }
  });
  return plan;
}

/** The lines of a trip, in order: "3601>Fertagus>732". */
function signature(trip: TransitTrip): string {
  return [trip.line, ...changesOf(trip).map((c) => c.line)].join('>');
}

/**
 * One copy of each trip. The same journey comes from more than one planner
 * (direct, one change, RAPTOR), and a Carris Metropolitana bus from its live
 * arrivals and from its stored timetable: the live one wins, then the first.
 */
function unique(trips: TransitTrip[]): TransitTrip[] {
  const sorted = [...trips].sort((a, b) => Number(b.live) - Number(a.live));
  const kept: TransitTrip[] = [];
  for (const trip of sorted) {
    const sig = signature(trip);
    const twin = kept.some(
      (k) =>
        signature(k) === sig &&
        Math.abs(k.departsAt - trip.departsAt) <= (k.live || trip.live ? 600 : 60),
    );
    if (!twin) {
      kept.push(trip);
    }
  }
  return kept;
}

async function compute(
  origin: Coordinates,
  destination: Coordinates,
  when: TransitWhen,
): Promise<TransitPlan> {
  const nowUnix = Date.now() / 1000;
  // From when trips are looked for. For "arrive by", a while before the time,
  // and the ones that arrive in time are kept below.
  const startAt =
    when.kind === 'depart'
      ? Math.max(nowUnix, when.at)
      : when.kind === 'arrive'
        ? Math.max(nowUnix, when.at - ARRIVE_LOOKBACK_S)
        : nowUnix;
  const startDate = new Date(startAt * 1000);

  // The area's timetables (metro, train, Carris de Lisboa…) download by
  // themselves the first time a trip is planned there, as when the transport
  // map opens: without them a trip in central Lisbon, where Carris
  // Metropolitana has no stops, answered "no stops nearby" (author's photo).
  // Already there, this asks nothing.
  if (isOnline()) {
    await Promise.all([ensureFeedsFor(origin), ensureFeedsFor(destination)]).catch(() => undefined);
  }

  // The stored timetables first: they answer even with the bus service down.
  // Direct, one change, and up to three changes (`planScheduledRaptor`).
  let stored: TransitTrip[] = [];
  try {
    const direct = planScheduledTrips(origin, destination, 4, startDate);
    const best = direct[0]?.reachAt ?? Infinity;
    const changing = planScheduledTransfers(origin, destination, 4, startDate).filter(
      (trip) => direct.length < 2 || trip.reachAt < best,
    );
    const several = await planScheduledRaptor(origin, destination, startAt).catch(() => []);
    stored = [...direct, ...changing, ...several];
  } catch {
    // A broken timetable must not stop the buses from showing.
  }

  // Nothing slower than walking the whole way (`beatsWalking`), counted from
  // when one sets off; for "arrive by", only what gets there in time, the
  // latest departure first.
  const walking = (trip: TransitTrip) =>
    beatsWalking(trip, origin, destination, when.kind === 'arrive' ? trip.leaveAt : startAt);
  const finish = (all: TransitTrip[]) => {
    const kept = unique(all).filter(walking);
    if (when.kind === 'arrive') {
      return kept
        .filter((trip) => trip.reachAt <= when.at + 60)
        .sort((a, b) => b.leaveAt - a.leaveAt);
    }
    return kept.sort((a, b) => a.reachAt - b.reachAt);
  };

  // Carris Metropolitana's arrivals are today's: for another day only the
  // stored timetables answer.
  //
  // **Offline, only the stored timetables** (author's request): Carris
  // Metropolitana's live arrivals cannot come, and its stored timetable —
  // when downloaded in Settings — answers in their place, like the trains'.
  const today = new Date(nowUnix * 1000).toDateString() === startDate.toDateString();
  if (!today || !isOnline()) {
    const trips = finish(stored);
    return {
      trips,
      error:
        trips.length === 0
          ? isOnline()
            ? t().errors.noTransitStops
            : t().errors.offlineNoTransit
          : null,
    };
  }

  try {
    const buses = await planBusTrips(origin, destination, 5, startAt);
    let trips = finish([...(buses ?? []), ...stored]);
    // Few answers: try a live bus with a stored timetable. Only then — each
    // way asks the arrivals of a dozen stops.
    let mixed: TransitTrip[] = [];
    if (trips.length < 2) {
      mixed = await mixedTrips(origin, destination, startAt).catch(() => []);
      trips = finish([...(buses ?? []), ...mixed, ...stored]);
    }
    return {
      trips,
      error: buses === null && trips.length === 0 ? t().errors.noTransitStops : null,
    };
  } catch (error) {
    const trips = finish(stored);
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
async function mixedTrips(
  origin: Coordinates,
  destination: Coordinates,
  at: number,
): Promise<TransitTrip[]> {
  // Too close for a change to be worth anything.
  if (distanceMeters(origin, destination) <= 2 * TRANSIT_WALK_MAX_M) {
    return [];
  }
  const out: TransitTrip[] = [];

  const when = new Date(at * 1000);
  const boardings = scheduledBoardingsTo(destination);
  const reached = scheduledReachedFrom(origin, destination, when);
  const [toRail, fromRail] = await Promise.all([
    busToPoints(origin, destination, boardings.points, at).catch(() => []),
    busFromPoints(origin, destination, reached.points).catch(() => []),
  ]);

  // Bus, then rail.
  const onward = scheduledOnward(
    toRail.map((half) => ({
      ref: boardings.refs[half.point],
      earliest: half.trip.arrivesAt + MIXED_CHANGE_S + half.walkMeters / WALK_SPEED_MS,
    })),
    destination,
    when,
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
