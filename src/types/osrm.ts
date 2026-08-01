/**
 * Tipos da resposta do OSRM (cálculo de percursos).
 *
 * Correspondem ao pedido feito com `geometries=geojson` e `steps=true`, que
 * devolve a linha do percurso em GeoJSON e as manobras uma a uma.
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

/**
 * A manobra em si.
 *
 * `type` diz o que se faz ('turn', 'roundabout', 'arrive', …) e `modifier`
 * diz para que lado ('left', 'slight right', …). A tradução para português
 * está em `src/utils/maneuvers.ts`.
 */
export interface OsrmManeuver {
  type: string;
  modifier?: string;
  /** [longitude, latitude] do ponto onde a manobra acontece. */
  location: [number, number];
  /** Nas rotundas, o número da saída a tomar. */
  exit?: number;
}

export interface OsrmStep {
  maneuver: OsrmManeuver;
  /** Nome da rua onde se segue depois da manobra. Pode vir vazio. */
  name: string;
  distance: number;
  duration: number;
}

export interface OsrmLeg {
  steps: OsrmStep[];
}

export interface OsrmRoute {
  geometry: OsrmGeometry;
  /** Só vem preenchido quando se pede `steps=true`. */
  legs: OsrmLeg[];
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
