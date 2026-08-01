/**
 * Tipos base de geografia usados por toda a aplicação.
 */

/** Um ponto no mapa. */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Um local já tratado, pronto a mostrar no ecrã. */
export interface Place {
  /** Identificador do local no OpenStreetMap. */
  id: number;
  /** Nome curto, para a lista de resultados. */
  name: string;
  /** Morada completa, como o Nominatim a devolve. */
  address: string;
  coordinates: Coordinates;
}

/** Um percurso já tratado, pronto a desenhar no mapa. */
export interface Route {
  /** Os pontos que formam a linha do percurso. */
  coordinates: Coordinates[];
  /** Distância total, em metros. */
  distanceMeters: number;
  /** Duração estimada, em segundos. */
  durationSeconds: number;
}
