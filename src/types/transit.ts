/**
 * The exact format of what the Carris Metropolitana API returns.
 *
 * As with the other services, this describes what **they** say, not what the
 * app uses — the translation into the types in `geo.ts` lives in the service.
 * That way, if another operator is added one day, only the translation
 * changes.
 *
 * **These field names were read from the service's own code**, which is open,
 * not guessed. The first attempt assumed `name`, `locality` and `lines` — and
 * since none of them exists, every stop showed up named "Stop" with nothing
 * else. The position was right because `lat` and `lon` were the only ones
 * guessed correctly. See the note in CLAUDE.md.
 */

/** A stop, as it comes from `/v2/stops`. */
export interface CarrisStop {
  id: string;
  /** The stop's full name. **It is `long_name`, not `name`.** */
  long_name?: string;
  /** Short version of the name, when there is one. */
  short_name?: string;
  /** They come as numbers, contrary to what was first assumed. */
  lat?: number | string;
  lon?: number | string;
  /** The locality. **It is `locality_name`, not `locality`.** */
  locality_name?: string;
  municipality_name?: string;
  /** The lines that stop here. **It is `line_ids`, not `lines`.** */
  line_ids?: string[];
  /**
   * Connections this stop has to other modes.
   *
   * Carries `'train'`, `'subway'`, `'light_rail'`, `'boat'` — which is what
   * lets the app say "change to the train here" without cross-matching
   * coordinates by hand.
   */
  facilities?: string[];
  /**
   * The patterns (the exact path of each line, in one direction) that pass
   * here.
   *
   * It is what tells, without asking the service anything, that two stops
   * share a bus — see `busStopsFor`, in `src/services/transit.ts`. Read from a
   * real response on 30 September 2026.
   */
  pattern_ids?: string[];
}

/**
 * A train, metro, light-rail or ferry station.
 *
 * It comes from the `/facilities/*` endpoints of the same API as the buses.
 * They are only the **locations** — there are no timetables for these
 * operators here.
 *
 * **Mind the types.** The service's code has two shapes of this object: one
 * with `lat`/`lon` as numbers and another as text. It is not known which one v2
 * serves, so both are accepted — enough time has already been lost on guessed
 * names and formats with this API.
 */
export interface CarrisFacility {
  id: string;
  name?: string;
  lat?: number | string;
  lon?: number | string;
  locality?: string;
  municipality_name?: string;
  /**
   * The bus stops that serve this station.
   *
   * This is what links a bus trip to a change onto the train, without having
   * to guess by proximity.
   */
  stop_ids?: string[];
}

/**
 * An expected arrival at a stop, as it comes from `/v2/arrivals/by_stop/:id`.
 *
 * The text times come as `HH:MM:SS` and **can go past 24** — it is GTFS's
 * convention for trips that cross midnight. `25:10:00` is ten past one the next
 * morning, still counted as the previous day's service.
 *
 * **That is why the `_unix` versions are used.** They are seconds since 1970,
 * with that arithmetic already done on their side, and compare directly with
 * the clock. They spare us the 24-hour arithmetic, which is where this kind of
 * code usually fails.
 */
export interface CarrisArrival {
  line_id?: string;
  /**
   * Identifies the **trip**: that bus, on that schedule, on that day.
   *
   * Since August 2026 it only comes when there is a real-time estimate — see
   * `tripKeys`, in `src/services/transit.ts`, for how trips are matched without
   * it.
   */
  trip_id?: string;
  /** This stop's position within the trip. Confirms the direction of travel. */
  stop_sequence?: number;
  pattern_id?: string;
  route_id?: string;
  headsign?: string;
  stop_id?: string;
  /** The timetable time, as text. */
  scheduled_arrival?: string;
  /** The same, in seconds since 1970. This is the one used. */
  scheduled_arrival_unix?: number | null;
  /** The expected time, with the real delay included. Only with real time. */
  estimated_arrival?: string;
  estimated_arrival_unix?: number | null;
  /** The time it actually passed. If filled in, it has already gone. */
  observed_arrival?: string | null;
}

/**
 * A pattern — one line in one direction, its stops in order — as
 * `/v2/patterns/:id` returns it. Read from a real response (probe `pattern`,
 * 11 November 2026). The id goes **without** the `[YA15B]` prefix the arrivals
 * carry: with it the service answers 404. It comes as a list of one.
 */
export interface CarrisPattern {
  id?: string;
  line_id?: string;
  short_name?: string;
  headsign?: string;
  /** The line's colour, `#C61D23`. */
  color?: string;
  text_color?: string;
  path?: {
    stop_id?: string;
    stop_sequence?: number;
    /** From the first stop, in kilometres. */
    distance?: number;
  }[];
  /** Every trip of the pattern, each with its time at each stop. */
  trips?: {
    schedule?: {
      stop_id?: string;
      stop_sequence?: number;
      /** `HH:MM:SS`, past 24 after midnight, as in GTFS. */
      arrival_time?: string;
    }[];
  }[];
}

/**
 * A vehicle, as Carris Metropolitana's `/vehicles` returns it.
 *
 * **The names were read from a real response**, not guessed. The response
 * carries thirty fields per vehicle — fleet record included, with number plate,
 * make, model and capacity — and only the ones the app uses are declared here.
 * The others exist and do no harm.
 *
 * **Not every vehicle in the list is moving.** Those that aren't come without
 * `lat`, `lon` or `timestamp` — that is what tells them apart, not a field
 * saying so. And of those that do carry a position, most have it from hours or
 * days ago: it is the last known one, where they were parked. See
 * `src/services/vehicles.ts`.
 */
export interface CarrisVehicle {
  /** Identifies the vehicle, in the form `41|300`. */
  id?: string;
  lat?: number | string;
  lon?: number | string;
  /** Where it is pointing, in degrees. */
  bearing?: number | string;
  /** Metres per second, not kilometres per hour. */
  speed?: number | string;
  /** Seconds since 1970, from when this position was reported. */
  timestamp?: number | string;
  /** The number of the line it is running. */
  line_id?: string;
  route_id?: string;
  pattern_id?: string;
  trip_id?: string;
  /** The stop that `current_status` refers to. */
  stop_id?: string;
  /** `STOPPED_AT`, `IN_TRANSIT_TO` or `INCOMING_AT`, as in GTFS-RT. */
  current_status?: string;
}
