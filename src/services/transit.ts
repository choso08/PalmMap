import axios from 'axios';

import {
  CARRIS_BASE_URL,
  CARRIS_MIN_INTERVAL_MS,
  CARRIS_STOPS_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  TRANSIT_WALK_MAX_M,
  TRANSIT_WALK_WIDE_M,
  USER_AGENT,
  TRANSFER_MAX_WAIT_S,
  WALK_DETOUR,
  WALK_SPEED_MS,
} from './config';
import { createRateLimiter } from './rateLimit';
import { t } from '../i18n';
import type { Bounds, Coordinates } from '../types/geo';
import type {
  CarrisArrival,
  CarrisFacility,
  CarrisPattern,
  CarrisShape,
  CarrisStop,
} from '../types/transit';
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

/**
 * The line number as painted on the bus: `[YA15B]3527` → `3527`.
 *
 * Since Carris started taking its data from the TML hub (August 2026), line,
 * route, pattern and trip ids carry one or more bracketed prefixes — seen in a
 * probe of the real API on 9 November 2026. They mean something to TML's
 * systems and nothing to someone at the stop. Only the label loses them: the
 * ids used for matching (`pattern_id`, `trip_id`) stay as they come.
 */
export function lineLabel(raw: string | null | undefined): string {
  const clean = (raw ?? '').replace(/^(\[[^\]]*\])+/, '').trim();
  return clean || '—';
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
  /** When it passes, in seconds since 1970 — the estimate when there is one. */
  unix: number;
  /** The pattern, for the line's journey (`lineJourney`). */
  patternId: string | null;
  /** This stop's place in the trip, and its timetable time (`HH:MM:SS`). */
  stopSequence: number | null;
  scheduledText: string | null;
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

/**
 * Every stop inside the visible part of the map, nearest the centre first.
 *
 * It is what makes the stops on the transport map tappable. The stops drawn by
 * ÖPNVKarte are part of the tile image, so a tap on one reaches nothing; these
 * are drawn on top, from the list already in memory — **no request at all**
 * once `/stops` has been loaded.
 */
export async function stopsInBounds(bounds: Bounds, limit = 200): Promise<TransitStop[]> {
  const all = await loadStops();
  const centre = {
    latitude: (bounds.south + bounds.north) / 2,
    longitude: (bounds.west + bounds.east) / 2,
  };
  const inside: TransitStop[] = [];
  for (const stop of all) {
    const { latitude, longitude } = stop.coordinates;
    if (
      latitude >= bounds.south &&
      latitude <= bounds.north &&
      longitude >= bounds.west &&
      longitude <= bounds.east
    ) {
      inside.push({ ...stop, meters: distanceMeters(centre, stop.coordinates) });
    }
  }
  return inside.sort((a, b) => a.meters - b.meters).slice(0, limit);
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
      line: lineLabel(arrival.line_id ?? arrival.route_id),
      destination: arrival.headsign ?? '',
      minutes: Math.max(0, minutesLeft),
      time: clockOf(when),
      live,
      unix: when,
      patternId: arrival.pattern_id ?? null,
      stopSequence: typeof arrival.stop_sequence === 'number' ? arrival.stop_sequence : null,
      scheduledText: arrival.scheduled_arrival ?? null,
    });
  }

  return upcoming.sort((a, b) => a.minutes - b.minutes).slice(0, limit);
}

/** One stop of a line's journey, from where one boards onwards. */
export interface JourneyStop {
  id: string;
  name: string;
  coordinates: Coordinates;
  /** When the bus passes here (`HH:MM`); null when the timetable did not match. */
  time: string | null;
}

/** Where a bus goes from the stop it was tapped at, as Maps shows a line. */
export interface LineJourney {
  line: string;
  headsign: string;
  /** The line's own colour, when the service gives one. */
  colour: string | null;
  /** From the boarding stop to the end of the line — or to `alightIndex`. */
  stops: JourneyStop[];
  /**
   * Where to get off for the destination chosen, as an index into `stops`:
   * the stop of the line nearest to it. Null with no destination.
   */
  alightIndex: number | null;
}

/**
 * Patterns already asked for. Each answer is a few hundred kilobytes (every
 * trip of the line with its times) and does not change during a session.
 */
const patternCache = new Map<string, Promise<CarrisPattern | null>>();

function loadPattern(rawId: string): Promise<CarrisPattern | null> {
  // The arrivals carry `[YA15B]3013_0_2`; the service only knows `3013_0_2`.
  const id = rawId.replace(/^(\[[^\]]*\])+/, '');
  const cached = patternCache.get(id);
  if (cached) {
    return cached;
  }
  const pending = carrisGet<CarrisPattern[] | CarrisPattern>(
    `/patterns/${encodeURIComponent(id)}`,
    CARRIS_STOPS_TIMEOUT_MS,
  )
    .then((data) => (Array.isArray(data) ? data[0] ?? null : data))
    .catch((error: unknown) => {
      // A failure is not kept: the next tap tries again.
      patternCache.delete(id);
      throw error;
    });
  patternCache.set(id, pending);
  return pending;
}

/** How far from the bus's timetable time another trip still lends its minutes. */
const JOURNEY_TRIP_SLACK_S = 30 * 60;

/** `HH:MM:SS` (possibly past 24) → seconds after midnight. */
function secondsOf(text: string | undefined): number | null {
  const m = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(text ?? '');
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0) : null;
}

