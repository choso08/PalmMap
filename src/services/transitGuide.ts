import { getRoutes } from './osrm';
import { scheduledRide } from './schedules';
import {
  carrisPatternColour,
  carrisRide,
  carrisRideShape,
  changesOf,
  type TransitStop,
  type RideRef,
  type RideStop,
  type TransitTrip,
} from './transit';
import type { Coordinates } from '../types/geo';
import { distanceMeters } from '../utils/geometry';

/**
 * A public transport trip turned into steps, as Maps shows one after "Start":
 * walk to the stop, board the line, ride N stops, get off, (change), walk to
 * the destination. Built once, when the trip starts; following it along with
 * the GPS is `guideProgress`, which asks nothing of anyone.
 */

export interface WalkLeg {
  type: 'walk';
  from: Coordinates;
  to: Coordinates;
  /** Where the walk ends: a stop's name, or null for the destination. */
  toName: string | null;
  meters: number;
  seconds: number;
  /** The walking route, or a straight line when OSRM could not answer. */
  path: Coordinates[];
}

export interface RideLeg {
  type: 'ride';
  kind: string;
  line: string;
  headsign: string;
  live: boolean;
  departsAt: number;
  arrivesAt: number;
  /** Boarding stop first, alighting stop last. Never fewer than two. */
  stops: RideStop[];
  /**
   * Where the vehicle really goes: the line's shape for a Carris bus, the
   * stops in a row otherwise (trains and metro, whose timetables carry no
   * shape — near enough for rails).
   */
  path: Coordinates[];
  /** The line's own colour, when the service gives one (Carris buses). */
  colour: string | null;
}

export type GuideLeg = WalkLeg | RideLeg;

export interface TransitGuide {
  trip: TransitTrip;
  legs: GuideLeg[];
  destination: Coordinates;
}

/** Walking pace for the estimate, the same the trip planning uses. */
const WALK_SPEED_MS = 1.3;

/** Under this, a walk is not a step (a change at the very same stop). */
const WALK_MIN_M = 15;

async function walkLeg(
  from: Coordinates,
  to: Coordinates,
  toName: string | null,
): Promise<WalkLeg> {
  try {
    const [route] = await getRoutes(from, [], to, 'walking');
    if (route && route.coordinates.length >= 2) {
      return {
        type: 'walk',
        from,
        to,
        toName,
        meters: route.distanceMeters,
        seconds: route.durationSeconds,
        path: route.coordinates,
      };
    }
  } catch {
    // A walk without its drawn way is still a step: a straight line.
  }
  const meters = distanceMeters(from, to);
  return {
    type: 'walk',
    from,
    to,
    toName,
    meters,
    seconds: meters / WALK_SPEED_MS,
    path: [from, to],
  };
}

async function rideStops(
  ref: RideRef | undefined,
  departsAt: number,
  arrivesAt: number,
): Promise<RideStop[]> {
  if (!ref) {
    return [];
  }
  try {
    return ref.source === 'carris'
      ? await carrisRide(ref, departsAt, arrivesAt)
      : scheduledRide(ref, departsAt);
  } catch {
    return [];
  }
}

/** The two ends only, when the stops between could not be had. */
function ends(
  from: { id: string; name: string; coordinates: Coordinates },
  to: { id: string; name: string; coordinates: Coordinates },
  departsAt: number,
  arrivesAt: number,
): RideStop[] {
  return [
    { id: from.id, name: from.name, coordinates: from.coordinates, unix: departsAt },
    { id: to.id, name: to.name, coordinates: to.coordinates, unix: arrivesAt },
  ];
}

/**
 * The trip's steps. The walks ask OSRM's walking server (through its
 * one-a-second queue) and the rides the line's pattern or the stored
 * timetable — all in parallel, and any of them failing leaves a plainer step,
 * never no trip.
 */
