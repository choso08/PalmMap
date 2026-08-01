/**
 * Tipos da resposta do Nominatim (pesquisa de moradas).
 *
 * Correspondem ao formato `jsonv2`. Só estão aqui os campos que a aplicação usa —
 * o Nominatim devolve mais do que isto, mas não precisamos do resto.
 *
 * Documentação: https://nominatim.org/release-docs/develop/api/Search/
 */

/** Um resultado tal como vem do Nominatim, sem tratamento. */
export interface NominatimSearchResult {
  place_id: number;
  osm_type: string;
  osm_id: number;
  /** Atenção: o Nominatim devolve as coordenadas como texto, não como número. */
  lat: string;
  lon: string;
  /** Nome curto do local. Pode vir vazio nalguns resultados. */
  name: string;
  /** Morada completa, separada por vírgulas. */
  display_name: string;
  category: string;
  type: string;
  importance: number;
}

/** A pesquisa devolve uma lista destes resultados. */
export type NominatimSearchResponse = NominatimSearchResult[];