/**
 * The stops a bus calls at after this one, with the time at each — what Maps
 * shows when a line is tapped.
 *
 * The times come from the pattern's timetable: the trip whose time at this
 * stop is the arrival's own timetable time is that bus, and each later stop is
 * the same number of minutes after it **counted from when the bus really
 * passes here** — so a bus four minutes late is four minutes late all the way.
 * When no trip matches, the stops show without times rather than with made-up
 * ones.
 *
 * With a destination, the stop of the line nearest to it is where to get off,
 * and the list ends there.
 */
export async function lineJourney(
  arrival: TransitArrival,
  boardStopId: string,
  destination: Coordinates | null,
): Promise<LineJourney> {
  if (!arrival.patternId) {
    throw new TransitError(t().transit.journeyUnavailable);
  }
  const [pattern, stops] = await Promise.all([loadPattern(arrival.patternId), loadStops()]);
  const path = (pattern?.path ?? [])
    .filter((p) => p.stop_id && typeof p.stop_sequence === 'number')
    .sort((a, b) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0));
  if (path.length === 0) {
    throw new TransitError(t().transit.journeyUnavailable);
  }

  // Where one boards. The sequence beats the id: a circular line passes the
  // same stop twice.
  let start = path.findIndex((p) => p.stop_sequence === arrival.stopSequence);
  if (start < 0) {
    start = path.findIndex((p) => p.stop_id === boardStopId);
  }
  if (start < 0) {
    start = 0;
  }
  const boardSequence = path[start].stop_sequence;

  // The trip this bus is, by its timetable time here. The exact time first;
  // failing that the trip passing here nearest that time, within
  // `JOURNEY_TRIP_SLACK_S` — the pattern's list does not always carry every
  // trip of the day (a probe found a 17:34 with none at 17:34), and the minutes
  // between stops hardly change from one trip to the next.
  const arrivalTime = secondsOf(arrival.scheduledText ?? undefined);
  let trip: NonNullable<CarrisPattern['trips']>[number] | undefined;
  let tripBoardTime: number | null = null;
  if (arrivalTime !== null) {
    let bestGap = JOURNEY_TRIP_SLACK_S + 1;
    for (const tr of pattern?.trips ?? []) {
      const here = (tr.schedule ?? []).find((s) => s.stop_sequence === boardSequence);
      const sec = secondsOf(here?.arrival_time);
      if (sec === null) {
        continue;
      }
      const gap = Math.abs(sec - arrivalTime);
      if (gap < bestGap) {
        bestGap = gap;
        trip = tr;
        tripBoardTime = sec;
      }
    }
  }
  const timeAt = new Map<number, number>();
  for (const s of trip?.schedule ?? []) {
    const sec = secondsOf(s.arrival_time);
    if (typeof s.stop_sequence === 'number' && sec !== null) {
      timeAt.set(s.stop_sequence, sec);
    }
  }

  const byId = new Map(stops.map((s) => [s.id, s]));
  const journey: JourneyStop[] = [];
  for (const p of path.slice(start)) {
    const stop = byId.get(p.stop_id ?? '');
    if (!stop) {
      continue;
    }
    const at = timeAt.get(p.stop_sequence ?? -1);
    journey.push({
      id: stop.id,
      name: stop.name,
      coordinates: stop.coordinates,
      time:
        tripBoardTime !== null && at !== undefined
          ? clockOf(arrival.unix + (at - tripBoardTime))
          : journey.length === 0
            ? arrival.time
            : null,
    });
  }

  // Where to get off: the line's stop nearest the destination, past the first
  // — but only when this line really takes one there: within walking distance
  // of it (`TRANSIT_WALK_MAX_M`) and nearer than where one boards. Otherwise a
  // circular line in Oeiras said "get off here" one stop on, for Cascais.
  let alightIndex: number | null = null;
  if (destination && journey.length > 1) {
    let best = Math.min(TRANSIT_WALK_MAX_M, distanceMeters(journey[0].coordinates, destination));
    journey.forEach((s, i) => {
      if (i === 0) {
        return;
      }
      const d = distanceMeters(s.coordinates, destination);
      if (d < best) {
        best = d;
        alightIndex = i;
      }
    });
  }

  return {
    line: arrival.line,
    headsign: arrival.destination || pattern?.headsign || '',
    colour: pattern?.color && /^#[0-9a-f]{6}$/i.test(pattern.color) ? pattern.color : null,
    stops: alightIndex !== null ? journey.slice(0, alightIndex + 1) : journey,
    alightIndex,
  };
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
  /**
   * When the trip needs a second bus: where to change, when the first bus gets
   * there, and the second bus. `line`/`headsign` above are the first bus's;
   * `to` and `arrivesAt` are the end of the whole trip.
   */
  /** Which stops one rides through — see `RideRef`. Absent when unknown. */
  ride?: RideRef;
  /** The one change of a trip with two vehicles. Read through `changesOf`. */
  change?: TransitChange;
  /**
   * Several changes, in order (`raptor.ts`, November 2026). When present it
   * holds them all and `change` is not used. Read through `changesOf`.
   */
  changes?: TransitChange[];
}

/** Where one vehicle is left for the next, and the next vehicle. */
export interface TransitChange {
  /** The second vehicle's stops. */
  ride?: RideRef;
  /** Where to get off the first bus. */
  at: TransitStop;
  /** Where to get on the second: the same stop, or one a short walk away. */
  boardAt: TransitStop;
  walkMeters: number;
  arrivesAt: number;
  /** The second vehicle's mode, when it differs from the first (metro to train). */
  kind?: string;
  line: string;
  headsign: string;
  departsAt: number;
}

