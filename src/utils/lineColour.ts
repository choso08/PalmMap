/**
 * A line's colour for its badge, the trip's timeline and the buses on the map,
 * as Maps paints each line in its own colour.
 *
 * **Each operator has its own colour** (author's request, November 2026), so
 * a Carris Metropolitana bus, a Carris de Lisboa bus, a CP train and a ferry
 * are told apart at a glance. The stored timetables carry no colours (their
 * `routes` are only names), so they are written here:
 *
 * - Carris Metropolitana: its buses' yellow. A line's own colour from the
 *   service (`RideLeg.colour`, a pattern's or a line's) still wins.
 * - Carris de Lisboa: a deep blue for buses; its trams and lifts (`28E`, `51E`)
 *   orange, which no one else uses.
 * - Metro de Lisboa: its four lines by name; anything else its grey.
 * - CP green, Fertagus purple, Transtejo/Soflusa sky blue, Metro Sul do Tejo
 *   teal.
 *
 * Ids are the stored timetables' (`ScheduleFeedInfo.id`); a live Carris
 * Metropolitana bus is `carris-metropolitana`, Carris de Lisboa's live
 * vehicles `carris-lisboa`.
 */

/** Metro de Lisboa, by `route_short_name` (Am, Az, Vd, Vm) or long name. */
const METRO_LISBOA: Record<string, string> = {
  am: '#F2B705',
  amarela: '#F2B705',
  az: '#4E84C4',
  azul: '#4E84C4',
  vd: '#00A99D',
  verde: '#00A99D',
  vm: '#E8364F',
  vermelha: '#E8364F',
};

export const OPERATOR_COLOURS: Record<string, string> = {
  'carris-metropolitana': '#FFD100',
  'carris-lisboa': '#1E3A8A',
  metro: '#455A64',
  cp: '#2E8B3E',
  fertagus: '#7B2D8E',
  ttsl: '#0096D6',
  mst: '#00897B',
};

/** Carris de Lisboa's trams and lifts: a number and an E. */
const TRAM_COLOUR = '#E35205';

/** When the operator is unknown: by mode. */
const BY_KIND: Record<string, string> = {
  train: '#3D5A80',
  subway: '#455A64',
  light_rail: '#00897B',
  boat: '#0277BD',
};

/**
 * The operator a stored timetable's id or a ride stands for, in the ids
 * above. The stored Carris Metropolitana timetable is `carris`.
 */
export function operatorId(feedOrSource: string | undefined): string | undefined {
  if (!feedOrSource) {
    return undefined;
  }
  return feedOrSource === 'carris' || feedOrSource === 'cm' ? 'carris-metropolitana' : feedOrSource;
}

/** The operator of a ride reference (`RideRef`, in `transit.ts`). */
export function rideOperator(
  ride: { source: 'carris' } | { source: 'schedule'; feedId: string } | undefined,
): string | undefined {
  if (!ride) {
    return undefined;
  }
  return ride.source === 'carris' ? 'carris-metropolitana' : operatorId(ride.feedId);
}

/**
 * A planned trip's first operator: its ride when known, a live trip is Carris
 * Metropolitana (the only live source planned with), and a stored one names
 * its timetable at the start of `tripId` (`cp:1460:20261118`).
 */
export function tripOperator(trip: {
  tripId: string;
  live: boolean;
  ride?: { source: 'carris' } | { source: 'schedule'; feedId: string };
}): string | undefined {
  const fromRide = rideOperator(trip.ride);
  if (fromRide) {
    return fromRide;
  }
  if (trip.live) {
    return 'carris-metropolitana';
  }
  const prefix = operatorId(trip.tripId.split(':')[0]);
  return prefix && OPERATOR_COLOURS[prefix] ? prefix : undefined;
}

/** The colour of an operator, or `fallback` when it has none of its own. */
export function operatorColour(operator: string | undefined, fallback: string): string {
  return (operator && OPERATOR_COLOURS[operatorId(operator) ?? '']) || fallback;
}

/**
 * The line's colour: Metro de Lisboa's lines by name, Carris de Lisboa's
 * trams, then the operator's, then the mode's, then `fallback`.
 */
export function lineColour(
  kind: string,
  line: string,
  fallback: string,
  operator?: string,
): string {
  const op = operatorId(operator);
  if (kind === 'subway' || op === 'metro') {
    const metro = METRO_LISBOA[line.trim().toLowerCase()];
    if (metro) {
      return metro;
    }
  }
  if (op === 'carris-lisboa' && /^\d+E$/i.test(line.trim())) {
    return TRAM_COLOUR;
  }
  if (op && OPERATOR_COLOURS[op]) {
    return OPERATOR_COLOURS[op];
  }
  return BY_KIND[kind] ?? fallback;
}

/** White or near-black, whichever reads on that colour. */
export function textOn(colour: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour);
  if (!m) {
    return '#FFFFFF';
  }
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? '#1F1F1F' : '#FFFFFF';
}
