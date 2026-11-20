import { lineLabel } from './transit';
import axios from 'axios';
import { transit_realtime } from 'gtfs-realtime-bindings';

import { carrisLisboaLine, installedFeeds } from './schedules';

import {
  CARRIS_BASE_URL,
  CARRIS_LISBOA_FEED_ID,
  CARRIS_LISBOA_VEHICLES_URL,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
  VEHICLE_MAX_AGE_S,
} from './config';
import type { Coordinates } from '../types/geo';
import type { CarrisVehicle } from '../types/transit';

/**
 * Carris Metropolitana's buses, where they are right now.
 *
 * It is the same as what their website's map shows: the buses moving, each with
 * its line number. It comes from the same open API as the arrival times, with
 * no key at all, and **in JSON** — not in Protobuf, which would have required a
 * library just to decode it.
 *
 * ## The trap, and it is a big one
 *
 * The service returns **the whole fleet**, not the buses that are moving. That
 * is 1679 vehicles, 1550 of which carry a position — but that position is the
 * **last known one**, which for most of them is where they were parked.
 * Measured in the small hours: the median age was **nine hours**, the worst
 * twelve days.
 *
 * Drawing the list as it comes filled the map with fifteen hundred buses
 * standing in depots. So only those that reported in less than
 * `VEHICLE_MAX_AGE_S` ago are kept. **Do not switch this filter off** — without
 * it this is not a feature, it is a wrong map.
 *
 * ## And the weight
 *
 * The response is about **1.1 MB**, and there is no way to ask for less: there
 * is no filter by area or by line (`by_line` answers 404). It travels
 * compressed, which brings it to around 150 KB, but it is still the heaviest
 * request this app makes.
 *
 * That is why this only runs **on the transport map type**, **above a zoom
 * level** and with a setting to turn it off. See `App.tsx`.
 *
 * ## About the field names
 *
 * They were **read from a real response**, not guessed — this project already
 * has on record what guessing the same API's fields cost. They are `lat`,
 * `lon`, `bearing`, `line_id`, `trip_id`, `speed`, `timestamp` and
 * `current_status`.
 */

const client = axios.create({
  baseURL: CARRIS_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
});

