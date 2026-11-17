/**
 * The options a planner offers, from all the trips it found.
 *
 * A line appears once among direct trips: the next three trains on one line
 * are one option. A trip with changes is different (author's report, November
 * 2026: "some changes give only one option") — the same pair of lines at the
 * next departures is what Maps lists, because the connection, the waits and
 * the arrival change from one to the next. So each combination of lines keeps
 * up to `perKey` departures: first one of each combination, then the later
 * ones fill what is left of `limit`. Two that arrive at the same time are one
 * (an earlier first ride waiting for the same second one): the later
 * departure is kept.
 */
export function optionsPerKey<T extends { reachAt: number; leaveAt: number }>(
  trips: T[],
  keyOf: (trip: T) => string,
  limit: number,
  /** How many departures a combination keeps; a function decides per trip (a direct line keeps 1). */
  perKey: number | ((trip: T) => number | undefined) = TRANSFER_DEPARTURES_PER_PAIR,
): T[] {
  const sorted = [...trips].sort((a, b) => a.reachAt - b.reachAt || b.leaveAt - a.leaveAt);
  const seen = new Set<string>();
  const count = new Map<string, number>();
  const firsts: T[] = [];
  const laters: T[] = [];
  for (const trip of sorted) {
    const key = keyOf(trip);
    const same = `${key}@${Math.round(trip.reachAt / 60)}`;
    const n = count.get(key) ?? 0;
    const most =
      (typeof perKey === 'function' ? perKey(trip) : perKey) ?? TRANSFER_DEPARTURES_PER_PAIR;
    if (seen.has(same) || n >= most) {
      continue;
    }
    seen.add(same);
    count.set(key, n + 1);
    (n === 0 ? firsts : laters).push(trip);
  }
  const out = firsts.slice(0, limit);
  for (const trip of laters) {
    if (out.length >= limit) {
      break;
    }
    out.push(trip);
  }
  return out.sort((a, b) => a.reachAt - b.reachAt);
}

/** Departures kept per combination of lines in a trip with changes. */
export const TRANSFER_DEPARTURES_PER_PAIR = 3;
