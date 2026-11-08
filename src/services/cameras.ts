import { CAMERA_CORRIDOR_M } from './config';
import { t } from '../i18n';
import type { Coordinates } from '../types/geo';
import type { OverpassElement } from '../types/overpass';
import { boundsOf, locateOnRoute } from '../utils/geometry';

/**
 * Speed cameras and other speed enforcement, from OpenStreetMap.
 *
 * ## What it catches
 *
 * Every kind tagged in OpenStreetMap, not only fixed cameras:
 *
 * | Kind | How it is tagged | What is said |
 * | --- | --- | --- |
 * | Fixed | `highway=speed_camera` | "Speed camera in 300 metres" |
 * | Average speed | `enforcement=average_speed`, `speed_camera=section` | "Average speed check" |
 * | Traffic lights | `enforcement=traffic_signals` | "Red-light camera" |
 * | Toll, bus lane, access | `enforcement=toll|bus_lane|access` | "Enforcement" |
 *
 * When the camera has the limit tagged (`maxspeed`), the warning says it too.
 *
 * ## What it **does not** catch, and it must be said plainly
 *
 * - **Mobile cameras are on no map at all.** They move every day; neither
 *   Google nor Waze know them — Waze only has them because people mark them as
 *   they drive past, which is a completely different thing.
 * - **OpenStreetMap is not complete.** A camera nobody tagged does not show up
 *   here. This is a help, **not a guarantee** — the driver is the one who has
 *   to watch the signs.
 *
 * The user is told this on the settings screen, not only here.
 */

/**
 * The client and the queue are **the same** as the businesses' ones.
 *
 * A queue of its own would be two queues: each kept its own two seconds, and a
 * route calculated while the map was looking for businesses sent two heavy
 * requests to Overpass at the same instant. That is how one gets blocked.
 */
import { askOverpass, boundingBox, overpassSchedule } from './overpass';

/** What kind of enforcement it is. It changes what is said out loud. */
export type CameraKind = 'fixed' | 'average' | 'trafficSignals' | 'other';

export interface SpeedCamera {
  id: number;
  kind: CameraKind;
  coordinates: Coordinates;
  /** Limit tagged on the camera, in km/h, when there is one. */
  maxspeed: number | null;
  /** Index of the route point where this camera is. */
  routeIndex: number;
}

const cache = new Map<string, Omit<SpeedCamera, 'routeIndex'>[]>();

/** Works out the kind of enforcement from the tags. */
function kindOf(tags: Record<string, string>): CameraKind {
  const enforcement = tags.enforcement ?? '';

  if (
    enforcement.includes('average_speed') ||
    tags['speed_camera'] === 'section' ||
    tags['speed_camera:type'] === 'section'
  ) {
    return 'average';
  }
  if (enforcement.includes('traffic_signals')) {
    return 'trafficSignals';
  }
  if (enforcement && !enforcement.includes('maxspeed')) {
    return 'other';
  }
  return 'fixed';
}

