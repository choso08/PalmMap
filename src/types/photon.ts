/**
 * Tipos da resposta do Photon (pesquisa de moradas, segundo recurso).
 *
 * É GeoJSON: uma lista de `features`, cada uma com um ponto e as propriedades.
 * Os nomes dos campos são os da documentação deles
 * (https://github.com/komoot/photon/blob/master/docs/api-v1.md), lidos e não
 * adivinhados. Quase todos podem faltar — um resultado que seja uma cidade não
 * tem rua nem número.
 */

export interface PhotonProperties {
  osm_id?: number;
  /** 'N', 'W' ou 'R' — nó, linha ou relação. */
  osm_type?: string;
  /** Família da etiqueta principal ('amenity', 'shop', 'place', …). */
  osm_key?: string;
  /** Valor dessa etiqueta ('restaurant', 'city', …). */
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
  /** Etiquetas adicionais, quando o servidor as inclui. */
  extra?: Record<string, string>;
}

export interface PhotonFeature {
  geometry?: { type: string; coordinates?: [number, number] };
  properties?: PhotonProperties;
}

export interface PhotonResponse {
  features?: PhotonFeature[];
}
