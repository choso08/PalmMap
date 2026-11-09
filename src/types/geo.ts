/**
 * Base geography types used across the whole app.
 */

/** A point on the map. */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** A rectangular area of the map, used to ask for the businesses inside it. */
export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Details of a business, when OpenStreetMap has them. */
export interface PlaceDetails {
  phone?: string;
  website?: string;
  /** Opening hours as written in OpenStreetMap, e.g. "Mo-Fr 09:00-19:00". */
  openingHours?: string;
}

/** A place already processed, ready to show on screen. */
export interface Place {
  /** The place's identifier in OpenStreetMap. */
  id: number;
  /** Short name, for the results list. */
  name: string;
  /** Full address, as Nominatim returns it. */
  address: string;
  coordinates: Coordinates;
  /** Kind of place as readable text ("Restaurant"), when known. */
  category?: string;
  /**
   * The OpenStreetMap tag that says what it is (`amenity` / `restaurant`), when
   * known. It decides the pin's icon and colour — see `utils/poiStyle.ts`.
   */
  kindKey?: string;
  kindValue?: string;
  details?: PlaceDetails;
}

/** One route instruction ("Turn right onto Rua Augusta"). */
export interface RouteStep {
  /** The instruction, already written out in the app's language. */
  instruction: string;
  /** Icon that illustrates the manoeuvre. */
  icon: string;
  /** Street name, when there is one. */
  streetName?: string;
  /** Distance travelled during this step, in metres. */
  distanceMeters: number;
  /** Where the manoeuvre happens — used to centre the map on it. */
  location: Coordinates;
  /**
   * Whether this is worth saying out loud.
   *
   * OSRM marks a manoeuvre whenever the road changes name or bends, even when
   * there is nothing to decide. Reading them all, the voice never shuts up on a
   * motorway. They all stay in the written list — they just aren't announced.
   */
  announce: boolean;
}

/** A route already processed, ready to draw on the map. */
export interface Route {
  /** The points that make up the route line. */
  coordinates: Coordinates[];
  /** Total distance, in metres. */
  distanceMeters: number;
  /** Estimated duration, in seconds. */
  durationSeconds: number;
  /** The instructions, in the order they are followed. */
  steps: RouteStep[];
  /**
   * How far the origin was from the nearest road, in metres.
   *
   * The routing service only travels on roads. Inside an airport, a shopping
   * centre or out in the fields, it snaps the start of the route to the nearest
   * road — which may be far away, sometimes on the other side of a fence.
   * Keeping this lets the app say so instead of drawing the line as if it began
   * at the feet of whoever asked for it.
   */
  startAwayMeters: number;
  /** Where the route really starts, already snapped to the road. */
  startsAt: Coordinates | null;
  /**
   * Whether this route was really calculated avoiding tolls.
   *
   * That is not the same as the setting being on: the public OSRM server may
   * not have that exclusion installed, in which case the request is repeated
   * without it. Without this, the panel promised something that had not been
   * done.
   */
  avoidedTolls: boolean;
}
