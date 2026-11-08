/**
 * Types for the Overpass API's response (querying OpenStreetMap places).
 *
 * Overpass is what lets the app ask "which restaurants are around here?",
 * something Nominatim does not do well.
 *
 * Documentation: https://wiki.openstreetmap.org/wiki/Overpass_API
 */

/**
 * An element returned by Overpass.
 *
 * `node`s (points) carry `lat`/`lon` directly. `way`s and `relation`s (lines
 * and areas, like a supermarket's building) only carry their centre, in
 * `center`, and only because the query asks for `out center`.
 */
export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  /**
   * Explanation when the query did not go well.
   *
   * Overpass answers **200** even when it blows up on time or memory, and puts
   * the reason here. Without looking at this, a failure passed for "there is
   * nothing in this area".
   */
  remark?: string;
  elements: OverpassElement[];
}
