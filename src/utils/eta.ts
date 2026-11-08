/**
 * The estimated time: how to get from what OSRM answered to what is shown.
 *
 * There are three layers, and their order matters:
 *
 * 1. **The travel mode's model** (`modelSeconds`) — what the app assumes for
 *    someone going by car, on foot or by bike.
 * 2. **The measured pace** — how fast the person really goes, learnt from
 *    previous trips and refined during the current one.
 * 3. **The manual correction in the settings**, which only applies while
 *    there is no measured pace at all.
 *
 * **Measured beats guessed, and they are not multiplied.** The manual
 * correction and the measured pace measure exactly the same thing — how short
 * the service's estimate falls around here. Multiplying them counted it twice:
 * someone who had chosen 1.5× on a dirt road and whose measured pace came out
 * at 1.6 would see the arrival time inflated by 2.4×.
 */

import {
  CYCLING_SPEED_MS,
  PACE_MAX,
  PACE_MIN,
  PACE_MIN_DRIVING,
  PACE_LEARN_WEIGHT,
} from '../services/config';
import type { TravelMode } from '../settings';

/**
 * The seconds the app assumes for a stretch, before any correction.
 *
 * By car and on foot it is what OSRM answered: their car profile already
 * computes the time at the speed limit times 0.8 where the limit is tagged —
 * see `PACE_MIN_DRIVING`.
 *
 * **By bike it is not.** OSRM assumes 15 km/h, which is the speed of a serious
 * cyclist. Here 12.5 is used — but only as a floor: where OSRM already answers
 * slower, it is because it knows something about the road that an average
 * speed does not (a climb you push up, a flight of steps), and in that case its
 * figure stands.
 */
export function modelSeconds(
  distanceMeters: number,
  osrmSeconds: number,
  mode: TravelMode,
): number {
  if (mode !== 'cycling' || distanceMeters <= 0) {
    return osrmSeconds;
  }
  return Math.max(osrmSeconds, distanceMeters / CYCLING_SPEED_MS);
}

/**
 * Keeps the measured pace within limits that make sense.
 *
 * The car's floor is 1 on purpose: an arrival time that only works out by
 * exceeding the limit is not promised. See `PACE_MIN_DRIVING`.
 */
export function clampPace(raw: number, mode: TravelMode): number {
  const floor = mode === 'driving' ? PACE_MIN_DRIVING : PACE_MIN;
  if (!Number.isFinite(raw)) {
    return floor;
  }
  return Math.min(PACE_MAX, Math.max(floor, raw));
}

/**
 * Blends this trip's pace into the one already stored.
 *
 * The first time, this trip's pace is kept whole — there is nothing to blend
 * it with.
 */
export function blendPace(stored: number | null | undefined, measured: number): number {
  return stored == null ? measured : stored + (measured - stored) * PACE_LEARN_WEIGHT;
}
