import axios from 'axios';

import {
  CARRIS_BASE_URL,
  CARRIS_MIN_INTERVAL_MS,
  CARRIS_STOPS_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  TRANSIT_WALK_MAX_M,
  USER_AGENT,
  WALK_DETOUR,
  WALK_SPEED_MS,
} from './config';
import { createRateLimiter } from './rateLimit';
import { t } from '../i18n';
import type { Coordinates } from '../types/geo';
import type { CarrisArrival, CarrisFacility, CarrisStop } from '../types/transit';
import { distanceMeters } from '../utils/geometry';

/**
 * Public transport stops and arrival times.
 *
 * ## What this covers, and what it does not
 *
 * The source is **Carris Metropolitana's open API**, which serves the Lisbon
 * Metropolitan Area — fifteen of its eighteen municipalities. It needs no key
 * at all and is the same one the official app uses, so the times are the same.
 *
 * **Outside that area there is none of this.** It is not carelessness: in
 * Portugal there is no single open source with the timetables of every
 * operator. Porto, the Algarve and the rest of the country would have to come
 * in one by one, each with its own service, and some have no service at all.
 * The app tells the person so instead of showing an empty list.
 *
 * This is separate from the transport map (ÖPNVKarte): that one draws where the
 * lines run anywhere in the world, this one says when they run here.
 *
 * ## Caveats
 *
 * It could not be tried against the real service from the development
 * environment, as with Overpass and OSRM. So all response handling is
 * defensive: missing fields must not blow anything up. Trip planning has since
 * been run against the real API from GitHub Actions — see
 * `scripts/probe-trips.js`.
 */

// With `overlap`: the interval counts between departures, and responses arrive
// in parallel — see the note in `createRateLimiter`.
const schedule = createRateLimiter(CARRIS_MIN_INTERVAL_MS, { overlap: true });

const client = axios.create({
  baseURL: CARRIS_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
});

/** Failure talking to the bus service, with the reason already written out. */
export class TransitError extends Error {
  /** The service's response status, when it was the one refusing. */
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/**
 * A request to the bus service, with the error saying what really failed.
 *
 * **This is not decoration.** The message used to be always the same — "check
 * your connection" — and it said the opposite of what was going on to someone
 * with network and the map loading normally. Worse: there was no telling apart
 * the service being down, the address having changed, the request taking too
 * long or the network really being down, and without a phone at hand there is
 * no other way to find out. A response status on screen solves in one photo
 * what would otherwise be several rounds of guessing.
 */
async function carrisGet<T>(path: string, timeout?: number): Promise<T> {
  try {
    const { data } = await schedule(() => client.get<T>(path, { timeout }));
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        throw new TransitError(
          t().errors.transitStatus(error.response.status),
          error.response.status,
        );
      }
      if (error.code === 'ECONNABORTED') {
        throw new TransitError(t().errors.transitTimeout);
      }
      throw new TransitError(t().errors.transitOffline);
    }
    throw new TransitError(t().errors.schedulesFailed);
  }
}

/** A stop ready to show on screen. */
export interface TransitStop {
  id: string;
  name: string;
  /** Where it is, to tell apart two stops with the same name. */
  locality: string;
  coordinates: Coordinates;
  /** Which lines stop here, visible without opening it. */
  lines: string[];
  /** Connections to other modes: `train`, `subway`, `light_rail`, `boat`. */
  connections: string[];
  /** The patterns that pass here — see `CarrisStop.pattern_ids`. */
  patterns: string[];
  /** How far it is from whoever is looking, in metres. */
  meters: number;
}

/** An expected arrival, ready to show. */
export interface TransitArrival {
  /** The line number, as painted on the bus. */
  line: string;
  /** Where it is going. */
  destination: string;
  /** How many minutes to go. Zero means "arriving". */
  minutes: number;
  /** The time it passes, as `HH:MM`. */
  time: string;
  /** True when it is real time; false when it is only the timetable. */
  live: boolean;
}

