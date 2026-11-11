import { t } from '../i18n';
import { planScheduledTransfers, planScheduledTrips } from './schedules';
import { beatsWalking, planBusTrips, type TransitTrip } from './transit';
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
    const trips = merge(buses ?? []);
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