/** A moving bus, ready for the map. */
export interface LiveVehicle {
  id: string;
  /**
   * Carris Metropolitana (`cm`, JSON API), Carris de Lisboa (`cl`, GTFS-RT),
   * or the id of a downloaded timetable whose operator publishes GTFS-RT
   * positions (`posicoes` in its manifest entry: Rome, Kraków, Bucharest…).
   */
  operator: string;
  /** The GTFS route id (Carris de Lisboa: `172_1`), to find its timetable. */
  routeId: string | null;
  /** The sequence of `stopId` in its trip, when the feed says. */
  stopSequence: number | null;
  /** The line number, as painted on the bus. */
  line: string;
  coordinates: Coordinates;
  /** Where it is pointing, in degrees. `null` when the service does not say. */
  bearing: number | null;
  /** How fast it is going, in km/h. */
  speedKmh: number;
  /** Whether it is standing at a stop right now. */
  atStop: boolean;
  /** How many seconds ago it reported in, when the list was fetched. */
  ageSeconds: number;
  /** When it reported in, in seconds since 1970 — for "updated N s ago". */
  reportedAt: number;
  /** The pattern it runs (`[…]1529_0_1`), to place it on its way. */
  patternId: string | null;
  /** Its trip, whose timetable says when it is due at each stop. */
  tripId: string | null;
  /**
   * The stop `current_status` speaks of: the one it stands at, or the one it
   * is heading to. A plain id, as in the pattern's path (probed).
   */
  stopId: string | null;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Where each operator runs, roughly: west, south, east, north. */
const CM_AREA: [number, number, number, number] = [-9.52, 38.4, -8.47, 39.08];
const CL_AREA: [number, number, number, number] = [-9.24, 38.68, -9.08, 38.8];

/** Which operators to ask, by id (`cm`, `cl`, or a timetable's id). */
export type VehicleOperators = Record<string, boolean>;

/**
 * The other operators with live positions: downloaded timetables whose entry
 * names a GTFS-RT address. Only https (Android refuses cleartext), and never
 * Carris Metropolitana's or Carris de Lisboa's own, read their own way above.
 */
function otherLiveFeeds(): { id: string; url: string; bbox: [number, number, number, number] }[] {
  return installedFeeds()
    .filter(
      (f) =>
        typeof f.posicoes === 'string' &&
        f.posicoes.startsWith('https://') &&
        f.id !== CARRIS_LISBOA_FEED_ID &&
        f.id !== 'carris-metropolitana' &&
        Array.isArray(f.bbox) &&
        f.bbox.length === 4,
    )
    .map((f) => ({ id: f.id, url: f.posicoes as string, bbox: f.bbox }));
}

/**
 * Which operators' buses the view can show: an operator whose area does not
 * touch it is not asked (each ask is the whole fleet).
 */
export function vehicleAreas(bounds: {
  west: number;
  south: number;
  east: number;
  north: number;
}): VehicleOperators {
  const touches = ([w, s, e, n]: [number, number, number, number]) =>
    bounds.west <= e && bounds.east >= w && bounds.south <= n && bounds.north >= s;
  const areas: VehicleOperators = { cm: touches(CM_AREA), cl: touches(CL_AREA) };
  for (const feed of otherLiveFeeds()) {
    areas[feed.id] = touches(feed.bbox);
  }
  return areas;
}

/** The operators that are on, as a short key that changes only with the set. */
export function operatorsKey(which: VehicleOperators): string {
  return Object.keys(which)
    .filter((k) => which[k])
    .sort()
    .join(',');
}

/** The key back into operators. */
export function operatorsFromKey(key: string): VehicleOperators {
  return Object.fromEntries(
    key
      .split(',')
      .filter(Boolean)
      .map((k) => [k, true]),
  );
}

/** The operator of a bus, from its id (`cl:123`, `roma:456`; Carris Metropolitana's have none). */
export function operatorOfId(id: string): string {
  const colon = id.indexOf(':');
  return colon > 0 ? id.slice(0, colon) : 'cm';
}

/**
 * The buses that really are moving now.
 *
 * Returns an empty list when there are none — which in the small hours is the
 * right answer, not a fault.
 */
export async function liveVehicles(
  which: VehicleOperators = { cm: true, cl: true },
): Promise<LiveVehicle[]> {
  // Each operator on its own: one failing leaves the others' buses. Only those
  // whose area the map shows are asked (`vehicleAreas`): Carris de Lisboa's
  // 45 KB, which its server does not compress, are no use over Almada.
  const asks: Promise<LiveVehicle[]>[] = [];
  if (which.cm) {
    asks.push(metropolitanaVehicles());
  }
  if (which.cl) {
    asks.push(
      gtfsRtVehicles(CARRIS_LISBOA_VEHICLES_URL, 'cl', (routeId) => carrisLisboaLine(routeId)),
    );
  }
  for (const feed of otherLiveFeeds()) {
    if (which[feed.id]) {
      asks.push(
        gtfsRtVehicles(feed.url, feed.id, (routeId) => carrisLisboaLine(routeId, feed.id)),
      );
    }
  }
  if (asks.length === 0) {
    return [];
  }
  const results = await Promise.allSettled(asks);
  const ok = results.filter(
    (r): r is PromiseFulfilledResult<LiveVehicle[]> => r.status === 'fulfilled',
  );
  if (ok.length === 0) {
    throw (results[0] as PromiseRejectedResult).reason;
  }
  return ok.flatMap((r) => r.value);
}

/**
 * How long a bus missing from a fresh list stays on the map at its last
 * position (author, 19 November 2026: a bus that reports every 11 s while the
 * map asks every 10 s should not blink out). Its own age filter still
 * applies on top (`VEHICLE_MAX_AGE_S`).
 */
const MISSING_GRACE_S = 45;
/** When each bus was last in a list, by id. */
const lastListed = new Map<string, number>();

/**
 * The new list joined with the old: a bus that is in the old one and not in
 * the new one stays while it was listed within `MISSING_GRACE_S` and is still
 * fresh enough; of two copies of a bus, the newer report wins. Only the
 * operators asked are kept (`which`).
 */
export function mergeVehicles(
  before: LiveVehicle[],
  fresh: LiveVehicle[],
  which: VehicleOperators,
): LiveVehicle[] {
  const now = Date.now() / 1000;
  const byId = new Map<string, LiveVehicle>();
  for (const v of fresh) {
    byId.set(v.id, v);
    lastListed.set(v.id, now);
  }
  for (const old of before) {
    if (!which[old.operator]) {
      continue;
    }
    const newer = byId.get(old.id);
    if (newer) {
      if (old.reportedAt > newer.reportedAt) {
        byId.set(old.id, old);
      }
      continue;
    }
    const seen = lastListed.get(old.id) ?? 0;
    if (now - seen <= MISSING_GRACE_S && now - old.reportedAt <= VEHICLE_MAX_AGE_S) {
      byId.set(old.id, { ...old, ageSeconds: Math.round(now - old.reportedAt) });
    }
  }
  if (lastListed.size > 5000) {
    for (const [id, at] of lastListed) {
      if (now - at > MISSING_GRACE_S) {
        lastListed.delete(id);
      }
    }
  }
  return [...byId.values()];
}

/** Per operator: the newest report seen. */
const newestSeen: Record<string, number> = {};
let earlyRetries = 0;
/** When an ask brought nothing newer, the one retry comes this soon. */
const EARLY_RETRY_MS = 3000;

/**
 * How long to wait before the next ask: the interval the person chose
 * (`baseMs`), and when an ask brought nothing newer than the last, one retry
 * 3 s later instead of a whole interval (author, 19 November 2026: "if it
 * only updates at 11 s it disappears" — the buses kept through a miss and the
 * glide do the rest).
 *
 * It used to "learn each feed's pace" from the step between the newest
 * reports and wait until the next was due. **That measured the app, not the
 * feed**: ~900 buses report at their own moments (922 of 950 positions change
 * in 10 s), so the newest report always sits about a second behind the ask,
 * and the step between two is the app's own interval plus that second. Fed
 * back, each wait grew the next — 10 s crept to 18 s, 20 s to 33 s and on to
 * the one-minute ceiling (author, 20 November 2026: "transport now takes
 * 1 min to update"; simulated, same curve). There is no beat to catch.
 */
export function nextVehiclesDelay(list: LiveVehicle[], baseMs: number): number {
  let gotNew = false;
  const newest: Record<string, number> = {};
  for (const v of list) {
    if (v.reportedAt > (newest[v.operator] ?? 0)) {
      newest[v.operator] = v.reportedAt;
    }
  }
  for (const [op, at] of Object.entries(newest)) {
    if (at > (newestSeen[op] ?? 0)) {
      newestSeen[op] = at;
      gotNew = true;
    }
  }
  if (!gotNew && list.length > 0 && earlyRetries < 1) {
    earlyRetries += 1;
    return EARLY_RETRY_MS;
  }
  earlyRetries = 0;
  return baseMs;
}

/** Carris Metropolitana's fleet, from its JSON API. */
async function metropolitanaVehicles(): Promise<LiveVehicle[]> {
  const { data } = await client.get<CarrisVehicle[]>('/vehicles');

  const now = Date.now() / 1000;
  const moving: LiveVehicle[] = [];

  for (const vehicle of Array.isArray(data) ? data : []) {
    const latitude = toNumber(vehicle.lat);
    const longitude = toNumber(vehicle.lon);
    const rawTimestamp = toNumber(vehicle.timestamp);
    // **Milliseconds since the TML hub, seconds before.** Measured on 9
    // November 2026: every timestamp was ~1.79e12, and read as seconds every
    // bus looked like it came from the future and was dropped — an empty map
    // with no error at all. Anything above 1e12 is milliseconds; a value in
    // seconds will not reach that for another thirty thousand years.
    const reportedAt =
      rawTimestamp !== null && rawTimestamp > 1e12 ? rawTimestamp / 1000 : rawTimestamp;

    // Without a position it is a fleet record, not a bus on the street.
    if (latitude === null || longitude === null || reportedAt === null || !vehicle.id) {
      continue;
    }

    // The filter that makes this worth anything. See the note at the top.
    const age = now - reportedAt;
    if (age < 0 || age > VEHICLE_MAX_AGE_S) {
      continue;
    }

    const speed = toNumber(vehicle.speed) ?? 0;

    moving.push({
      id: vehicle.id,
      operator: 'cm',
      routeId: vehicle.route_id ?? null,
      stopSequence: null,
      line: lineLabel(vehicle.line_id ?? vehicle.route_id),
      coordinates: { latitude, longitude },
      bearing: toNumber(vehicle.bearing),
      // The service sends metres per second; everyone's speedometer is in
      // kilometres per hour.
      speedKmh: Math.round(speed * 3.6),
      atStop: vehicle.current_status === 'STOPPED_AT',
      ageSeconds: Math.round(age),
      reportedAt,
      patternId: vehicle.pattern_id ?? null,
      tripId: vehicle.trip_id ?? null,
      stopId: vehicle.stop_id ?? null,
    });
  }

  return moving;
}

/** Protobuf numbers come as `Long` above 2^53-safe sizes; plain numbers here. */
function plain(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  const n =
    typeof value === 'number'
      ? value
      : typeof (value as { toNumber?: () => number }).toNumber === 'function'
        ? (value as { toNumber: () => number }).toNumber()
        : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Any operator's GTFS-RT vehicle positions — Carris de Lisboa's, and since
 * November 2026 those of other countries' downloaded timetables. First
 * written for Carris de Lisboa's buses and trams, from their GTFS-RT feed — Protobuf,
 * decoded with `gtfs-realtime-bindings` (the official bindings, on
 * `protobufjs/minimal`: no `eval`, fine on Hermes). About 10 KB for the whole
 * fleet, so it costs next to nothing beside Carris Metropolitana's list.
 *
 * Read from a real feed (16 November 2026): `trip.route_id` `172_1` (the
 * public number, 735, comes from the stored timetable), `stop_id` and
 * `current_stop_sequence`, `current_status` 2 (in transit), `timestamp` in
 * seconds, no bearing or speed.
 */
async function gtfsRtVehicles(
  url: string,
  operator: string,
  lineOf: (routeId: string | null) => string | null,
): Promise<LiveVehicle[]> {
  const { data } = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: REQUEST_TIMEOUT_MS,
    headers: { 'User-Agent': USER_AGENT },
  });
  const feed = transit_realtime.FeedMessage.decode(new Uint8Array(data));
  const now = Date.now() / 1000;
  const moving: LiveVehicle[] = [];
  const Status = transit_realtime.VehiclePosition.VehicleStopStatus;