/**
 * All the network's stops, kept after the first request.
 *
 * There are thousands and they do not move, so they are requested once per
 * session. It is the only way to know which are near: the service has no
 * proximity search.
 */
let cachedStops: TransitStop[] | null = null;

/** Prevents two requests at once while the list is loading. */
let loading: Promise<TransitStop[]> | null = null;

function toNumber(value: string | number | undefined): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

async function loadStops(): Promise<TransitStop[]> {
  if (cachedStops) {
    return cachedStops;
  }
  if (loading) {
    return loading;
  }

  loading = (async () => {
    const data = await carrisGet<CarrisStop[]>('/stops', CARRIS_STOPS_TIMEOUT_MS);
    const stops: TransitStop[] = [];

    for (const stop of Array.isArray(data) ? data : []) {
      const latitude = toNumber(stop.lat);
      const longitude = toNumber(stop.lon);
      if (latitude === null || longitude === null || !stop.id) {
        continue;
      }

      stops.push({
        id: stop.id,
        // `long_name` and not `name`: see the note in the types. With the wrong
        // name, the list showed nothing but "Paragem" ("Stop").
        name: stop.long_name ?? stop.short_name ?? `Paragem ${stop.id}`,
        locality: stop.locality_name ?? stop.municipality_name ?? '',
        coordinates: { latitude, longitude },
        lines: Array.isArray(stop.line_ids) ? stop.line_ids : [],
        connections: Array.isArray(stop.facilities) ? stop.facilities : [],
        patterns: Array.isArray(stop.pattern_ids) ? stop.pattern_ids : [],
        meters: 0,
      });
    }

    cachedStops = stops;
    return stops;
  })()
    .catch((error: unknown) => {
      // A failure cannot leave the promise stuck: the next request has to be
      // able to try again.
      loading = null;
      throw error;
    })
    .finally(() => {
      loading = null;
    });

  return loading;
}

/** Distance beyond which one is assumed to be outside the area served. */
const OUTSIDE_AREA_METERS = 20000;

/**
 * The stops nearest a point.
 *
 * Returns `null` when the point is clearly outside the Lisbon Metropolitan
 * Area — showing the nearest stop sixty kilometres away would help nobody and
 * give the wrong idea that the app covers the whole country.
 */
export async function nearbyStops(
  origin: Coordinates,
  limit = 6,
): Promise<TransitStop[] | null> {
  const all = await loadStops();

  // A single pass, keeping the best as it goes. The alternative — copying the
  // thousands of stops, sorting everything and keeping six — made thousands of
  // object copies every time, and this runs whenever the position changes.
  const near: TransitStop[] = [];
  let worst = Infinity;

  for (const stop of all) {
    const meters = distanceMeters(origin, stop.coordinates);
    if (near.length === limit && meters >= worst) {
      continue;
    }

    const entry = { ...stop, meters };
    const at = near.findIndex((p) => p.meters > meters);
    near.splice(at === -1 ? near.length : at, 0, entry);
    if (near.length > limit) {
      near.pop();
    }
    worst = near[near.length - 1].meters;
  }

  if (near.length === 0 || near[0].meters > OUTSIDE_AREA_METERS) {
    return null;
  }

  return near;
}

