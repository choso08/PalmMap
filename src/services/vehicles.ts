import { lineLabel } from './transit';
import axios from 'axios';

import {
  CARRIS_BASE_URL,
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
  /** The line number, as painted on the bus. */
  line: string;
  coordinates: Coordinates;
  /** Where it is pointing, in degrees. `null` when the service does not say. */
  bearing: number | null;
  /** How fast it is going, in km/h. */
  speedKmh: number;
  /** Whether it is standing at a stop right now. */
  atStop: boolean;
  /** How many seconds ago it reported in. */
  ageSeconds: number;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * The buses that really are moving now.
 *
 * Returns an empty list when there are none — which in the small hours is the
 * right answer, not a fault.
 */
export async function liveVehicles(): Promise<LiveVehicle[]> {
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
      line: lineLabel(vehicle.line_id ?? vehicle.route_id),
      coordinates: { latitude, longitude },
      bearing: toNumber(vehicle.bearing),
      // The service sends metres per second; everyone's speedometer is in
      // kilometres per hour.
      speedKmh: Math.round(speed * 3.6),
      atStop: vehicle.current_status === 'STOPPED_AT',
      ageSeconds: Math.round(age),
    });
  }

  return moving;
}
