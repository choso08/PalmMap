/**
 * The exact shape of a Valhalla `/route` answer, as far as the app reads it.
 * Read from a real answer of the FOSSGIS server (probe of 9 November 2026).
 */

export interface ValhallaManeuver {
  /** Valhalla's manoeuvre code: 1 start, 4 destination, 10 right, 15 left, 26 roundabout… */
  type: number;
  /** Length of this manoeuvre's stretch, in kilometres (the request asks for km). */
  length: number;
  /** Seconds. */
  time: number;
  street_names?: string[];
  begin_shape_index: number;
  end_shape_index: number;
  /** At a roundabout entry, the exit to take. */
  roundabout_exit_count?: number;
}

export interface ValhallaTrip {
  /** Polyline with six decimals, one per leg. */
  legs: { shape: string; maneuvers?: ValhallaManeuver[] }[];
  summary: { length: number; time: number };
}

export interface ValhallaRouteResponse {
  trip: ValhallaTrip;
  alternates?: { trip: ValhallaTrip }[];
}

export interface ValhallaError {
  error_code?: number;
  error?: string;
}