/** `HH:MM` from seconds since 1970, in the phone's time zone. */
function clockOf(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * A stop's arrivals, as the service returns them.
 *
 * They stay in memory for a short while: trip planning asks about the same
 * stops the arrivals panel has just asked about, and repeating the request is
 * not worth it. Short on purpose — these are real-time times.
 */
const arrivalsCache = new Map<string, { at: number; data: CarrisArrival[] }>();
const ARRIVALS_CACHE_MS = 20000;

async function rawArrivalsAt(stopId: string): Promise<CarrisArrival[]> {
  const stored = arrivalsCache.get(stopId);
  if (stored && Date.now() - stored.at < ARRIVALS_CACHE_MS) {
    return stored.data;
  }

  let data: CarrisArrival[];
  try {
    data = await carrisGet<CarrisArrival[]>(`/arrivals/by_stop/${encodeURIComponent(stopId)}`);
  } catch (error) {
    // **A 404 is a stop with no arrivals, not a fault.** There are stops in the
    // `/stops` list for which `/arrivals/by_stop` answers 404 — seen in a probe
    // on 30 September 2026, right at the stop nearest the centre of Almada.
    // Treating it as an error made such a stop, if it was among the nearest to
    // the origin, bring the whole trip planning down.
    if (error instanceof TransitError && error.status === 404) {
      data = [];
    } else {
      throw error;
    }
  }

  const list = Array.isArray(data) ? data : [];
  arrivalsCache.set(stopId, { at: Date.now(), data: list });
  return list;
}

/** When this arrival really happens, and whether it is real time. */
function whenItPasses(arrival: CarrisArrival): { unix: number; live: boolean } | null {
  const estimated = arrival.estimated_arrival_unix;
  const live = typeof estimated === 'number' && estimated > 0;
  const when = live ? estimated : arrival.scheduled_arrival_unix;

  if (typeof when !== 'number' || when <= 0) {
    return null;
  }
  return { unix: when, live };
}

export async function arrivalsAt(stopId: string, limit = 8): Promise<TransitArrival[]> {
  const data = await rawArrivalsAt(stopId);

  const now = Date.now() / 1000;
  const upcoming: TransitArrival[] = [];

  for (const arrival of data) {
    // If it has been seen passing, it is over — no longer of interest.
    if (arrival.observed_arrival) {
      continue;
    }

    // The estimated time is always preferred: it already includes the real delay.
    const passes = whenItPasses(arrival);
    if (!passes) {
      continue;
    }
    const { unix: when, live } = passes;

    const minutesLeft = Math.round((when - now) / 60);

    // A minute's slack backwards: the bus that should have passed just now is
    // still of interest to someone at the stop. And nothing beyond two hours,
    // which is no longer waiting — it is looking up the timetable.
    if (minutesLeft < -1 || minutesLeft > 120) {
      continue;
    }

    upcoming.push({
      line: arrival.line_id ?? arrival.route_id ?? '—',
      destination: arrival.headsign ?? '',
      minutes: Math.max(0, minutesLeft),
      time: clockOf(when),
      live,
    });
  }

  return upcoming.sort((a, b) => a.minutes - b.minutes).slice(0, limit);
}

/**
 * A public transport trip, from where one is to where one wants to go.
 *
 * It is always **a single line, without changes** — see `planBusTrips`.
 *
 * It serves both sides: the buses, which come from here with real time, and
 * the trains, metro and ferries, which come from `schedules.ts` from the
 * stored timetable. The screen shows both in the same list, and `kind` and
 * `live` tell them apart — a bus's time is when it really passes, a train's is
 * when it should.
 */
export interface TransitTrip {
  /** Identifies the trip. Used as the key in the list. */
  tripId: string;
  /** Which mode: `bus`, `train`, `subway`, `light_rail`, `boat`. */
  kind: string;
  /** The line number, as painted on the bus. */
  line: string;
  /** Where the bus is going, as on its destination sign. */
  headsign: string;
  /** Where one boards and where one gets off. */
  from: TransitStop;
  to: TransitStop;
  /** Times, in seconds since 1970. */
  departsAt: number;
  arrivesAt: number;
  /** When one has to leave from where one is, to catch this one. */
  leaveAt: number;
  /** When one really reaches the destination, including the final walk. */
  reachAt: number;
  /** How many stops one rides on the bus. */
  stops: number;
  /** True when the times are real time, not the timetable. */
  live: boolean;
}

/** All the stops within `maxMeters`, from nearest to farthest. */
async function stopsNear(origin: Coordinates, maxMeters: number): Promise<TransitStop[]> {
  const all = await loadStops();
  const near: TransitStop[] = [];
  for (const stop of all) {
    const meters = distanceMeters(origin, stop.coordinates);
    if (meters <= maxMeters) {
      near.push({ ...stop, meters });
    }
  }
  return near.sort((a, b) => a.meters - b.meters);
}

/** At most how many stops at each end are asked about, per trip. */
const TRIP_STOPS_PER_SIDE = 6;

/**
 * The departure and arrival stops worth asking about.
 *
 * **Not the nearest ones, but the ones that share a bus.** It used to be the
 * three nearest at each end, and in the real data that almost never gave a
 * line in common: in the centre of Almada the three nearest are stops of lines
 * that do not go to Cacilhas, and the one that does is two hundred metres
 * away. The result: zero trips between two places linked by half a dozen
 * buses — measured on 30 September 2026 with the app's code against the real
 * API.
 *
 * `/stops` says which patterns pass at each stop (`pattern_ids`), and it is
 * already in memory. Crossing those of both ends tells, **without any
 * request**, which lines make the whole journey; and for each one the nearest
 * stop on each side is kept. When there is no pattern in common nothing is
 * asked — the answer is "no direct bus", and it comes at once.
 *
 * If the service stops sending `pattern_ids`, it falls back to the three
 * nearest: worse, but not zero.
 */
async function busStopsFor(
  origin: Coordinates,
  destination: Coordinates,
): Promise<{ departures: TransitStop[]; arrivals: TransitStop[]; noLink: boolean }> {
  const [allDepartures, allArrivals] = await Promise.all([
    stopsNear(origin, TRANSIT_WALK_MAX_M),
    stopsNear(destination, TRANSIT_WALK_MAX_M),
  ]);

  const hasPatterns = [...allDepartures, ...allArrivals].some((s) => s.patterns.length > 0);
  if (!hasPatterns) {
    return {
      departures: allDepartures.slice(0, 3),
      arrivals: allArrivals.slice(0, 3),
      noLink: false,
    };
  }

  // For each pattern, the nearest stop at each end. The lists come sorted by
  // distance, so the first that appears is the nearest.
  const nearestByPattern = (stops: TransitStop[]) => {
    const byPattern = new Map<string, TransitStop>();
    for (const stop of stops) {
      for (const pattern of stop.patterns) {
        if (!byPattern.has(pattern)) {
          byPattern.set(pattern, stop);
        }
      }
    }
    return byPattern;
  };
  const fromStart = nearestByPattern(allDepartures);
  const fromEnd = nearestByPattern(allArrivals);

  // The patterns in common, the ones with the least walking first — those are
  // the ones kept when something has to be cut.
  const common = [...fromStart.keys()]
    .filter((pattern) => fromEnd.has(pattern))
    .sort(
      (a, b) =>
        fromStart.get(a)!.meters +
        fromEnd.get(a)!.meters -
        (fromStart.get(b)!.meters + fromEnd.get(b)!.meters),
    );

  const departures = new Map<string, TransitStop>();
  const arrivals = new Map<string, TransitStop>();
  for (const pattern of common) {
    const s = fromStart.get(pattern)!;
    const c = fromEnd.get(pattern)!;
    if (!departures.has(s.id) && departures.size >= TRIP_STOPS_PER_SIDE) {
      continue;
    }
    if (!arrivals.has(c.id) && arrivals.size >= TRIP_STOPS_PER_SIDE) {
      continue;
    }
    departures.set(s.id, s);
    arrivals.set(c.id, c);
  }

  return {
    departures: allDepartures.length === 0 ? [] : [...departures.values()],
    arrivals: allArrivals.length === 0 ? [] : [...arrivals.values()],
    noLink: allDepartures.length > 0 && allArrivals.length > 0 && common.length === 0,
  };
}

/** How many seconds it takes to walk this distance, counting the way round the blocks. */
function walkSeconds(meters: number): number {
  return (meters * WALK_DETOUR) / WALK_SPEED_MS;
}

/**
 * Which trip each arrival at a stop belongs to.
 *
 * ## Why this exists
 *
 * **`trip_id` stopped coming in arrivals without real time.** Until the summer
 * of 2026 every arrival always carried the timetable's `trip_id`. On 11 August
 * Carris rewrote `/arrivals/by_stop` to fetch its data from TML, and since then
 * it comes from the real-time data (`eta?.trip_id ?? null`, in their
 * `arrivals.endpoint.ts`, read rather than assumed): it is `null` on every
 * arrival that has no bus assigned yet — that is, almost all of them. Planning
 * linked the two ends by `trip_id` and was left with no trips at all, **with
 * no error at all**.
 *
 * ## What identifies the trip now
 *
 * **The order within the pattern.** A pattern (`pattern_id`) is the exact path
 * of a line in one direction: always the same stops, in the same order. Within
 * a pattern buses do not overtake each other — they follow the same path and
 * stop at the same places. And the service returns **the whole day** of each
 * pattern, including the times already gone. Putting both together: the fifth
 * bus of the day on pattern P at this stop is the fifth bus on pattern P at the
 * next stop. The key is `pattern#order`.
 *
 * The group is pattern **and** `stop_sequence`, not just pattern: a circular
 * line passes the same stop twice, and each trip's two passes are not the same
 * thing.
 *
 * **That is why nothing is filtered before sorting** — neither those already
 * gone nor those without a time. One arrival fewer at one end would throw off
 * the order of all the following ones. Filtering is for whoever uses this,
 * afterwards.
 */
function tripKeys(arrivals: CarrisArrival[]): Map<CarrisArrival, string> {
  const groups = new Map<string, CarrisArrival[]>();
  for (const arrival of arrivals) {
    if (!arrival.pattern_id || typeof arrival.scheduled_arrival_unix !== 'number') {
      continue;
    }
    const group = `${arrival.pattern_id}|${arrival.stop_sequence ?? 0}`;
    const list = groups.get(group);
    if (list) {
      list.push(arrival);
    } else {
      groups.set(group, [arrival]);
    }
  }

  const keys = new Map<CarrisArrival, string>();
  for (const list of groups.values()) {
    // By the timetable time, not the estimated one: the estimate moves with the
    // traffic, the timetable is what gives the order the trips were planned in.
    list.sort(
      (a, b) => (a.scheduled_arrival_unix as number) - (b.scheduled_arrival_unix as number),
    );
    list.forEach((arrival, order) => {
      keys.set(arrival, `${arrival.pattern_id}#${order}`);
    });
  }
  return keys;
}

/**
 * How many trips of each pattern pass this stop today.
 *
 * It checks the `pattern#order` key: the order only identifies the trip if both
 * ends have **the same trips** of the pattern. They always do — a pattern
 * serves all its stops — but if one day the service cuts the list short at one
 * of them, the order would silently go out of step. With different numbers,
 * nothing of that pattern is paired.
 */
function tripsPerPattern(arrivals: CarrisArrival[]): Map<string, number> {
  const byGroup = new Map<string, number>();
  for (const arrival of arrivals) {
    if (!arrival.pattern_id || typeof arrival.scheduled_arrival_unix !== 'number') {
      continue;
    }
    const group = `${arrival.pattern_id}|${arrival.stop_sequence ?? 0}`;
    byGroup.set(group, (byGroup.get(group) ?? 0) + 1);
  }
  // The pattern's number of trips is that of any of its groups; if two groups
  // of the same pattern disagree, the pattern is marked as uncertain.
  const byPattern = new Map<string, number>();
  for (const [group, n] of byGroup) {
    const pattern = group.slice(0, group.lastIndexOf('|'));
    const before = byPattern.get(pattern);
    byPattern.set(pattern, before === undefined || before === n ? n : -1);
  }
  return byPattern;
}

/**
 * Builds bus trips between two points.
 *
 * ## How this works
 *
 * There is no open service in Portugal that answers "how do I get from A to B
 * by public transport". What there is, is each stop's list of arrivals — and
 * this is built from that:
 *
 * 1. Find the stops within walking distance of the origin and the destination
 *    that share a line — see `busStopsFor`.
 * 2. Request each one's arrivals.
 * 3. **If the same trip appears at a departure stop and at an arrival stop, it
 *    is the same bus.** The two times are the real departure and arrival, and
 *    the order between them confirms the direction of travel — no need to guess
 *    or fetch the line's shape. The trip is recognised by its order within the
 *    pattern, not by `trip_id` — see `tripKeys`, which explains why.
 * 4. Add the walking time at each end and sort by arrival time.
 *
 * ## What this does not do, and it must be said
 *
 * - **Only Carris Metropolitana buses**, and only in the Lisbon Metropolitan
 *   Area. Trains, metro and ferries do not come in here: each is another
 *   operator, with another service, and some have no open service at all.
 * - **No changes.** Only lines that make the whole journey in one go. A trip
 *   with a change of bus is a much bigger problem, and done badly it is worse
 *   than not existing.
 * - **The walking time is estimated**, not computed on the map: straight-line
 *   distance, with a third more for the blocks. It serves to rank the options.
 *
 * Returns `null` when there are no stops within reach of either end — which is
 * different from there being no bus that serves.
 */
export async function planBusTrips(
  origin: Coordinates,
  destination: Coordinates,
  limit = 5,
): Promise<TransitTrip[] | null> {
  const { departures, arrivals, noLink } = await busStopsFor(origin, destination);

  // There are stops on both sides, but no line that makes the whole journey.
  if (noLink) {
    return [];
  }
  if (departures.length === 0 || arrivals.length === 0) {
    return null;
  }

  // The arrival stops first: it is against them that the trips are matched.
  //
  // **A trip can pass the same arrival stop twice**, which is why a list is kept
  // and not a single arrival. On a circular line the stop where the trip starts
  // is also where it ends — at Cacilhas, the 3005 calls at stop 1 and at 37.
  // Keeping only one kept the first, and the trip was then thrown away for
  // "going backwards": it was the only trip there was between the centre of
  // Almada and Cacilhas.
  type Arrival = {
    stop: TransitStop;
    unix: number;
    seq: number;
    tripId: string | null;
    patternTrips: number;
  };
  const byTrip = new Map<string, Arrival[]>();

  // **One stop failing does not bring planning down.** It is half a dozen
  // requests, and the service refuses one now and then; with a plain
  // `Promise.all`, that isolated refusal wiped out every option — including the
  // ones that had already come back fine. It only gives up if they all fail,
  // and then says why.
  let failure: unknown = null;
  let failed = 0;

  await Promise.all(
    arrivals.map(async (stop) => {
      let passes: CarrisArrival[];
      try {
        passes = await rawArrivalsAt(stop.id);
      } catch (error) {
        failure = failure ?? error;
        failed += 1;
        return;
      }

      const keys = tripKeys(passes);
      const patternTrips = tripsPerPattern(passes);

      for (const arrival of passes) {
        const when = whenItPasses(arrival);
        const key = keys.get(arrival);
        if (!key || !when) {
          continue;
        }

        // All of them: which one serves is only known on the departure side,
        // which is where the order of the stops is seen.
        const entry: Arrival = {
          stop,
          unix: when.unix,
          seq: arrival.stop_sequence ?? 0,
          tripId: arrival.trip_id ?? null,
          patternTrips: patternTrips.get(arrival.pattern_id as string) ?? -1,
        };
        const list = byTrip.get(key);
        if (list) {
          list.push(entry);
        } else {
          byTrip.set(key, [entry]);
        }
      }
    }),
  );

  if (failed === arrivals.length && failure) {
    throw failure;
  }

  const now = Date.now() / 1000;
  const trips: TransitTrip[] = [];

  let departureFailures = 0;
  let departureFailure: unknown = null;

  await Promise.all(
    departures.map(async (stop) => {
      const walk = walkSeconds(stop.meters);

      // The same care as on the arrival side: a stop that fails is left out and
      // the others carry on. **It was missing here**, and a refusal at a
      // departure stop wiped out every option, even the ones that had come
      // back fine.
      let passes: CarrisArrival[];
      try {
        passes = await rawArrivalsAt(stop.id);
      } catch (error) {
        departureFailure = departureFailure ?? error;
        departureFailures += 1;
        return;
      }
      // The order is computed over the whole list, **before** filtering — see
      // `tripKeys`. Only afterwards are the ones already gone set aside.
      const keys = tripKeys(passes);
      const patternTrips = tripsPerPattern(passes);

      for (const arrival of passes) {
        if (arrival.observed_arrival) {
          continue;
        }

        const leaves = whenItPasses(arrival);
        const key = keys.get(arrival);
        const candidates = key ? byTrip.get(key) : undefined;
        if (!leaves || !key || !candidates) {
          continue;
        }
        const seq = arrival.stop_sequence ?? 0;
        const tripsHere = patternTrips.get(arrival.pattern_id as string) ?? -1;

        // Of this trip's passes at the arrival stops, the one that gets the
        // person to the destination earliest — and only among those that come
        // **after** this departure, in order and in time. That is what prevents
        // a trip in the opposite direction, and what picks the right lap of a
        // circular line.
        let arrivalPass: Arrival | undefined;
        for (const c of candidates) {
          if (c.unix <= leaves.unix || c.seq <= seq) {
            continue;
          }
          const reaches = c.unix + walkSeconds(c.stop.meters);
          if (!arrivalPass || reaches < arrivalPass.unix + walkSeconds(arrivalPass.stop.meters)) {
            arrivalPass = c;
          }
        }
        if (!arrivalPass) {
          continue;
        }

        // The two checks that the order really identifies the same trip.
        // **Both ends must have the same number of trips of the pattern** —
        // with one fewer at one of them, the order would be out of step and the
        // 8:10 bus would end up arriving at the following one's 8:45. And
        // **when both carry a `trip_id`**, which is when there is real time,
        // they must say the same. If anything does not match, nothing is
        // paired: better no trip than one that sends the person to the stop at
        // the wrong time.
        if (tripsHere < 0 || tripsHere !== arrivalPass.patternTrips) {
          continue;
        }
        if (arrival.trip_id && arrivalPass.tripId && arrival.trip_id !== arrivalPass.tripId) {
          continue;
        }

        const leaveAt = leaves.unix - walk;
        // A minute's slack: someone right at the stop still catches the bus
        // leaving any moment now.
        if (leaveAt < now - 60) {
          continue;
        }

        trips.push({
          tripId: key,
          kind: 'bus',
          line: arrival.line_id ?? arrival.route_id ?? '—',
          headsign: arrival.headsign ?? '',
          from: stop,
          to: arrivalPass.stop,
          departsAt: leaves.unix,
          arrivesAt: arrivalPass.unix,
          leaveAt,
          reachAt: arrivalPass.unix + walkSeconds(arrivalPass.stop.meters),
          stops: Math.max(1, arrivalPass.seq - seq),
          live: leaves.live,
        });
      }
    }),
  );

  if (departureFailures === departures.length && departureFailure) {
    throw departureFailure;
  }

  // Arrives earliest first. A line appears only once: the same bus's next three
  // passes are not three options, they are the same option.
  const byLine = new Map<string, TransitTrip>();
  for (const t of trips.sort((a, b) => a.reachAt - b.reachAt)) {
    if (!byLine.has(t.line)) {
      byLine.set(t.line, t);
    }
  }

  return [...byLine.values()].slice(0, limit);
}

/**
 * What kind of station it is.
 *
 * `light_rail` is light rail — on the south bank, Metro Sul do Tejo.
 */
export type StationKind = 'train' | 'subway' | 'light_rail' | 'boat';

/** A station ready to show on the map. */
export interface TransitStation {
  id: string;
  kind: StationKind;
  name: string;
  locality: string;
  coordinates: Coordinates;
  /** The bus stops that serve this station. */
  stopIds: string[];
  /** How far it is from whoever is looking, in metres. */
  meters: number;
}

/** The address for each kind, in the same API as the buses. */
const STATION_ENDPOINTS: Record<StationKind, string> = {
  train: '/facilities/train_stations',
  subway: '/facilities/subway_stations',
  light_rail: '/facilities/light_rail_stations',
  boat: '/facilities/boat_stations',
};

/**
 * What each kind is called, in the current language.
 *
 * It is a function and not a constant on purpose: a constant was evaluated
 * once, at start-up, and stayed stuck to that moment's language — switching
 * language left the stations saying "Comboio" in the middle of an English
 * screen.
 */
export function stationLabel(kind: StationKind): string {
  return t().transit.kinds[kind];
}

/** The icon for each kind. Confirmed in the MaterialCommunityIcons list. */
export const STATION_ICONS: Record<StationKind, string> = {
  train: 'train',
  subway: 'subway-variant',
  light_rail: 'tram',
  boat: 'ferry',
};

/**
 * The train, metro, light-rail and ferry stations.
 *
 * They are four short lists that do not move, so they are requested once per
 * session and kept in memory, like the stops.
 *
 * **These are only the locations.** There are no open timetables for these
 * operators in an API — Fertagus and CP publish static GTFS, which is another
 * path, and Metro Sul do Tejo publishes nothing. See CLAUDE.md.
 */
let cachedStations: TransitStation[] | null = null;
let loadingStations: Promise<TransitStation[]> | null = null;

async function loadStations(): Promise<TransitStation[]> {
  if (cachedStations) {
    return cachedStations;
  }
  if (loadingStations) {
    return loadingStations;
  }

  loadingStations = (async () => {
    const lists = await Promise.all(
      (Object.keys(STATION_ENDPOINTS) as StationKind[]).map(async (kind) => {
        try {
          const data = await carrisGet<CarrisFacility[]>(
            STATION_ENDPOINTS[kind],
            CARRIS_STOPS_TIMEOUT_MS,
          );

          const stations: TransitStation[] = [];
          for (const facility of Array.isArray(data) ? data : []) {
            const latitude = toNumber(facility.lat);
            const longitude = toNumber(facility.lon);
            if (latitude === null || longitude === null || !facility.id) {
              continue;
            }

            stations.push({
              id: `${kind}:${facility.id}`,
              kind,
              name: facility.name ?? stationLabel(kind),
              locality: facility.locality ?? facility.municipality_name ?? '',
              coordinates: { latitude, longitude },
              stopIds: Array.isArray(facility.stop_ids) ? facility.stop_ids : [],
              meters: 0,
            });
          }
          return stations;
        } catch {
          // One kind failing cannot drag the others down: better to show only
          // the trains than no station at all.
          return [];
        }
      }),
    );

    cachedStations = lists.flat();
    return cachedStations;
  })().finally(() => {
    loadingStations = null;
  });

  return loadingStations;
}

/** The stations within a certain distance, from nearest to farthest. */
export async function nearbyStations(
  origin: Coordinates,
  maxMeters = 1500,
  limit = 8,
): Promise<TransitStation[]> {
  const all = await loadStations();

  return all
    .map((station) => ({
      ...station,
      meters: distanceMeters(origin, station.coordinates),
    }))
    .filter((station) => station.meters <= maxMeters)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit);
}
