/**
 * Types for Photon's response (address search, the fallback service).
 *
 * It is GeoJSON: a list of `features`, each with a point and its properties.
 * The field names are the ones in their documentation
 * (https://github.com/komoot/photon/blob/master/docs/api-v1.md), read rather
 * than guessed. Almost all of them can be missing — a result that is a city has
 * no street and no house number.
 */

export interface PhotonProperties {
  osm_id?: number;
  /** 'N', 'W' or 'R' — node, way or relation. */
  osm_type?: string;
  /** Family of the main tag ('amenity', 'shop', 'place', …). */
  osm_key?: string;
  /** Value of that tag ('restaurant', 'city', …). */
  osm_value?: string;
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  city?: string;
  district?: string;
  county?: string;
  state?: string;
  country?: string;
  /** Additional tags, when the server includes them. */
  extra?: Record<string, string>;
}

export interface PhotonFeature {
  geometry?: { type: string; coordinates?: [number, number] };
  properties?: PhotonProperties;
}

export interface PhotonResponse {
  features?: PhotonFeature[];
}