export async function buildGuide(
  trip: TransitTrip,
  origin: Coordinates,
  destination: Coordinates,
): Promise<TransitGuide> {
  // The rides in order: the first vehicle, then one per change. Each knows
  // where it is boarded and left, and when.
  const changes = changesOf(trip);
  type Ride = {
    kind: string;
    line: string;
    headsign: string;
    live: boolean;
    from: TransitStop;
    to: TransitStop;
    departsAt: number;
    arrivesAt: number;
    ref: RideRef | undefined;
  };
  const rides: Ride[] = [];
  rides.push({
    kind: trip.kind,
    line: trip.line,
    headsign: trip.headsign,
    live: trip.live,
    from: trip.from,
    to: changes[0]?.at ?? trip.to,
    departsAt: trip.departsAt,
    arrivesAt: changes[0]?.arrivesAt ?? trip.arrivesAt,
    ref: trip.ride,
  });
  changes.forEach((c, k) => {
    const next = changes[k + 1];
    rides.push({
      kind: c.kind ?? rides[k].kind,
      line: c.line,
      headsign: c.headsign,
      // Only the first vehicle of a planned trip comes with real time.
      live: false,
      from: c.boardAt,
      to: next?.at ?? trip.to,
      departsAt: c.departsAt,
      arrivesAt: next?.arrivesAt ?? trip.arrivesAt,
      ref: c.ride,
    });
  });

  const [walkIn, walkOut, stopsPerRide, changeWalks] = await Promise.all([
    walkLeg(origin, trip.from.coordinates, trip.from.name),
    walkLeg(trip.to.coordinates, destination, null),
    Promise.all(rides.map((r) => rideStops(r.ref, r.departsAt, r.arrivesAt))),
    Promise.all(
      changes.map((c) =>
        distanceMeters(c.at.coordinates, c.boardAt.coordinates) >= WALK_MIN_M
          ? walkLeg(c.at.coordinates, c.boardAt.coordinates, c.boardAt.name)
          : Promise.resolve(null),
      ),
    ),
  ]);

  const legs: GuideLeg[] = [];
  const rideLegs: { leg: RideLeg; ref: RideRef | undefined }[] = [];
  if (walkIn.meters >= WALK_MIN_M) {
    legs.push(walkIn);
  }
  rides.forEach((r, k) => {
    if (k > 0) {
      const walk = changeWalks[k - 1];
      if (walk) {
        legs.push(walk);
      }
    }
    const got = stopsPerRide[k];
    const stops = got.length >= 2 ? got : ends(r.from, r.to, r.departsAt, r.arrivesAt);
    const leg: RideLeg = {
      type: 'ride',
      kind: r.kind,
      line: r.line,
      headsign: r.headsign,
      live: r.live,
      departsAt: r.departsAt,
      arrivesAt: r.arrivesAt,
      stops,
      path: stops.map((s) => s.coordinates),
      colour: null,
    };
    legs.push(leg);
    rideLegs.push({ leg, ref: r.ref });
  });
  if (walkOut.meters >= WALK_MIN_M) {
    legs.push(walkOut);
  }

  // The buses' real ways and colours, in parallel; any failure keeps the stops
  // in a row and the mode's colour.
  await Promise.all(
    rideLegs.map(async ({ leg, ref }) => {
      if (ref?.source !== 'carris') {
        return;
      }
      try {
        leg.colour = await carrisPatternColour(ref.patternId);
      } catch {
        // The mode's colour (`lineColour`).
      }
      try {
        const shape = await carrisRideShape(
          ref,
          leg.stops[0].coordinates,
          leg.stops[leg.stops.length - 1].coordinates,
        );
        if (shape.length >= 2) {
          leg.path = shape;
        }
      } catch {
        // The stops in a row, as before.
      }
    }),
  );
  return { trip, legs, destination };
}

/** Where one is in the trip. */
export interface GuideProgress {
  /** Index into `legs`. Equal to `legs.length` once arrived. */
  leg: number;
  /** On a ride: the index of the last stop passed (0 at boarding). */
  stop: number;
}

/** Close enough to a walk's end, a stop or the destination to call it reached. */
export const GUIDE_REACHED_M = 40;

/** On a ride, how near a stop the phone must be to count it as passed. */
const GUIDE_STOP_M = 80;

/**
 * Moves the progress on with a GPS reading. **Only forward**: a reading
 * thrown off by the buildings must not take someone back to "walk to the
 * stop" while riding. A step tapped in the list is the way back.
 */
export function guideProgress(
  guide: TransitGuide,
  current: GuideProgress,
  position: Coordinates,
): GuideProgress {
  let { leg, stop } = current;
  // Several steps can pass in one reading (a change at the very same stop).
  for (let guard = 0; guard < 6 && leg < guide.legs.length; guard += 1) {
    const step = guide.legs[leg];
    if (step.type === 'walk') {
      if (distanceMeters(position, step.to) <= GUIDE_REACHED_M) {
        leg += 1;
        stop = 0;
        continue;
      }
      // Already on the way past the walk (the bus came while the GPS was
      // asleep): near a later stop of the next ride counts as boarding.
      const next = guide.legs[leg + 1];
      if (next?.type === 'ride') {
        const passed = passedStop(next.stops, position, 1);
        if (passed !== null) {
          leg += 1;
          stop = passed;
          continue;
        }
      }
      break;
    }
    const passed = passedStop(step.stops, position, stop);
    if (passed !== null && passed > stop) {
      stop = passed;
    }
    if (stop >= step.stops.length - 1) {
      leg += 1;
      stop = 0;
      continue;
    }
    break;
  }
  return { leg, stop };
}

/** The furthest stop from `from` on that is within `GUIDE_STOP_M`, or null. */
function passedStop(stops: RideStop[], position: Coordinates, from: number): number | null {
  let found: number | null = null;
  for (let i = Math.max(0, from); i < stops.length; i += 1) {
    if (distanceMeters(position, stops[i].coordinates) <= GUIDE_STOP_M) {
      found = i;
    }
  }
  return found;
}

/** Whether the trip is over: the last step done, or at the destination. */
export function guideArrived(guide: TransitGuide, progress: GuideProgress, position: Coordinates | null): boolean {
  return (
    progress.leg >= guide.legs.length ||
    (position !== null &&
      progress.leg === guide.legs.length - 1 &&
      distanceMeters(position, guide.destination) <= GUIDE_REACHED_M)
  );
}
