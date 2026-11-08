import type { Bounds, Coordinates } from '../types/geo';

/**
 * Distance arithmetic on the map.
 *
 * A note on precision: the OSRM route comes with `overview=full`, that is with
 * points every few metres. So instead of projecting the position
 * perpendicularly onto each segment — more work and more room for error — it
 * is enough to find the nearest point of the route. The difference is a matter
 * of metres and does not show in practice.
 */

const EARTH_RADIUS_M = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Distance in metres between two points, over the Earth's surface. */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface RoutePosition {
  /** Index of the route point nearest to the current position. */
  index: number;
  /** How far one is from the route line, in metres. */
  offRouteMeters: number;
}

/** Works out where along the route the person is. */
export function locateOnRoute(
  routeCoordinates: Coordinates[],
  position: Coordinates,
): RoutePosition {
  let index = 0;
  let best = Infinity;

  for (let i = 0; i < routeCoordinates.length; i += 1) {
    const d = distanceMeters(routeCoordinates[i], position);
    if (d < best) {
      best = d;
      index = i;
    }
  }

  return { index, offRouteMeters: best };
}

/** Length of the route between two of its points, in metres. */
export function distanceAlong(
  routeCoordinates: Coordinates[],
  fromIndex: number,
  toIndex: number,
): number {
  let total = 0;
  for (let i = fromIndex; i < toIndex && i + 1 < routeCoordinates.length; i += 1) {
    total += distanceMeters(routeCoordinates[i], routeCoordinates[i + 1]);
  }
  return total;
}

/** Index of the route point nearest to a given spot. */
export function nearestIndex(routeCoordinates: Coordinates[], target: Coordinates): number {
  let index = 0;
  let best = Infinity;

  for (let i = 0; i < routeCoordinates.length; i += 1) {
    const d = distanceMeters(routeCoordinates[i], target);
    if (d < best) {
      best = d;
      index = i;
    }
  }

  return index;
}

/**
 * Area of a polygon drawn on the map, in square metres.
 *
 * Used by the measuring tape: three or more points close a shape, and the area
 * is what matters to someone measuring a plot of land or a roof.
 *
 * **How it is done.** The shoelace formula only works on flat coordinates, and
 * latitude and longitude are not flat: a degree of longitude is worth 111 km at
 * the equator and almost nothing near the poles. So the points are first
 * projected into metres around the shape's centre — longitude shrinks by the
 * cosine of the latitude. For a plot of land, or even a neighbourhood, the
 * error of that approximation is negligible.
 *
 * The polygon closes itself: the first point does not need repeating at the
 * end.
 */
export function polygonAreaM2(points: Coordinates[]): number {
  if (points.length < 3) {
    return 0;
  }

  const meanLat =
    points.reduce((sum, p) => sum + p.latitude, 0) / points.length;
  const metresPerDegreeLat = (Math.PI / 180) * EARTH_RADIUS_M;
  const metresPerDegreeLon = metresPerDegreeLat * Math.cos(toRadians(meanLat));

  const flat = points.map((p) => ({
    x: p.longitude * metresPerDegreeLon,
    y: p.latitude * metresPerDegreeLat,
  }));

  let sum = 0;
  for (let i = 0; i < flat.length; i += 1) {
    const a = flat[i];
    const b = flat[(i + 1) % flat.length];
    sum += a.x * b.y - b.x * a.y;
  }

  return Math.abs(sum) / 2;
}

/** Total length of a line drawn point by point, in metres. */
export function pathLengthMeters(points: Coordinates[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distanceMeters(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Perimeter of a closed shape, in metres.
 *
 * **It is not the same as the length of the line.** Marking the four corners
 * of a plot gives four points and three drawn segments; the fourth side — the
 * one back to the start — exists in the area but not in the line. Without
 * adding it here, the app gave the right area and a perimeter one side short.
 */
export function perimeterMeters(points: Coordinates[]): number {
  if (points.length < 3) {
    return pathLengthMeters(points);
  }
  return pathLengthMeters(points) + distanceMeters(points[points.length - 1], points[0]);
}

/**
 * The rectangle that contains all these points.
 *
 * In a single pass, on purpose: `Math.min(...points)` passes every point as a
 * function argument, and a long route — which with `overview=full` carries
 * tens of thousands — blows the stack with a `RangeError`.
 */
export function boundsOf(points: Coordinates[]): Bounds {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;

  for (const p of points) {
    if (p.latitude < south) south = p.latitude;
    if (p.latitude > north) north = p.latitude;
    if (p.longitude < west) west = p.longitude;
    if (p.longitude > east) east = p.longitude;
  }

  return { south, west, north, east };
}
