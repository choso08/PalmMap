/**
 * A route's height profile, for walking and cycling (author's request,
 * November 2026): how much it climbs and drops, and its shape.
 */
export interface ElevationProfile {
  /** `[metres along the route, height in metres]`, evenly spaced. */
  points: [number, number][];
  /** Metres climbed and dropped over the whole route. */
  ascent: number;
  descent: number;
  min: number;
  max: number;
}

/**
 * Changes smaller than this are not counted as climbing: the elevation model
 * is a grid, and a flat street read point by point wobbles by a metre or two —
 * summed over a long route that made hills out of nothing.
 */
const NOISE_M = 3;

export function summariseHeights(points: [number, number][]): ElevationProfile | null {
  if (points.length < 2) {
    return null;
  }
  let ascent = 0;
  let descent = 0;
  let ref = points[0][1];
  let min = ref;
  let max = ref;
  for (const [, h] of points) {
    min = Math.min(min, h);
    max = Math.max(max, h);
    if (h - ref >= NOISE_M) {
      ascent += h - ref;
      ref = h;
    } else if (ref - h >= NOISE_M) {
      descent += ref - h;
      ref = h;
    }
  }
  return { points, ascent: Math.round(ascent), descent: Math.round(descent), min, max };
}