/** A trip's changes, in order, whichever field holds them. */
export function changesOf(trip: TransitTrip): TransitChange[] {
  return trip.changes ?? (trip.change ? [trip.change] : []);
}

/**
 * Where to find the stops a ride passes, without carrying them in every
 * option: only the trip one starts needs them (`rideStops`, in
 * `transitGuide.ts`). A Carris bus is its pattern between two sequence
 * numbers; a stored timetable is its trip between two positions.
 */
export type RideRef =
  | { source: 'carris'; patternId: string; fromSeq: number; toSeq: number }
  | { source: 'schedule'; feedId: string; trip: number; fromPos: number; toPos: number };

function legRide(leg: Leg): RideRef | undefined {
  return leg.patternId
    ? { source: 'carris', patternId: leg.patternId, fromSeq: leg.fromSeq, toSeq: leg.toSeq }
    : undefined;
}

/** A stop of a ride, with when the vehicle passes it (seconds since 1970). */
export interface RideStop {
  id: string;
  name: string;
  coordinates: Coordinates;
  unix: number | null;
}

/**
 * A Carris ride's stops, boarding and alighting included, from the line's
 * pattern (`/patterns`, kept for the session). The two ends carry the trip's
 * real times; the stops between are spread by the pattern's distance, which
 * is near enough for "three stops to go" and says nothing it does not know at
 * the ends.
 */
/** A Carris Metropolitana pattern's own colour, `#C61D23`, or null. */
export async function carrisPatternColour(patternId: string): Promise<string | null> {
  const pattern = await loadPattern(patternId);
  return pattern?.color && /^#[0-9a-f]{6}$/i.test(pattern.color) ? pattern.color : null;
}

export async function carrisRide(
  ref: Extract<RideRef, { source: 'carris' }>,
  departsAt: number,
  arrivesAt: number,
): Promise<RideStop[]> {
  const [pattern, stops] = await Promise.all([loadPattern(ref.patternId), loadStops()]);
  const byId = new Map(stops.map((s) => [s.id, s]));
  const path = (pattern?.path ?? [])
    .filter(
      (p) =>
        typeof p.stop_sequence === 'number' &&
        p.stop_sequence >= ref.fromSeq &&
        p.stop_sequence <= ref.toSeq,
    )
    .sort((a, b) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0));
  if (path.length < 2) {
    return [];
  }
  const d0 = path[0].distance;
  const d1 = path[path.length - 1].distance;
  const span = typeof d0 === 'number' && typeof d1 === 'number' && d1 > d0 ? d1 - d0 : null;
  const out: RideStop[] = [];
  path.forEach((p, i) => {
    const stop = byId.get(p.stop_id ?? '');
    if (!stop) {
      return;
    }
    const share =
      i === 0
        ? 0
        : i === path.length - 1
          ? 1
          : span !== null && typeof p.distance === 'number'
            ? (p.distance - (d0 as number)) / span
            : i / (path.length - 1);
    out.push({
      id: stop.id,
      name: stop.name,
      coordinates: stop.coordinates,
      unix: Math.round(departsAt + (arrivesAt - departsAt) * share),
    });
  });
  return out;
}

/** How near the line a stop must be for a pass to count as the stop's. */
const SHAPE_CUT_M = 40;

/** Shapes already asked for: a few hundred kilobytes each, fixed for the day. */
const shapeCache = new Map<string, Promise<Coordinates[]>>();

function loadShape(id: string): Promise<Coordinates[]> {
  const cached = shapeCache.get(id);
  if (cached) {
    return cached;
  }
  const pending = carrisGet<CarrisShape>(`/shapes/${encodeURIComponent(id)}`, CARRIS_STOPS_TIMEOUT_MS)
    .then((shape) =>
      (shape.geojson?.geometry?.coordinates ?? []).map(([longitude, latitude]) => ({
        latitude,
        longitude,
      })),
    )
    .catch((error: unknown) => {
      shapeCache.delete(id);
      throw error;
    });
  shapeCache.set(id, pending);
  return pending;
}

/**
 * The way a Carris ride really goes, along the streets — the line's shape
 * (`/v2/shapes`, by the pattern's `shape_id`) cut between the stop where one
 * boards and the one where one gets off (author's request: the bus drawn
 * where it goes, not stop to stop in straight lines). Each cut is the shape's
 * point nearest the stop, the second searched only after the first, so a
 * circular line is cut on the right lap. Empty when there is no shape.
 */
