/**
 * Tipos da resposta do OSRM (cálculo de percursos).
 *
 * Correspondem ao pedido feito com `geometries=geojson`, que devolve a linha do
 * percurso já em GeoJSON, em vez do formato codificado.
 *
 * Documentação: https://project-osrm.org/docs/v5.24.0/api/
 */

/** A linha do percurso, em GeoJSON. */
export interface OsrmGeometry {
  type: 'LineString';
  /**
   * Atenção à ordem: o GeoJSON usa [longitude, latitude], ao contrário do
   * resto da aplicação, que usa { latitude, longitude }.
   */
  coordinates: [number, number][];
}

export interface OsrmRoute {
  geometry: OsrmGeometry;
  /** Distância total, em metros. */
  distance: number;
  /** Duração estimada, em segundos. */
  duration: number;
}

export interface OsrmRouteResponse {
  /** 'Ok' quando correu bem. Qualquer outro valor é um erro. */
  code: string;
  /** Mensagem de erro, só presente quando `code` não é 'Ok'. */
  message?: string;
  routes: OsrmRoute[];
}
