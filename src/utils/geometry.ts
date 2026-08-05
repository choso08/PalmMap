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

/**
 * Área de um polígono desenhado no mapa, em metros quadrados.
 *
 * Serve a fita métrica: três ou mais pontos fecham uma forma, e a área é o que
 * interessa a quem está a medir um terreno ou um telhado.
 *
 * **Como se faz.** A fórmula do sapateiro (shoelace) só funciona em coordenadas
 * planas, e latitude e longitude não o são: um grau de longitude vale 111 km no
 * equador e quase nada perto dos polos. Por isso projeta-se primeiro para metros
 * à volta do centro da forma — a longitude encolhe pelo cosseno da latitude. Num
 * terreno, ou mesmo num bairro, o erro dessa aproximação é desprezável.
 *
 * O polígono fecha-se sozinho: não é preciso repetir o primeiro ponto no fim.
 */
export function polygonAreaM2(points: Coordinates[]): number {
  if (points.length < 3) {
    return 0;
  }

  const latMedia =
    points.reduce((soma, p) => soma + p.latitude, 0) / points.length;
  const metrosPorGrauLat = (Math.PI / 180) * EARTH_RADIUS_M;
  const metrosPorGrauLon = metrosPorGrauLat * Math.cos(toRadians(latMedia));

  const planos = points.map((p) => ({
    x: p.longitude * metrosPorGrauLon,
    y: p.latitude * metrosPorGrauLat,
  }));

  let soma = 0;
  for (let i = 0; i < planos.length; i += 1) {
    const a = planos[i];
    const b = planos[(i + 1) % planos.length];
    soma += a.x * b.y - b.x * a.y;
  }

  return Math.abs(soma) / 2;
}

/** Comprimento total de uma linha desenhada ponto a ponto, em metros. */
export function pathLengthMeters(points: Coordinates[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distanceMeters(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Perímetro de uma forma fechada, em metros.
 *
 * **Não é o mesmo que o comprimento da linha.** Marcar os quatro cantos de um
 * terreno dá quatro pontos e três troços desenhados; o quarto lado — o que volta
 * ao princípio — existe na área mas não na linha. Sem o somar aqui, a aplicação
 * dava a área certa e um perímetro a menos um lado.
 */
export function perimeterMeters(points: Coordinates[]): number {
  if (points.length < 3) {
    return pathLengthMeters(points);
  }
  return pathLengthMeters(points) + distanceMeters(points[points.length - 1], points[0]);
}