export async function carrisRideShape(
  ref: Extract<RideRef, { source: 'carris' }>,
  from: Coordinates,
  to: Coordinates,
): Promise<Coordinates[]> {
  const pattern = await loadPattern(ref.patternId);
  if (!pattern?.shape_id) {
    return [];
  }
  const line = await loadShape(pattern.shape_id);
  if (line.length < 2) {
    return [];
  }
  // The first pass within `SHAPE_CUT_M` of the stop, failing that the
  // nearest point at all: on a circular line the start and the end are the
  // same place, and the nearest overall could be the last lap.
  const nearestFrom = (target: Coordinates, start: number) => {
    let best = start;
    let bestM = Infinity;
    for (let i = start; i < line.length; i += 1) {
      const m = distanceMeters(line[i], target);
      if (m < bestM) {
        bestM = m;
        best = i;
      }
      if (bestM <= SHAPE_CUT_M && m > bestM + SHAPE_CUT_M) {
        break;
      }
    }
    return best;
  };
  const a = nearestFrom(from, 0);
  const b = nearestFrom(to, a);
  return b > a ? line.slice(a, b + 1) : [];
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
  endRadius = TRANSIT_WALK_MAX_M,
): Promise<{ departures: TransitStop[]; arrivals: TransitStop[]; noLink: boolean }> {
  const [allDepartures, allArrivals] = await Promise.all([
    stopsNear(origin, TRANSIT_WALK_MAX_M),
    stopsNear(destination, endRadius),
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

/** A stop with its arrivals for the day, as the service returned them. */
type StopPasses = { stop: TransitStop; passes: CarrisArrival[] };

/** One bus ride: boarding at `from`, getting off at `to`. */
interface Leg {
  key: string;
  /** The pattern and the sequence numbers boarded and left at — see `RideRef`. */
  patternId: string;
  fromSeq: number;
  toSeq: number;
  line: string;
  headsign: string;
  from: TransitStop;
  to: TransitStop;
  departsAt: number;
  arrivesAt: number;
  stops: number;
  live: boolean;
}

/**
 * Each stop's arrivals, in parallel. **One stop failing does not bring planning
 * down**: the service refuses one now and then, and with a plain `Promise.all`
 * that isolated refusal wiped out every option. It only gives up if they all
 * fail, and then says why.
 */
async function passesAt(stops: TransitStop[]): Promise<StopPasses[]> {
  let failure: unknown = null;
  const out: StopPasses[] = [];
  await Promise.all(
    stops.map(async (stop) => {
      try {
        out.push({ stop, passes: await rawArrivalsAt(stop.id) });
      } catch (error) {
        failure = failure ?? error;
      }
    }),
  );
  if (out.length === 0 && stops.length > 0 && failure) {
    throw failure;
  }
  return out;
}

/**
 * The rides between a set of boarding stops and a set of alighting stops.
 *
 * **If the same trip appears at a boarding stop and at an alighting stop, it is
 * the same bus.** The two times are the real departure and arrival, and the
 * order between them confirms the direction of travel. The trip is recognised
 * by its order within the pattern, not by `trip_id` — see `tripKeys`.
 *
 * `earliest` is the first departure accepted (seconds since 1970); `endWalk`
 * how long it takes from an alighting stop to wherever one is going, to pick
 * the pass that gets there first.
 */
function matchLegs(
  starts: StopPasses[],
  ends: StopPasses[],
  earliest: number,
  endWalk: (stop: TransitStop) => number,
): Leg[] {
  // The alighting stops first: it is against them that trips are matched.
  //
  // **A trip can pass the same stop twice**, which is why a list is kept. On a
  // circular line the stop where the trip starts is also where it ends — at
  // Cacilhas, the 3005 calls at stop 1 and at 37. Keeping only one kept the
  // first, and the trip was thrown away for "going backwards".
  type Pass = {
    stop: TransitStop;
    unix: number;
    seq: number;
    tripId: string | null;
    patternTrips: number;
  };
  const byTrip = new Map<string, Pass[]>();
  for (const { stop, passes } of ends) {
    const keys = tripKeys(passes);
    const patternTrips = tripsPerPattern(passes);
    for (const arrival of passes) {
      const when = whenItPasses(arrival);
      const key = keys.get(arrival);
      if (!key || !when) {
        continue;
      }
      const entry: Pass = {
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
  }

  const legs: Leg[] = [];
  for (const { stop, passes } of starts) {
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
      if (!leaves || !key || !candidates || leaves.unix < earliest) {
        continue;
      }
      const seq = arrival.stop_sequence ?? 0;
      const tripsHere = patternTrips.get(arrival.pattern_id as string) ?? -1;

      // Of this trip's passes at the alighting stops, the one that gets the
      // person there earliest — and only among those **after** this departure,
      // in order and in time. That prevents a trip in the opposite direction,
      // and picks the right lap of a circular line.
      let best: Pass | undefined;
      for (const c of candidates) {
        if (c.unix <= leaves.unix || c.seq <= seq || c.stop.id === stop.id) {
          continue;
        }
        if (!best || c.unix + endWalk(c.stop) < best.unix + endWalk(best.stop)) {
          best = c;
        }
      }
      if (!best) {
        continue;
      }

      // The two checks that the order really identifies the same trip: both
      // ends must have **the same number of trips** of the pattern, and when
      // both carry a `trip_id` (real time) they must agree. Better no trip than
      // one that sends the person to the stop at the wrong time.
      if (tripsHere < 0 || tripsHere !== best.patternTrips) {
        continue;
      }
      if (arrival.trip_id && best.tripId && arrival.trip_id !== best.tripId) {
        continue;
      }

      legs.push({
        key,
        patternId: String(arrival.pattern_id ?? ''),
        fromSeq: seq,
        toSeq: best.seq,
        line: lineLabel(arrival.line_id ?? arrival.route_id),
        headsign: arrival.headsign ?? '',
        from: stop,
        to: best.stop,
        departsAt: leaves.unix,
        arrivesAt: best.unix,
        stops: Math.max(1, best.seq - seq),
        live: leaves.live,
      });
    }
  }
  return legs;
}

/**
 * Whether a trip gets there before walking the whole way would (straight line
 * × `WALK_DETOUR`, at `WALK_SPEED_MS`). A bus that arrives after one could
 * have walked there is no option — the author's point about a change that
 * waited five hours where walking took less.
 */
export function beatsWalking(
  trip: TransitTrip,
  origin: Coordinates,
  destination: Coordinates,
  now = Date.now() / 1000,
): boolean {
  return trip.reachAt - now < walkSeconds(distanceMeters(origin, destination));
}

/** At most how many places are tried to change buses. */
const TRANSFER_STOPS = 6;

/** Minimum time to change buses, on top of any walk between stops, in seconds. */
const TRANSFER_MIN_S = 120;

/**
 * How far one may walk between two stops to change buses. Terminals such as
 * Sete Rios have the arriving and departing lines at different stops a few
 * dozen metres apart; a change only at the very same stop missed them.
 */
const TRANSFER_WALK_M = 250;

/** A place to change: get off at `off`, walk `meters`, get on at `on`. */
interface ChangePlace {
  off: TransitStop;
  on: TransitStop;
  meters: number;
}

/**
 * Where one could change buses, and the stops worth asking about at each end.
 *
 * **Without any request.** `/stops` (already in memory) says which patterns pass
 * at each stop. A stop served by a pattern that also passes near the origin,
 * next to (or the same as) a stop served by one that also passes near the
 * destination, is a place where two buses meet. Of those, the ones that make
 * the least detour from the straight line come first — a change in the
 * opposite direction is not a way there. Whether the buses go the right way,
 * and at what times, is then settled by the real arrivals, as for direct trips.
 */
async function transferPlan(
  origin: Coordinates,
  destination: Coordinates,
): Promise<{ starts: TransitStop[]; places: ChangePlace[]; ends: TransitStop[] } | null> {
  const [all, nearStart, nearEnd] = await Promise.all([
    loadStops(),
    stopsNear(origin, TRANSIT_WALK_MAX_M),
    stopsNear(destination, TRANSIT_WALK_MAX_M),
  ]);
  if (nearStart.length === 0 || nearEnd.length === 0) {
    return null;
  }

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
  const fromStart = nearestByPattern(nearStart);
  const fromEnd = nearestByPattern(nearEnd);
  if (fromStart.size === 0 || fromEnd.size === 0) {
    return null;
  }

  // Stops reached by a bus from the origin, and stops left by a bus to the
  // destination — away from both ends: within walking distance of an end it is
  // not a change, it is a direct bus.
  const farFromEnds = (stop: TransitStop) =>
    distanceMeters(origin, stop.coordinates) >= TRANSIT_WALK_MAX_M &&
    distanceMeters(stop.coordinates, destination) >= TRANSIT_WALK_MAX_M;
  const offStops = all.filter((s) => farFromEnds(s) && s.patterns.some((p) => fromStart.has(p)));
  const onStops = all.filter(
    (s) => farFromEnds(s) && s.patterns.some((p) => fromEnd.has(p) && !fromStart.has(p)),
  );

  // A coarse grid so the pairs within walking distance are found without
  // comparing every stop with every other.
  const cell = (c: Coordinates) => `${Math.floor(c.latitude * 400)}:${Math.floor(c.longitude * 300)}`;
  const grid = new Map<string, TransitStop[]>();
  for (const s of onStops) {
    const k = cell(s.coordinates);
    const list = grid.get(k);
    if (list) {
      list.push(s);
    } else {
      grid.set(k, [s]);
    }
  }

  const straight = distanceMeters(origin, destination);
  const candidates: (ChangePlace & { detour: number })[] = [];
  for (const off of offStops) {
    const la = Math.floor(off.coordinates.latitude * 400);
    const lo = Math.floor(off.coordinates.longitude * 300);
    let bestOn: TransitStop | null = null;
    let bestMeters = Infinity;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const on of grid.get(`${la + i}:${lo + j}`) ?? []) {
          const m = on.id === off.id ? 0 : distanceMeters(off.coordinates, on.coordinates);
          if (m <= TRANSFER_WALK_M && m < bestMeters) {
            bestOn = on;
            bestMeters = m;
          }
        }
      }
    }
    if (!bestOn) {
      continue;
    }
    const detour =
      distanceMeters(origin, off.coordinates) +
      distanceMeters(bestOn.coordinates, destination) -
      straight +
      bestMeters * 3;
    candidates.push({ off, on: bestOn, meters: bestMeters, detour });
  }
  candidates.sort((x, y) => x.detour - y.detour);
  // **Different meeting points, not the same one five times.** Consecutive
  // stops along one corridor are served by the same pair of lines, and the five
  // least-detour places used to be one crossing repeated — when those lines
  // went the wrong way, nothing was left to try. A place only counts if it adds
  // a pair of patterns not yet covered.
  const covered = new Set<string>();
  const chosen: ChangePlace[] = [];
  for (const c of candidates) {
    const pairs: string[] = [];
    for (const a of c.off.patterns) {
      if (!fromStart.has(a)) {
        continue;
      }
      for (const b of c.on.patterns) {
        if (fromEnd.has(b) && !fromStart.has(b) && !covered.has(`${a}>${b}`)) {
          pairs.push(`${a}>${b}`);
        }
      }
    }
    if (pairs.length === 0) {
      continue;
    }
    pairs.forEach((p) => covered.add(p));
    chosen.push(c);
    if (chosen.length >= TRANSFER_STOPS) {
      break;
    }
  }
  if (chosen.length === 0) {
    return null;
  }

  const starts = new Map<string, TransitStop>();
  const ends = new Map<string, TransitStop>();
  for (const c of chosen) {
    for (const p of c.off.patterns) {
      const s = fromStart.get(p);
      if (s && (starts.has(s.id) || starts.size < TRIP_STOPS_PER_SIDE)) {
        starts.set(s.id, s);
      }
    }
    for (const p of c.on.patterns) {
      const e = fromEnd.get(p);
      if (e && !fromStart.has(p) && (ends.has(e.id) || ends.size < TRIP_STOPS_PER_SIDE)) {
        ends.set(e.id, e);
      }
    }
  }
  return {
    starts: [...starts.values()],
    places: chosen.map(({ off, on, meters }) => ({
      off: { ...off, meters: 0 },
      on: { ...on, meters: 0 },
      meters,
    })),
    ends: [...ends.values()],
  };
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
 * 2. Request each one's arrivals, and match the same trip at both ends — see
 *    `matchLegs`.
 * 3. **When there is no direct bus (or only one), with one change of bus**
 *    (the author's request, November 2026): find stops where a bus from near
 *    the origin meets a bus to near the destination (`transferPlan`), ask for
 *    their arrivals too, and join a first ride to a second one leaving from the
 *    same stop at least `TRANSFER_MIN_S` later.
 * 4. Add the walking time at each end and sort by arrival time.
 *
 * ## What this does not do, and it must be said
 *
 * - **Only Carris Metropolitana buses**, in the Lisbon Metropolitan Area.
 *   Trains, metro and ferries come from `schedules.ts` and are not mixed into
 *   changes.
 * - **At most one change, at the same stop.** Walking between two stops to
 *   change is not tried.
 * - **The walking time is estimated**: straight-line distance, with a third
 *   more for the blocks. It serves to rank the options.
 *
 * Returns `null` when there are no stops within reach of either end — which is
 * different from there being no bus that serves.
 */
export async function planBusTrips(
  origin: Coordinates,
  destination: Coordinates,
  limit = 5,
  /** Leaving from this moment on (seconds since 1970); now by default. */
  at = Date.now() / 1000,
): Promise<TransitTrip[] | null> {
  let found = await busStopsFor(origin, destination);
  // **Nothing within the usual walk of the destination: look a little further**
  // (author's report, November 2026). Estefânia's nearest Carris Metropolitana
  // stops are at Marquês de Pombal and Campo Pequeno, 1 to 1.2 km away, and
  // the trip from Caparica answered "no stops nearby" where Maps offers the
  // 3709 and a quarter of an hour's walk. Only the destination's end widens,
  // and `beatsWalking` still throws out what walking would beat.
  if (found.departures.length > 0 && (found.noLink || found.arrivals.length === 0)) {
    const wide = await busStopsFor(origin, destination, TRANSIT_WALK_WIDE_M);
    if (!wide.noLink && wide.arrivals.length > 0) {
      found = wide;
    }
  }
  const { departures, arrivals, noLink } = found;
  if (!noLink && (departures.length === 0 || arrivals.length === 0)) {
    return null;
  }

  const now = at;
  const trips: TransitTrip[] = [];

  if (!noLink) {
    const [starts, ends] = await Promise.all([passesAt(departures), passesAt(arrivals)]);
    // A minute's slack: someone right at the stop still catches the bus
    // leaving any moment now.
    for (const leg of matchLegs(starts, ends, 0, (stop) => walkSeconds(stop.meters))) {
      const leaveAt = leg.departsAt - walkSeconds(leg.from.meters);
      if (leaveAt < now - 60) {
        continue;
      }
      trips.push({
        tripId: leg.key,
        kind: 'bus',
        line: leg.line,
        headsign: leg.headsign,
        from: leg.from,
        to: leg.to,
        departsAt: leg.departsAt,
        arrivesAt: leg.arrivesAt,
        leaveAt,
        reachAt: leg.arrivesAt + walkSeconds(leg.to.meters),
        stops: leg.stops,
        live: leg.live,
        ride: legRide(leg),
      });
    }
  }

  // One change of bus, only when the direct buses do not already answer.
  const directLines = new Set(trips.map((t) => t.line));
  if (directLines.size < 2) {
    const plan = await transferPlan(origin, destination);
    if (plan) {
      const offIds = new Set(plan.places.map((p) => p.off.id));
      const onIds = new Set(plan.places.map((p) => p.on.id));
      const changeStops = [
        ...new Map(plan.places.flatMap((p) => [p.off, p.on]).map((s) => [s.id, s])).values(),
      ];
      // A stop that is both a place to get off and to get on is asked once.
      const [starts, changePasses, ends] = await Promise.all([
        passesAt(plan.starts),
        passesAt(changeStops),
        passesAt(plan.ends),
      ]);
      const offPasses = changePasses.filter((p) => offIds.has(p.stop.id));
      const onSide = changePasses.filter((p) => onIds.has(p.stop.id));
      const firsts = matchLegs(starts, offPasses, 0, () => 0).filter(
        (leg) => leg.departsAt - walkSeconds(leg.from.meters) >= now - 60,
      );
      if (firsts.length > 0) {
        const earliest = Math.min(...firsts.map((l) => l.arrivesAt)) + TRANSFER_MIN_S;
        const seconds = matchLegs(onSide, ends, earliest, (stop) => walkSeconds(stop.meters));
        for (const first of firsts) {
          let best: Leg | undefined;
          let bestPlace: ChangePlace | undefined;
          for (const place of plan.places) {
            if (place.off.id !== first.to.id) {
              continue;
            }
            const ready = first.arrivesAt + TRANSFER_MIN_S + walkSeconds(place.meters);
            for (const second of seconds) {
              if (
                second.from.id !== place.on.id ||
                second.line === first.line ||
                second.departsAt < ready ||
                second.departsAt - ready > TRANSFER_MAX_WAIT_S
              ) {
                continue;
              }
              const reach = second.arrivesAt + walkSeconds(second.to.meters);
              if (!best || reach < best.arrivesAt + walkSeconds(best.to.meters)) {
                best = second;
                bestPlace = place;
              }
            }
          }
          if (!best || !bestPlace) {
            continue;
          }
          trips.push({
            tripId: `${first.key}>${best.key}`,
            kind: 'bus',
            line: first.line,
            headsign: first.headsign,
            from: first.from,
            to: best.to,
            departsAt: first.departsAt,
            arrivesAt: best.arrivesAt,
            leaveAt: first.departsAt - walkSeconds(first.from.meters),
            reachAt: best.arrivesAt + walkSeconds(best.to.meters),
            stops: first.stops + best.stops,
            live: first.live,
            ride: legRide(first),
            change: {
              at: first.to,
              boardAt: best.from,
              walkMeters: bestPlace.meters,
              arrivesAt: first.arrivesAt,
              line: best.line,
              headsign: best.headsign,
              departsAt: best.departsAt,
              ride: legRide(best),
            },
          });
        }
      }
    }
  }

  // Arrives earliest first. A line (or pair of lines) appears only once: the
  // same bus's next three passes are not three options, they are one.
  const byLine = new Map<string, TransitTrip>();
  for (const t of trips
    .filter((trip) => beatsWalking(trip, origin, destination, now))
    .sort((a, b) => a.reachAt - b.reachAt)) {
    const id = t.change ? `${t.line}>${t.change.line}` : t.line;
    if (!byLine.has(id)) {
      byLine.set(id, t);
    }
  }
  return [...byLine.values()].slice(0, limit);
}

/**
 * What kind of station it is.
 *
 * `light_rail` is light rail — on the south bank, Metro Sul do Tejo.
 */
/**
 * `bus` is a stop of a timetable-only bus operator (Carris de Lisboa, Braga's
 * TUB): drawn and opened like a station, its times from the stored timetable
 * (`scheduledBusStops`, in `schedules.ts`). Carris Metropolitana's stops are
 * not stations — they have real time.
 */
export type StationKind = 'train' | 'subway' | 'light_rail' | 'boat' | 'bus';

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
const STATION_ENDPOINTS: Record<Exclude<StationKind, 'bus'>, string> = {
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
  bus: 'bus-clock',
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
      (Object.keys(STATION_ENDPOINTS) as Exclude<StationKind, 'bus'>[]).map(async (kind) => {
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


// --- Bus and rail in one trip ---------------------------------------------------
//
// Carris Metropolitana's buses come from the network, the train, metro, ferry and
// Carris de Lisboa from the stored timetables, and until November 2026 a trip used
// one or the other. From Caparica to Estefânia (author's report) the answer is a
// bus to Marquês de Pombal and the metro on — both halves existed and nothing
// joined them. These two functions give the bus half; `transitPlan.ts` joins it
// to the timetable half from `schedules.ts`.

/** A place where the other half of a mixed trip starts or ends: a station. */
export interface RailPoint {
  coordinates: Coordinates;
  /** For a station one arrives at by rail: when, at the earliest. */
  arrives?: number;
}

/** A bus leg of a mixed trip, as a trip of its own, with the station it serves. */
export interface BusHalf {
  trip: TransitTrip;
  /** Index into the `RailPoint` list given. */
  point: number;
  /** Walk between the bus stop and the station, in metres. */
  walkMeters: number;
}

/** How far a bus stop may be from a station for a change between the two. */
const MIXED_WALK_M = 300;

/** Carris stops within `MIXED_WALK_M` of each point, with the point and distance. */
async function stopsByPoints(
  points: RailPoint[],
  keep: (stop: TransitStop) => boolean,
): Promise<Map<string, { stop: TransitStop; point: number; meters: number }>> {
  const all = await loadStops();
  const cell = (c: Coordinates) => `${Math.floor(c.latitude * 300)}:${Math.floor(c.longitude * 250)}`;
  const grid = new Map<string, number[]>();
  points.forEach((p, i) => {
    const k = cell(p.coordinates);
    const list = grid.get(k);
    if (list) {
      list.push(i);
    } else {
      grid.set(k, [i]);
    }
  });
  const out = new Map<string, { stop: TransitStop; point: number; meters: number }>();
  for (const stop of all) {
    if (!keep(stop)) {
      continue;
    }
    const la = Math.floor(stop.coordinates.latitude * 300);
    const lo = Math.floor(stop.coordinates.longitude * 250);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const p of grid.get(`${la + i}:${lo + j}`) ?? []) {
          const m = distanceMeters(stop.coordinates, points[p].coordinates);
          const known = out.get(stop.id);
          if (m <= MIXED_WALK_M && (!known || m < known.meters)) {
            out.set(stop.id, { stop, point: p, meters: m });
          }
        }
      }
    }
  }
  return out;
}

/** Of many candidate stops, a few that each add a pattern not yet covered. */
function pickCovering(
  candidates: { stop: TransitStop; detour: number }[],
  useful: (pattern: string) => boolean,
): TransitStop[] {
  candidates.sort((a, b) => a.detour - b.detour);
  const covered = new Set<string>();
  const chosen: TransitStop[] = [];
  for (const c of candidates) {
    const adds = c.stop.patterns.filter((p) => useful(p) && !covered.has(p));
    if (adds.length === 0) {
      continue;
    }
    adds.forEach((p) => covered.add(p));
    chosen.push(c.stop);
    if (chosen.length >= TRANSFER_STOPS) {
      break;
    }
  }
  return chosen;
}

function legTrip(leg: Leg, startWalk: number, endWalk: number): TransitTrip {
  return {
    tripId: leg.key,
    kind: 'bus',
    line: leg.line,
    headsign: leg.headsign,
    from: leg.from,
    to: leg.to,
    departsAt: leg.departsAt,
    arrivesAt: leg.arrivesAt,
    leaveAt: leg.departsAt - startWalk,
    reachAt: leg.arrivesAt + endWalk,
    stops: leg.stops,
    live: leg.live,
    ride: legRide(leg),
  };
}

/**
 * Buses from near the origin to stops next to the given stations — the first
 * half of "bus, then the metro". Asks the arrivals of a few stops at each end,
 * as `planBusTrips` does.
 */
export async function busToPoints(
  origin: Coordinates,
  destination: Coordinates,
  points: RailPoint[],
  at = Date.now() / 1000,
): Promise<BusHalf[]> {
  if (points.length === 0) {
    return [];
  }
  const nearStart = await stopsNear(origin, TRANSIT_WALK_MAX_M);
  const fromStart = new Map<string, TransitStop>();
  for (const stop of nearStart) {
    for (const p of stop.patterns) {
      if (!fromStart.has(p)) {
        fromStart.set(p, stop);
      }
    }
  }
  if (fromStart.size === 0) {
    return [];
  }
  const near = await stopsByPoints(
    points,
    (s) =>
      distanceMeters(origin, s.coordinates) >= TRANSIT_WALK_MAX_M &&
      s.patterns.some((p) => fromStart.has(p)),
  );
  const straight = distanceMeters(origin, destination);
  const offs = pickCovering(
    [...near.values()].map(({ stop, point }) => ({
      stop,
      detour:
        distanceMeters(origin, stop.coordinates) +
        distanceMeters(points[point].coordinates, destination) -
        straight,
    })),
    (p) => fromStart.has(p),
  );
  if (offs.length === 0) {
    return [];
  }
  const starts = new Map<string, TransitStop>();
  for (const off of offs) {
    for (const p of off.patterns) {
      const s = fromStart.get(p);
      if (s && (starts.has(s.id) || starts.size < TRIP_STOPS_PER_SIDE)) {
        starts.set(s.id, s);
      }
    }
  }
  const [startPasses, offPasses] = await Promise.all([
    passesAt([...starts.values()]),
    passesAt(offs.map((s) => ({ ...s, meters: 0 }))),
  ]);
  const now = at;
  const out: BusHalf[] = [];
  for (const leg of matchLegs(startPasses, offPasses, 0, () => 0)) {
    const walkIn = walkSeconds(leg.from.meters);
    if (leg.departsAt - walkIn < now - 60) {
      continue;
    }
    const at = near.get(leg.to.id);
    if (!at) {
      continue;
    }
    out.push({ trip: legTrip(leg, walkIn, 0), point: at.point, walkMeters: at.meters });
  }
  return out;
}

/**
 * Buses from stops next to the given stations to near the destination — the
 * second half of "the train, then a bus". A bus counts only if it leaves after
 * the train arrives (`RailPoint.arrives`) plus the walk and `TRANSFER_MIN_S`.
 */
export async function busFromPoints(
  origin: Coordinates,
  destination: Coordinates,
  points: RailPoint[],
): Promise<BusHalf[]> {
  if (points.length === 0) {
    return [];
  }
  const nearEnd = await stopsNear(destination, TRANSIT_WALK_MAX_M);
  const fromEnd = new Map<string, TransitStop>();
  for (const stop of nearEnd) {
    for (const p of stop.patterns) {
      if (!fromEnd.has(p)) {
        fromEnd.set(p, stop);
      }
    }
  }
  if (fromEnd.size === 0) {
    return [];
  }
  const near = await stopsByPoints(
    points,
    (s) =>
      distanceMeters(s.coordinates, destination) >= TRANSIT_WALK_MAX_M &&
      s.patterns.some((p) => fromEnd.has(p)),
  );
  const straight = distanceMeters(origin, destination);
  const ons = pickCovering(
    [...near.values()].map(({ stop, point }) => ({
      stop,
      detour:
        distanceMeters(origin, points[point].coordinates) +
        distanceMeters(stop.coordinates, destination) -
        straight,
    })),
    (p) => fromEnd.has(p),
  );
  if (ons.length === 0) {
    return [];
  }
  const ends = new Map<string, TransitStop>();
  for (const on of ons) {
    for (const p of on.patterns) {
      const e = fromEnd.get(p);
      if (e && (ends.has(e.id) || ends.size < TRIP_STOPS_PER_SIDE)) {
        ends.set(e.id, e);
      }
    }
  }
  const earliest = Math.min(...points.map((p) => p.arrives ?? Infinity));
  const [onPasses, endPasses] = await Promise.all([
    passesAt(ons.map((s) => ({ ...s, meters: 0 }))),
    passesAt([...ends.values()]),
  ]);
  const out: BusHalf[] = [];
  for (const leg of matchLegs(onPasses, endPasses, Number.isFinite(earliest) ? earliest : 0, (stop) =>
    walkSeconds(stop.meters),
  )) {
    const at = near.get(leg.from.id);
    if (!at) {
      continue;
    }
    const ready = (points[at.point].arrives ?? 0) + TRANSFER_MIN_S + walkSeconds(at.meters);
    if (leg.departsAt < ready || leg.departsAt - ready > TRANSFER_MAX_WAIT_S) {
      continue;
    }
    out.push({ trip: legTrip(leg, 0, walkSeconds(leg.to.meters)), point: at.point, walkMeters: at.meters });
  }
  return out;
}
