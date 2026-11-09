import { LIMITS_WINDOW_M, LIMITS_MATCH_M } from './config';
import { maxspeedOf } from './cameras';
import { askOverpass, overpassSchedule } from './overpass';
import type { Coordinates } from '../types/geo';
import { distanceMeters } from '../utils/geometry';

/**
 * The speed limit of the road ahead, from OpenStreetMap's `maxspeed`.
 *
 * **OSRM cannot give it**: `annotations=maxspeed` exists only in Mapbox's
 * service, and the FOSSGIS server answers "query string malformed" (probed from
 * GitHub Actions, November 2026). So it is asked of Overpass: the ways with a
 * `maxspeed` along a stretch of the route, in one request.
 *
 * **A window, not the whole route.** The query follows the line with
 * `around:` a polyline; a 300 km trip would be a huge request on a service run
 * by volunteers. It covers `LIMITS_WINDOW_M` from where the car is, and the
 * next window is asked for only when the car gets near the end of this one —
 * about one request an hour on a motorway.
 *
 * Each route point then takes the limit of the nearest way within
 * `LIMITS_MATCH_M`: the route runs on top of its own road, so a crossing street
 * only wins right at the junction, for a point or two.
 */
export interface LimitsWindow {
  /** Limit per route point index, for the points the window covers. */
  byIndex: Map<number, number>;
  /** The last route index the window covers. */
  untilIndex: number;
}

interface WaySegment {
  a: Coordinates;
  b: Coordinates;
  limit: number;
}

/** Distance in metres from a point to a segment, on a local flat projection. */
function toSegment(p: Coordinates, a: Coordinates, b: Coordinates): number {
  const k = Math.cos((p.latitude * Math.PI) / 180);
  const ax = (a.longitude - p.longitude) * k;
  const ay = a.latitude - p.latitude;
  const bx = (b.longitude - p.longitude) * k;
  const by = b.latitude - p.latitude;
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.sqrt(x * x + y * y) * 111320;
}

export async function speedLimitsAhead(
  route: Coordinates[],
  fromIndex: number,
): Promise<LimitsWindow> {
  // The stretch to cover, and a thinned copy of it for the query: a point every
  // ~100 m keeps the polyline on the road (the `around` corridor is measured
  // from the straight lines between them) without sending thousands.
  let covered = 0;
  let until = fromIndex;
  const thin: Coordinates[] = [route[fromIndex]];
  let sinceLast = 0;
  for (let i = fromIndex + 1; i < route.length; i++) {
    const d = distanceMeters(route[i - 1], route[i]);
    covered += d;
    sinceLast += d;
    until = i;
    if (sinceLast >= 100) {
      thin.push(route[i]);
      sinceLast = 0;
    }
    if (covered >= LIMITS_WINDOW_M) {
      break;
    }
  }
  if (thin[thin.length - 1] !== route[until]) {
    thin.push(route[until]);
  }
  const byIndex = new Map<number, number>();
  if (thin.length < 2) {
    return { byIndex, untilIndex: until };
  }

  const line = thin.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join(',');
  const query =
    `[out:json][timeout:25];\n` +
    `way(around:${LIMITS_MATCH_M},${line})["highway"]["maxspeed"];\n` +
    `out tags geom;`;
  const data = await overpassSchedule(() => askOverpass(query));

  // The ways cut into segments, filed in a coarse grid so each route point only
  // looks at the few around it.
  const CELL = 0.002;
  const grid = new Map<string, WaySegment[]>();
  const cellOf = (p: Coordinates) =>
    `${Math.floor(p.latitude / CELL)}:${Math.floor(p.longitude / CELL)}`;
  for (const way of data.elements) {
    const limit = maxspeedOf((way.tags ?? {}) as Record<string, string>);
    const g = way.geometry;
    if (limit === null || !g || g.length < 2) {
      continue;
    }
    for (let i = 1; i < g.length; i++) {
      const seg = {
        a: { latitude: g[i - 1].lat, longitude: g[i - 1].lon },
        b: { latitude: g[i].lat, longitude: g[i].lon },
        limit,
      };
      const cells = new Set([cellOf(seg.a), cellOf(seg.b)]);
      for (const c of cells) {
        const list = grid.get(c);
        if (list) {
          list.push(seg);
        } else {
          grid.set(c, [seg]);
        }
      }
    }
  }

  for (let i = fromIndex; i <= until; i++) {
    const p = route[i];
    const la = Math.floor(p.latitude / CELL);
    const lo = Math.floor(p.longitude / CELL);
    let best = LIMITS_MATCH_M;
    let limit: number | null = null;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const seg of grid.get(`${la + dy}:${lo + dx}`) ?? []) {
          const d = toSegment(p, seg.a, seg.b);
          if (d < best) {
            best = d;
            limit = seg.limit;
          }
        }
      }
    }
    if (limit !== null) {
      byIndex.set(i, limit);
    }
  }
  return { byIndex, untilIndex: until };
}
