import type { Coordinates } from '../types/geo';

/**
 * Contas de distância sobre o mapa.
 *
 * Nota sobre a precisão: o percurso do OSRM vem com `overview=full`, ou seja com
 * pontos de poucos em poucos metros. Por isso, em vez de projetar a posição
 * perpendicularmente sobre cada troço — que dá mais trabalho e mais erros —
 * basta encontrar o ponto do percurso mais próximo. A diferença é de metros e
 * não se nota na prática.
 */

const EARTH_RADIUS_M = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Distância em metros entre dois pontos, sobre a superfície da Terra. */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface RoutePosition {
  /** Índice do ponto do percurso mais próximo da posição atual. */
  index: number;
  /** A que distância se está da linha do percurso, em metros. */
  offRouteMeters: number;
}

/** Descobre em que ponto do percurso a pessoa está. */
export function locateOnRoute(
  routeCoordinates: Coordinates[],
  position: Coordinates,
): RoutePosition {
  let index = 0;
  let best = Infinity;

  for (let i = 0; i < routeCoordinates.length; i += 1) {
    const d = distanceMeters(routeCoordinates[i], position);
    if (d < best) {
      best = d;
      index = i;
    }
  }

  return { index, offRouteMeters: best };
}

/** Comprimento do percurso entre dois dos seus pontos, em metros. */
export function distanceAlong(
  routeCoordinates: Coordinates[],
  fromIndex: number,
  toIndex: number,
): number {
  let total = 0;
  for (let i = fromIndex; i < toIndex && i + 1 < routeCoordinates.length; i += 1) {
    total += distanceMeters(routeCoordinates[i], routeCoordinates[i + 1]);
  }
  return total;
}

/** Índice do ponto do percurso mais próximo de um dado sítio. */
export function nearestIndex(routeCoordinates: Coordinates[], target: Coordinates): number {
  let index = 0;
  let best = Infinity;

  for (let i = 0; i < routeCoordinates.length; i += 1) {
    const d = distanceMeters(routeCoordinates[i], target);
    if (d < best) {
      best = d;
      index = i;
    }
  }

  return index;
}
