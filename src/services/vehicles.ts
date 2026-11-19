import { lineLabel } from './transit';
import axios from 'axios';
import { transit_realtime } from 'gtfs-realtime-bindings';

import { carrisLisboaLine } from './schedules';

import {
  CARRIS_BASE_URL,
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
  /** Carris Metropolitana (JSON API) or Carris de Lisboa (GTFS-RT). */
  operator: 'cm' | 'cl';
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

/**
 * Which operators' buses the view can show: an operator whose area does not
 * touch it is not asked (each ask is the whole fleet).
 */
export function vehicleAreas(bounds: {
  west: number;
  south: number;
  east: number;
  north: number;
}): { cm: boolean; cl: boolean } {
  const touches = ([w, s, e, n]: [number, number, number, number]) =>
    bounds.west <= e && bounds.east >= w && bounds.south <= n && bounds.north >= s;
  return { cm: touches(CM_AREA), cl: touches(CL_AREA) };
}

/**
 * The buses that really are moving now.
 *
 * Returns an empty list when there are none — which in the small hours is the
 * right answer, not a fault.
 */
export async function liveVehicles(
  which: { cm: boolean; cl: boolean } = { cm: true, cl: true },
): Promise<LiveVehicle[]> {
  // Each operator on its own: one failing leaves the other's buses. Only those
  // whose area the map shows are asked (`vehicleAreas`): Carris de Lisboa's
  // 45 KB, which its server does not compress, are no use over Almada.
  const [cm, cl] = await Promise.allSettled([
    which.cm ? metropolitanaVehicles() : Promise.resolve([]),
    which.cl ? lisboaVehicles() : Promise.resolve([]),
  ]);
  if (cm.status === 'rejected' && cl.status === 'rejected') {
    throw cm.reason;
  }
  return [
    ...(cm.status === 'fulfilled' ? cm.value : []),
    ...(cl.status === 'fulfilled' ? cl.value : []),
  ];
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
  which: { cm: boolean; cl: boolean },
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

/** Per operator: the newest report seen, how often new ones come, and retries. */
const feedClock: Record<'cm' | 'cl', { newest: number; period: number | null }> = {
  cm: { newest: 0, period: null },
  cl: { newest: 0, period: null },
};
let earlyRetries = 0;
/** When the last list was asked for (s): a long gap measures the app, not the feed. */
let lastAskAt = 0;
/** A second after the data is due, for the server to have it. */
const DUE_MARGIN_S = 1.5;
/** When an ask brought nothing newer, the one retry comes this soon. */
const EARLY_RETRY_MS = 3000;

/**
 * How long to wait before the next ask, from what the last one brought
 * (author, 19 November 2026: "if it only updates at 11 s…"). Each operator's
 * newest report shows how often its data really changes; the next ask goes a
 * moment after the next change is due — never sooner than the interval the
 * person chose (`baseMs`, the data they agreed to spend), and when the
 * feed is slower than that, not before it has anything new. An ask that
 * brought nothing newer is retried once, 3 s later, instead of a whole
 * interval later.
 */
export function nextVehiclesDelay(list: LiveVehicle[], baseMs: number): number {
  const now = Date.now() / 1000;
  // The step between two newest reports is the feed's own pace only when the
  // two asks were close: after a pause (Settings open, the app in the
  // background) it is the pause, and learning it left the buses refreshing
  // every 30–60 s for the rest of the session (code review, 19 November 2026).
  const sinceAsk = lastAskAt > 0 ? now - lastAskAt : Infinity;
  lastAskAt = now;
  const asksClose = sinceAsk <= (baseMs / 1000) * 1.5 + DUE_MARGIN_S + 2;
  let gotNew = false;
  let latestDue: number | null = null;
  for (const op of ['cm', 'cl'] as const) {
    let newest = 0;
    for (const v of list) {
      if (v.operator === op && v.reportedAt > newest) {
        newest = v.reportedAt;
      }
    }
    if (newest === 0) {
      continue;
    }
    const clock = feedClock[op];
    if (newest > clock.newest) {
      const step = newest - clock.newest;
      if (clock.newest > 0 && asksClose && step >= 3 && step <= 120) {
        clock.period = clock.period === null ? step : clock.period * 0.6 + step * 0.4;
      }
      clock.newest = newest;
      gotNew = true;
    }
    if (clock.period !== null) {
      const due = clock.newest + clock.period + DUE_MARGIN_S;
      latestDue = latestDue === null ? due : Math.min(latestDue, due);
    }
  }
  if (!gotNew && list.length > 0 && earlyRetries < 1) {
    earlyRetries += 1;
    return EARLY_RETRY_MS;
  }
  earlyRetries = 0;
  if (latestDue === null) {
    return baseMs;
  }
  const untilDue = (latestDue - now) * 1000;
  return Math.round(Math.min(Math.max(baseMs, untilDue), Math.max(baseMs * 3, 60000)));
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
 * Carris de Lisboa's buses and trams, from their GTFS-RT feed — Protobuf,
 * decoded with `gtfs-realtime-bindings` (the official bindings, on
 * `protobufjs/minimal`: no `eval`, fine on Hermes). About 10 KB for the whole
 * fleet, so it costs next to nothing beside Carris Metropolitana's list.
 *
 * Read from a real feed (16 November 2026): `trip.route_id` `172_1` (the
 * public number, 735, comes from the stored timetable), `stop_id` and
 * `current_stop_sequence`, `current_status` 2 (in transit), `timestamp` in
 * seconds, no bearing or speed.
 */
async function lisboaVehicles(): Promise<LiveVehicle[]> {
  const { data } = await axios.get<ArrayBuffer>(CARRIS_LISBOA_VEHICLES_URL, {
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
      id: `cl:${v.vehicle?.id || entity.id}`,
      operator: 'cl',
      routeId,
      stopSequence: plain(v.currentStopSequence),
      line: carrisLisboaLine(routeId) ?? '',
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
