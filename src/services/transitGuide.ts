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
import { alongLine, distanceMeters } from '../utils/geometry';
import { rideOperator } from '../utils/lineColour';

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
  /** Who runs it, for its colour when it has none of its own (`lineColour`). */
  operator?: string;
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
      operator: rideOperator(r.ref) ?? (r.live ? 'carris-metropolitana' : undefined),
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
  /**
   * The last reading's place along a ride's path (`alongLine`), and which leg
   * it was measured on — the next reading compared with it says whether one
   * is moving forward along the line or the other way.
   */
  along?: number;
  alongLeg?: number;
}

/** Close enough to a walk's end, a stop or the destination to call it reached. */
export const GUIDE_REACHED_M = 40;

/** A stop counts as passed once this close to it along the line, or beyond. */
const GUIDE_STOP_AHEAD_M = 30;

/** Each ride's stops as metres along its path, worked out once. */
const stopsAlong = new WeakMap<RideLeg, number[]>();

function stopPositions(ride: RideLeg): number[] {
  let known = stopsAlong.get(ride);
  if (!known) {
    let floor = 0;
    known = ride.stops.map((s) => {
      // In order: on a line that passes a place twice (a loop), a stop is the
      // pass after the one before it.
      // Searched only from the stop before onwards: on a shape that goes out
      // and back along one road, the nearest pass may be the wrong one.
      const at = alongLine(ride.path, s.coordinates, { from: floor, to: Infinity })?.along ?? floor;
      floor = Math.max(floor, at);
      return floor;
    });
    stopsAlong.set(ride, known);
  }
  return known;
}

/** The last stop at or behind a place along the ride, or -1. */
function lastStopBehind(ride: RideLeg, along: number): number {
  const at = stopPositions(ride);
  let k = -1;
  for (let i = 0; i < at.length; i += 1) {
    if (at[i] <= along + GUIDE_STOP_AHEAD_M) {
      k = i;
    }
  }
  return k;
}

/** On a ride, how far from its path the phone can be and still be on it. */
const GUIDE_ON_PATH_M = 80;

/** Forward along the path since the last reading, to count as riding it. */
const GUIDE_FORWARD_M = 5;

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
  // Which ride's path this reading is measured on: the one under way, or the
  // next one while walking to it.
  const rideAt = guide.legs[leg]?.type === 'ride' ? leg : guide.legs[leg + 1]?.type === 'ride' ? leg + 1 : -1;
  const ride = rideAt >= 0 ? (guide.legs[rideAt] as RideLeg) : null;
  const before = current.alongLeg === rideAt ? current.along : undefined;
  // Around the last reading first (a loop passes a place twice), the whole
  // line when nothing there is near.
  const windowed =
    ride && before !== undefined
      ? alongLine(ride.path, position, { from: before - 300, to: before + 3000 })
      : null;
  const here = ride
    ? windowed && windowed.meters <= GUIDE_ON_PATH_M
      ? windowed
      : alongLine(ride.path, position)
    : null;
  // **Riding forward**: on the line, and further along it than the last
  // reading. A bus the other way passes the same stops (author's report,
  // November 2026: "get off at the next stop" while going the opposite way —
  // getting off there would have left them far from where they were going),
  // and so does a walk beside the line; neither moves the trip on.
  const forward =
    here !== null &&
    here.meters <= GUIDE_ON_PATH_M &&
    before !== undefined &&
    here.along - before >= GUIDE_FORWARD_M;

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
      // asleep): riding forward past the next ride's first stop counts as
      // boarding.
      const next = guide.legs[leg + 1];
      if (next?.type === 'ride' && forward && here && rideAt === leg + 1) {
        const passed = lastStopBehind(next, here.along);
        if (passed >= 1) {
          leg += 1;
          stop = passed;
          continue;
        }
      }
      break;
    }
    // Stops are passed by where one is along the line, riding forward only —
    // so a reading missed in a pocket is caught up, and a bus the other way
    // moves nothing.
    if (forward && here && rideAt === leg) {
      const passed = lastStopBehind(step, here.along);
      if (passed > stop) {
        stop = passed;
      }
    }
    if (stop >= step.stops.length - 1) {
      leg += 1;
      stop = 0;
      continue;
    }
    break;
  }
  // The place kept for the next reading moves only by `GUIDE_FORWARD_M` or more
  // (either way) while on the line: a bus crawling in a queue adds up its
  // metres instead of looking still at every reading, and GPS jitter off the
  // line is not taken for movement.
  const anchor =
    here === null
      ? undefined
      : before === undefined
        ? here.along
        : here.meters <= GUIDE_ON_PATH_M && Math.abs(here.along - before) >= GUIDE_FORWARD_M
          ? here.along
          : before;
  return anchor !== undefined && rideAt >= 0 ? { leg, stop, along: anchor, alongLeg: rideAt } : { leg, stop };
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
