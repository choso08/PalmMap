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

/**
 * One Panoramax picture, as the search and the item answer it — fields read
 * from a real response (`sondar: streetview`, 19 November 2026).
 */
export interface PanoramaxPictureFeature {
  id?: string;
  collection?: string;
  geometry?: { coordinates?: [number, number] };
  assets?: { thumb?: { href?: string }; sd?: { href?: string }; hd?: { href?: string } };
  links?: { rel?: string; href?: string; id?: string; geometry?: { coordinates?: [number, number] } }[];
  providers?: { name?: string; roles?: string[] }[];
  properties?: {
    datetime?: string;
    'view:azimuth'?: number;
    'pers:interior_orientation'?: { field_of_view?: number };
    license?: string;
  };
}

export interface PanoramaxPicturesResponse {
  features?: PanoramaxPictureFeature[];
}
