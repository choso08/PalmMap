/**
 * Tipos base de geografia usados por toda a aplicação.
 */

/** Um ponto no mapa. */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Uma área retangular do mapa, usada para pedir os negócios que lá estão. */
export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Detalhes de um negócio, quando o OpenStreetMap os tem. */
export interface PlaceDetails {
  phone?: string;
  website?: string;
  /** Horário tal como está no OpenStreetMap, p. ex. "Mo-Fr 09:00-19:00". */
  openingHours?: string;
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
  /** Tipo de local em texto legível ("Restaurante"), quando se sabe. */
  category?: string;
  details?: PlaceDetails;
}

/** Uma instrução do percurso ("Vire à direita para a Rua Augusta"). */
export interface RouteStep {
  /** A instrução já escrita em português. */
  instruction: string;
  /** Ícone que ilustra a manobra. */
  icon: string;
  /** Nome da rua, quando existe. */
  streetName?: string;
  /** Distância percorrida durante este passo, em metros. */
  distanceMeters: number;
  /** Onde acontece a manobra — serve para centrar o mapa nela. */
  location: Coordinates;
}

/** Um percurso já tratado, pronto a desenhar no mapa. */
export interface Route {
  /** Os pontos que formam a linha do percurso. */
  coordinates: Coordinates[];
  /** Distância total, em metros. */
  distanceMeters: number;
  /** Duração estimada, em segundos. */
  durationSeconds: number;
  /** As instruções, pela ordem em que se seguem. */
  steps: RouteStep[];
}