/** The limit in km/h, when it is tagged and really is a number. */
function maxspeedOf(tags: Record<string, string>): number | null {
  const raw = tags.maxspeed ?? tags['maxspeed:forward'] ?? tags['maxspeed:backward'];
  if (!raw) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toCamera(element: OverpassElement): Omit<SpeedCamera, 'routeIndex'> | null {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (latitude === undefined || longitude === undefined) {
    return null;
  }

  const tags = (element.tags ?? {}) as Record<string, string>;

  return {
    id: element.id,
    kind: kindOf(tags),
    coordinates: { latitude, longitude },
    maxspeed: maxspeedOf(tags),
  };
}

/**
 * Fetches the speed cameras inside an area.
 *
 * The query asks both for points tagged as cameras and for those tagged with
 * an enforcement — that second part is what catches average-speed checks and
 * red-light cameras, which often lack the `highway=speed_camera` tag.
 */
async function camerasInBox(box: string): Promise<Omit<SpeedCamera, 'routeIndex'>[]> {
  const cached = cache.get(box);
  if (cached) {
    return cached;
  }

  const query =
    `[out:json][timeout:25];\n(\n` +
    `  node["highway"="speed_camera"](${box});\n` +
    `  node["enforcement"](${box});\n` +
    `  node["highway"="checkpoint"]["checkpoint"="speed"](${box});\n` +
    `);\nout body 400;`;

  // `askOverpass` tries the second server if the first one fails, and treats a
  // 200 with a `remark` as a failure — caching it would leave this route
  // without cameras forever. See the notes in `overpass.ts`.
  const data = await overpassSchedule(() => askOverpass(query));

  const cameras = data.elements
    .map(toCamera)
    .filter((c): c is Omit<SpeedCamera, 'routeIndex'> => c !== null);

  // A point can come from both parts of the query at once.
  const unique = new Map(cameras.map((c) => [c.id, c]));
  const list = [...unique.values()];

  cache.set(box, list);
  return list;
}

/**
 * The cameras that sit **on the route**, already sorted in the order they are
 * passed.
 *
 * Filtering by closeness to the line is essential: the route's area catches
 * everything in the rectangle, including cameras on parallel roads and on the
 * motorway running alongside. Warning about those would be worse than not
 * warning at all — after twice, nobody pays attention to the warning.
 */
export async function camerasAlongRoute(
  routeCoordinates: Coordinates[],
): Promise<SpeedCamera[]> {
  if (routeCoordinates.length < 2) {
    return [];
  }

  // A small margin around the route, so as not to cut off a camera right on
  // the edge. The rectangle is computed in a single pass: `Math.min(...list)`
  // passes every point as an argument, and on a long route — which with
  // `overview=full` is tens of thousands — that blows the stack.
  const margin = 0.005;
  const area = boundsOf(routeCoordinates);
  const box = boundingBox({
    south: area.south - margin,
    west: area.west - margin,
    north: area.north + margin,
    east: area.east + margin,
  });

  const found = await camerasInBox(box);

  const onRoute: SpeedCamera[] = [];

  // A degree of latitude is about 111 km. Comparing in degrees before doing the
  // real arithmetic discards the vast majority of cameras — without this, it
  // was 400 cameras times tens of thousands of points, all at once and blocking
  // the screen just as the route appears.
  const slackDegrees = (CAMERA_CORRIDOR_M / 111000) * 4;

  for (const camera of found) {
    const near =
      camera.coordinates.latitude >= area.south - slackDegrees &&
      camera.coordinates.latitude <= area.north + slackDegrees &&
      camera.coordinates.longitude >= area.west - slackDegrees &&
      camera.coordinates.longitude <= area.east + slackDegrees;

    if (!near) {
      continue;
    }

    // The same `locateOnRoute` navigation uses to know where one is: a single
    // "nearest point on the route" rule across the whole app.
    const { index, offRouteMeters } = locateOnRoute(routeCoordinates, camera.coordinates);
    if (offRouteMeters <= CAMERA_CORRIDOR_M) {
      onRoute.push({ ...camera, routeIndex: index });
    }
  }

  return onRoute.sort((a, b) => a.routeIndex - b.routeIndex);
}

/** What is said out loud, depending on the kind of enforcement. */
export function cameraLabel(camera: SpeedCamera): string {
  switch (camera.kind) {
    case 'average':
      return t().cameras.average;
    case 'trafficSignals':
      return t().cameras.trafficSignals;
    case 'other':
      return t().cameras.traffic;
    default:
      return t().cameras.speed;
  }
}

/** The map and panel icon, depending on the kind. */
export function cameraIcon(kind: CameraKind): string {
  switch (kind) {
    case 'average':
      return 'speedometer';
    case 'trafficSignals':
      return 'traffic-light';
    case 'other':
      return 'shield-alert-outline';
    default:
      return 'cctv';
  }
}
