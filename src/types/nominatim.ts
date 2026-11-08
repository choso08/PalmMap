/**
 * Types for Nominatim's response (address search).
 *
 * They match the `jsonv2` format, requested with `extratags=1` so that the
 * phone number, opening hours and website come too. Only the fields the app
 * uses are here — Nominatim returns more than this.
 *
 * Documentation: https://nominatim.org/release-docs/develop/api/Search/
 */

/** A result exactly as it comes from Nominatim, unprocessed. */
export interface NominatimSearchResult {
  place_id: number;
  osm_type: string;
  osm_id: number;
  /** Careful: Nominatim returns the coordinates as text, not as numbers. */
  lat: string;
  lon: string;
  /** Short name of the place. May be empty in some results. */
  name: string;
  /** Full address, comma-separated. */
  display_name: string;
  /** The place's family ('amenity', 'shop', 'highway', …). */
  category: string;
  /** The value within that family ('restaurant', 'supermarket', …). */
  type: string;
  importance: number;
  /** Extra OpenStreetMap tags. Only present with `extratags=1`. */
  extratags?: Record<string, string>;
}

/** The search returns a list of these results. */
export type NominatimSearchResponse = NominatimSearchResult[];

/**
 * The reverse search (coordinates → address) returns a single result, not a
 * list. When there is nothing at that point — in the middle of the sea, for
 * instance — it returns an object with only `error`.
 */
export type NominatimReverseResponse =
  | NominatimSearchResult
  | { error: string };