  for (const entity of feed.entity ?? []) {
    const v = entity.vehicle;
    const position = v?.position;
    if (!v || !position) {
      continue;
    }
    let reportedAt = plain(v.timestamp);
    if (reportedAt !== null && reportedAt > 1e12) {
      reportedAt /= 1000;
    }
    if (reportedAt === null) {
      continue;
    }
    // The same filter as for Carris Metropolitana — see the note at the top.
    const age = now - reportedAt;
    if (age < -30 || age > VEHICLE_MAX_AGE_S) {
      continue;
    }
    const routeId = v.trip?.routeId || null;
    const speed = plain(position.speed);
    moving.push({
      id: `${operator}:${v.vehicle?.id || entity.id}`,
      operator,
      routeId,
      stopSequence: plain(v.currentStopSequence),
      // The number from the stored timetable. Without it, other operators'
      // route ids are often the number itself; Carris de Lisboa's (`172_1`)
      // never are, so its buses then show none.
      line: lineOf(routeId) ?? (operator === 'cl' ? '' : (routeId ?? '')),
      coordinates: { latitude: position.latitude, longitude: position.longitude },
      bearing: position.bearing ? position.bearing : null,
      speedKmh: speed ? Math.round(speed * 3.6) : 0,
      atStop: v.currentStatus === Status.STOPPED_AT,
      ageSeconds: Math.max(0, Math.round(age)),
      reportedAt: Math.min(reportedAt, now),
      patternId: null,
      tripId: v.trip?.tripId || null,
      stopId: v.stopId || null,
    });
  }
  return moving;
}
