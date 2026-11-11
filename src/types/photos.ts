/**
 * The two answers the place photos read — fields taken from real responses
 * (probe `photos`, 11 November 2026).
 */

/** `Special:EntityData/<Q>.json` on Wikidata: only the image claim (P18) is read. */
export interface WikidataEntityResponse {
  entities?: Record<
    string,
    {
      claims?: {
        P18?: { mainsnak?: { datavalue?: { value?: string } } }[];
      };
    }
  >;
}

/** Panoramax's STAC search: each feature is one street-level picture. */
export interface PanoramaxSearchResponse {
  features?: {
    id?: string;
    geometry?: { coordinates?: [number, number] };
    assets?: { thumb?: { href?: string } };
  }[];
}
