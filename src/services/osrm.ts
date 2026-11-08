import axios from 'axios';
import { t } from '../i18n';

import {
  OSRM_ENDPOINTS,
  OSRM_MIN_INTERVAL_MS,
  OSRM_PROFILE_PATH,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
} from './config';
import { createRateLimiter } from './rateLimit';
import type { Coordinates, Route, RouteStep } from '../types/geo';
import type { OsrmRouteResponse, OsrmStep } from '../types/osrm';
import { describeManeuver, maneuverIcon } from '../utils/maneuvers';

const client = axios.create({
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
});

/**
 * FOSSGIS's terms of use ask for at most one request per second. Without this,
 * choosing the destination and immediately switching travel mode sent two
 * requests almost at once.
 */
const schedule = createRateLimiter(OSRM_MIN_INTERVAL_MS);

/** Error with a readable message, so the screen can show something useful. */
export class RouteError extends Error {}

/**
 * Whether a manoeuvre deserves to be said out loud.
 *
 * Everything that requires no decision is left out:
 *
 * - `continue` — the same road carries on, even if it bends. It is why the
 *   voice was heard at every curve of a motorway.
 * - `new name` — the road changes name and one carries straight on anyway.
 * - `depart` — one is already setting off; saying so adds nothing.
 * - `notification` — OSRM uses this for notices, not manoeuvres.
 */
function worthAnnouncing(step: OsrmStep): boolean {
  const { type } = step.maneuver;
  return type !== 'continue' && type !== 'new name' && type !== 'depart' && type !== 'notification';
}

/** Turns an OSRM manoeuvre into an instruction ready to show. */
function toRouteStep(step: OsrmStep): RouteStep {
  const [longitude, latitude] = step.maneuver.location;

  return {
    instruction: describeManeuver(step.maneuver, step.name),
    icon: maneuverIcon(step.maneuver.type, step.maneuver.modifier),
    streetName: step.name || undefined,
    distanceMeters: step.distance,
    location: { latitude, longitude },
    announce: worthAnnouncing(step),
  };
}

/**
 * Calculates the route, with stops along the way and alternative routes.
 *
 * Each travel mode has its own server — see `OSRM_ENDPOINTS`. That is what
 * makes a walking route ignore one-way streets and count the time at a
 * person's pace, instead of returning the car route under another name.
 *
 * They are community servers and may be down — whoever calls this should handle
 * the error and show a decent message.
 *
 * Always returns at least one route. When there is more than one, the first is
 * the one OSRM considers best — but the choice belongs to the driver.
 *
 * **Alternatives and stops do not go together.** OSRM can only look for
 * alternative routes between two points; with stops in between it answers that
 * it is not implemented. So alternatives are only requested when there are no
 * stops.
 */
export async function getRoutes(
  from: Coordinates,
  via: Coordinates[],
  to: Coordinates,
  profile: 'driving' | 'walking' | 'cycling' = 'driving',
  avoidTolls = false,
): Promise<Route[]> {
  // OSRM expects the coordinates in this order: longitude,latitude.
  const points = [from, ...via, to];
  const path = points.map((p) => `${p.longitude},${p.latitude}`).join(';');

  // `steps=true` is what brings the manoeuvres one by one.
  const params: Record<string, string> = {
    overview: 'full',
    geometries: 'geojson',
    steps: 'true',
  };

  if (via.length === 0) {
    // Three is enough: more than that are variations of a few metres that only confuse.
    params.alternatives = '3';
  }

  if (avoidTolls && profile === 'driving') {
    // OSRM's car profile marks toll roads as a class that can be excluded.
    // **Not every server has it enabled** — if this one does not, it answers
    // with an error and the request is repeated without it, which beats having
    // no route at all.
    params.exclude = 'toll';
  }

  let response;
  try {
    const base = OSRM_ENDPOINTS[profile];
    const profilePath = OSRM_PROFILE_PATH[profile];
    response = await schedule(() =>
      client.get<OsrmRouteResponse>(`${base}/route/v1/${profilePath}/${path}`, {
        params,
        // **Accept the errors too.** OSRM answers an invalid request with 400
        // and a JSON body explaining what happened. With axios's normal
        // validation, that 400 became an exception and the body was lost — and
        // with it the toll fallback below, which then never got to run. Anyone
        // with "avoid tolls" on was left with no route at all and a message
        // saying the service was unreachable.
        validateStatus: (status) => status < 500,
      }),
    );
  } catch {
    throw new RouteError(t().errors.routeFailed);
  }

  if (params.exclude && response.data.code !== 'Ok') {
    // This server cannot exclude tolls. Ask again without it: a route with
    // tolls beats no route at all, and the caller finds out through
    // `avoidedTolls`.
    return getRoutes(from, via, to, profile, false);
  }

  const { code, routes, message, waypoints } = response.data;
  if (code !== 'Ok' || !routes || routes.length === 0) {
    throw new RouteError(message ?? t().errors.noRoute);
  }

  const origin = waypoints?.[0];

  return routes.map((route) => ({
    // GeoJSON comes as [longitude, latitude] — flipped here to the app's format.
    coordinates: route.geometry.coordinates.map(([longitude, latitude]) => ({
      latitude,
      longitude,
    })),
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    // One "leg" per stretch between stops. They are all joined: navigation
    // follows them one after the other, as if it were a single route.
    steps: route.legs.flatMap((leg) => leg.steps.map(toRouteStep)),
    startAwayMeters: origin?.distance ?? 0,
    startsAt: origin
      ? { longitude: origin.location[0], latitude: origin.location[1] }
      : null,
    // True only when the server really accepted avoiding tolls. It lets the
    // panel tell the truth instead of promising what it did not do.
    avoidedTolls: Boolean(params.exclude),
  }));
}
