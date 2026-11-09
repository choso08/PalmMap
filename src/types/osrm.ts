/**
 * Types for OSRM's response (route calculation).
 *
 * They match a request made with `geometries=geojson` and `steps=true`, which
 * returns the route line as GeoJSON and the manoeuvres one by one.
 *
 * Documentation: https://project-osrm.org/docs/v5.24.0/api/
 */

/** The route line, in GeoJSON. */
export interface OsrmGeometry {
  type: 'LineString';
  /**
   * Mind the order: GeoJSON uses [longitude, latitude], unlike the rest of the
   * app, which uses { latitude, longitude }.
   */
  coordinates: [number, number][];
}

/**
 * The manoeuvre itself.
 *
 * `type` says what is done ('turn', 'roundabout', 'arrive', …) and `modifier`
 * says which way ('left', 'slight right', …). The translation into words is in
 * `src/utils/maneuvers.ts`.
 */
export interface OsrmManeuver {
  type: string;
  modifier?: string;
  /** [longitude, latitude] of the point where the manoeuvre happens. */
  location: [number, number];
  /** At roundabouts, the number of the exit to take. */
  exit?: number;
}

/** One lane at an intersection, as OSRM describes it (from OSM `turn:lanes`). */
export interface OsrmLane {
  indications: string[];
  valid: boolean;
}

/** An intersection along a step. The first one is where the manoeuvre happens. */
export interface OsrmIntersection {
  lanes?: OsrmLane[];
}

export interface OsrmStep {
  maneuver: OsrmManeuver;
  /** Only with `steps=true`. The lanes of the manoeuvre are on the first one. */
  intersections?: OsrmIntersection[];
  /** Name of the street followed after the manoeuvre. May be empty. */
  name: string;
  distance: number;
  duration: number;
}

export interface OsrmLeg {
  steps: OsrmStep[];
  /**
   * The names of the main roads of the leg ("A2, IC20"), chosen by OSRM. Only
   * filled in when `steps=true` is requested, and may be empty.
   */
  summary?: string;
}

export interface OsrmRoute {
  geometry: OsrmGeometry;
  /** Only filled in when `steps=true` is requested. */
  legs: OsrmLeg[];
  /** Total distance, in metres. */
  distance: number;
  /** Estimated duration, in seconds. */
  duration: number;
}

/**
 * Where OSRM snapped each point we asked for.
 *
 * The service can only travel on roads, so it snaps the origin and the
 * destination to the nearest road. `distance` says how many metres away from
 * the requested spot it ended up — which is what lets the app warn someone who
 * is far from any road.
 */
export interface OsrmWaypoint {
  /** The point snapped to the road, as [longitude, latitude]. */
  location: [number, number];
  /** How far it ended up from the requested point, in metres. */
  distance: number;
  name: string;
}

export interface OsrmRouteResponse {
  /** 'Ok' when it went well. Any other value is an error. */
  code: string;
  /** Error message, only present when `code` is not 'Ok'. */
  message?: string;
  routes: OsrmRoute[];
  /** The origin and destination, already snapped to the nearest road. */
  waypoints?: OsrmWaypoint[];
}
