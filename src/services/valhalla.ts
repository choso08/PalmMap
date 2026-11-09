import axios from 'axios';

import { REQUEST_TIMEOUT_MS, USER_AGENT, VALHALLA_URL } from './config';
import type { Coordinates, Route, RouteStep } from '../types/geo';
import type { OsrmManeuver } from '../types/osrm';
import type { ValhallaManeuver, ValhallaRouteResponse, ValhallaTrip } from '../types/valhalla';
import { describeManeuver, maneuverIcon } from '../utils/maneuvers';
import { distanceMeters } from '../utils/geometry';

/**
 * Bicycle routes from FOSSGIS's **Valhalla**, the second engine behind
 * openstreetmap.org's directions.
 *
 * Why it exists: OSRM's bicycle profile has one kind of bike, and it sent the
 * author up an overgrown lane above Trafaria (tagged as a plain residential
 * street) to avoid the main road. Valhalla knows the **type of bicycle** and
 * how much to avoid bad surfaces. Probed on that very trip: `Road` and
 * `Hybrid` stay on the EN 377-1, `Mountain` takes Rua 28 de Setembro and the
 * dirt track — exactly the three behaviours asked for.
 *
 * Same organisation and same terms as the OSRM servers (one request a second,
 * a User-Agent, attribution), so it shares OSRM's queue — the caller passes it.
 * If it fails, the caller falls back to OSRM's bicycle server.
 */

export type BikeType = 'road' | 'normal' | 'mtb';

/** What each choice means to Valhalla. */
const COSTING: Record<BikeType, Record<string, string | number>> = {
  // Paved only: road tyres. Valhalla's road bike avoids bad surfaces entirely.
  road: { bicycle_type: 'Road', avoid_bad_surfaces: 1, use_roads: 0.5 },
  // Everyday bike: prefers cycle paths and quiet streets, avoids rough ones.
  normal: { bicycle_type: 'Hybrid', avoid_bad_surfaces: 0.25 },
  // Anything goes: tracks and trails welcome.
  mtb: { bicycle_type: 'Mountain', avoid_bad_surfaces: 0, use_roads: 0.25 },
};

const client = axios.create({
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
});

/** Decodes Valhalla's shape: Google's polyline format with six decimals. */
export function decodePolyline6(encoded: string): Coordinates[] {
  const points: Coordinates[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    for (const which of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) {
        lat += delta;
      } else {
        lon += delta;
      }
    }
    points.push({ latitude: lat / 1e6, longitude: lon / 1e6 });
  }
  return points;
}

/**
 * Valhalla's manoeuvre code in OSRM's words, so the sentences, icons and voice
 * stay the ones the app already has (Valhalla's own Portuguese reads "em
 * direção à a ciclovia").
 */
function asOsrm(type: number, exit?: number): Pick<OsrmManeuver, 'type' | 'modifier' | 'exit'> {
  switch (type) {
    case 1: return { type: 'depart' };
    case 2: return { type: 'depart', modifier: 'right' };
    case 3: return { type: 'depart', modifier: 'left' };
    case 4: return { type: 'arrive' };
    case 5: return { type: 'arrive', modifier: 'right' };
    case 6: return { type: 'arrive', modifier: 'left' };
    case 7: return { type: 'new name' };
    case 8: return { type: 'continue', modifier: 'straight' };
    case 9: return { type: 'turn', modifier: 'slight right' };
    case 10: return { type: 'turn', modifier: 'right' };
    case 11: return { type: 'turn', modifier: 'sharp right' };
    case 12:
    case 13: return { type: 'turn', modifier: 'uturn' };
    case 14: return { type: 'turn', modifier: 'sharp left' };
    case 15: return { type: 'turn', modifier: 'left' };
    case 16: return { type: 'turn', modifier: 'slight left' };
    case 17: return { type: 'on ramp', modifier: 'straight' };
    case 18: return { type: 'on ramp', modifier: 'right' };
    case 19: return { type: 'on ramp', modifier: 'left' };
    case 20: return { type: 'off ramp', modifier: 'right' };
    case 21: return { type: 'off ramp', modifier: 'left' };
    case 22: return { type: 'fork', modifier: 'straight' };
    case 23: return { type: 'fork', modifier: 'right' };
    case 24: return { type: 'fork', modifier: 'left' };
    case 25: return { type: 'merge' };
    case 26: return { type: 'roundabout', exit };
    case 27: return { type: 'exit roundabout' };
    case 37: return { type: 'merge', modifier: 'right' };
    case 38: return { type: 'merge', modifier: 'left' };
    default: return { type: 'continue', modifier: 'straight' };
  }
}

/**
 * Nothing to decide: start, "becomes", carry straight on, leave a roundabout
 * (the entry already said which exit) — the same rule as `worthAnnouncing`.
 */
const SILENT = new Set([1, 2, 3, 7, 8, 27]);

function toRoute(trip: ValhallaTrip, from: Coordinates): Route {
  const coordinates: Coordinates[] = [];
  const steps: RouteStep[] = [];
  const byStreet = new Map<string, number>();

  for (const leg of trip.legs) {
    const shape = decodePolyline6(leg.shape);
    const maneuvers = leg.maneuvers ?? [];
    maneuvers.forEach((m: ValhallaManeuver, i) => {
      // At a roundabout entry the street is the one of the exit, which
      // Valhalla puts on the next manoeuvre.
      const street =
        (m.type === 26 ? maneuvers[i + 1]?.street_names?.[0] : m.street_names?.[0]) ?? '';
      const maneuver = asOsrm(m.type, m.roundabout_exit_count);
      const at = shape[m.begin_shape_index] ?? shape[0];
      steps.push({
        instruction: describeManeuver({ ...maneuver, location: [at.longitude, at.latitude] }, street),
        icon: maneuverIcon(maneuver.type, maneuver.modifier),
        streetName: street || undefined,
        distanceMeters: m.length * 1000,
        location: at,
        announce: !SILENT.has(m.type),
      });
      if (m.street_names?.[0]) {
        byStreet.set(m.street_names[0], (byStreet.get(m.street_names[0]) ?? 0) + m.length);
      }
    });
    coordinates.push(...shape);
  }

  // The two streets ridden longest, for telling alternatives apart.
  const via = [...byStreet.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name)
    .join(', ');

  const startsAt = coordinates[0] ?? null;
  return {
    coordinates,
    distanceMeters: trip.summary.length * 1000,
    durationSeconds: trip.summary.time,
    steps,
    startAwayMeters: startsAt ? distanceMeters(from, startsAt) : 0,
    startsAt,
    via,
    avoidedTolls: false,
  };
}

function requestBody(points: Coordinates[], bike: BikeType, full: boolean) {
  return {
    locations: points.map((p) => ({ lat: p.latitude, lon: p.longitude })),
    costing: 'bicycle',
    costing_options: { bicycle: COSTING[bike] },
    units: 'kilometers',
    // Only the manoeuvres' data: the sentences are ours.
    directions_type: full ? 'maneuvers' : 'none',
    // Alternatives only between two points, as with OSRM.
    ...(full && points.length === 2 ? { alternates: 2 } : {}),
  };
}

type Schedule = <T>(task: () => Promise<T>, isWanted?: () => boolean) => Promise<T>;

/** Bicycle routes of this type. Throws on any failure; the caller falls back to OSRM. */
export async function valhallaBikeRoutes(
  points: Coordinates[],
  bike: BikeType,
  schedule: Schedule,
): Promise<Route[]> {
  const response = await schedule(() =>
    client.get<ValhallaRouteResponse>(`${VALHALLA_URL}/route`, {
      params: { json: JSON.stringify(requestBody(points, bike, true)) },
    }),
  );
  const { trip, alternates } = response.data;
  if (!trip?.legs?.length) {
    throw new Error('no trip');
  }
  return [trip, ...(alternates ?? []).map((a) => a.trip)].map((t) => toRoute(t, points[0]));
}

/** Only distance and time, for the travel-mode chip. */
export async function valhallaBikeDuration(
  points: Coordinates[],
  bike: BikeType,
  schedule: Schedule,
  isWanted?: () => boolean,
): Promise<{ distanceMeters: number; durationSeconds: number }> {
  const response = await schedule(
    () =>
      client.get<ValhallaRouteResponse>(`${VALHALLA_URL}/route`, {
        params: { json: JSON.stringify(requestBody(points, bike, false)) },
      }),
    isWanted,
  );
  const summary = response.data.trip?.summary;
  if (!summary) {
    throw new Error('no trip');
  }
  return { distanceMeters: summary.length * 1000, durationSeconds: summary.time };
}
