import axios from 'axios';

import {
  CAMERA_CORRIDOR_M,
  OVERPASS_BASE_URL,
  OVERPASS_MIN_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
} from './config';
import { createRateLimiter } from './rateLimit';
import type { Coordinates } from '../types/geo';
import type { OverpassElement, OverpassResponse } from '../types/overpass';
import { distanceMeters } from '../utils/geometry';

/**
 * Radares e outros controlos de velocidade, a partir do OpenStreetMap.
 *
 * ## O que apanha
 *
 * Todos os tipos que estão marcados no OpenStreetMap, e não só os radares fixos:
 *
 * | Tipo | Como está marcado | O que se diz |
 * | --- | --- | --- |
 * | Fixo | `highway=speed_camera` | "Radar a 300 metros" |
 * | Velocidade média | `enforcement=average_speed`, `speed_camera=section` | "Início de controlo de velocidade média" |
 * | Semáforo | `enforcement=traffic_signals` | "Radar de semáforo" |
 * | Portagem, faixa BUS, acesso | `enforcement=toll|bus_lane|access` | "Controlo" |
 *
 * Quando o radar tem o limite marcado (`maxspeed`), o aviso di-lo também.
 *
 * ## O que **não** apanha, e é preciso dizer com franqueza
 *
 * - **Radares móveis não existem em mapa nenhum.** Mudam de sítio todos os dias;
 *   nem o Google nem o Waze os sabem — o Waze só os tem porque são as pessoas a
 *   marcá-los ao passar, e isso é outra coisa completamente diferente.
 * - **O OpenStreetMap não está completo.** Um radar que ninguém marcou não
 *   aparece aqui. Isto é uma ajuda, **não é uma garantia** — quem conduz é quem
 *   tem de ver os sinais.
 *
 * Isto é dito ao utilizador no ecrã de definições, e não só aqui.
 */

const client = axios.create({
  baseURL: OVERPASS_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
});

const schedule = createRateLimiter(OVERPASS_MIN_INTERVAL_MS);

/** Que género de controlo é. Muda o que se diz em voz alta. */
export type CameraKind = 'fixo' | 'media' | 'semaforo' | 'outro';

export interface SpeedCamera {
  id: number;
  kind: CameraKind;
  coordinates: Coordinates;
  /** Limite marcado no radar, em km/h, quando existe. */
  maxspeed: number | null;
  /** Índice do ponto do percurso onde este radar fica. */
  routeIndex: number;
}

const cache = new Map<string, Omit<SpeedCamera, 'routeIndex'>[]>();

/** Descobre o género de controlo a partir das etiquetas. */
function kindOf(tags: Record<string, string>): CameraKind {
  const enforcement = tags.enforcement ?? '';

  if (
    enforcement.includes('average_speed') ||
    tags['speed_camera'] === 'section' ||
    tags['speed_camera:type'] === 'section'
  ) {
    return 'media';
  }
  if (enforcement.includes('traffic_signals')) {
    return 'semaforo';
  }
  if (enforcement && !enforcement.includes('maxspeed')) {
    return 'outro';
  }
  return 'fixo';
}

/** O limite em km/h, quando está marcado e é mesmo um número. */
function maxspeedOf(tags: Record<string, string>): number | null {
  const raw = tags.maxspeed ?? tags['maxspeed:forward'] ?? tags['maxspeed:backward'];
  if (!raw) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toCamera(element: OverpassElement): Omit<SpeedCamera, 'routeIndex'> | null {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (latitude === undefined || longitude === undefined) {
    return null;
  }

  const tags = (element.tags ?? {}) as Record<string, string>;

  return {
    id: element.id,
    kind: kindOf(tags),
    coordinates: { latitude, longitude },
    maxspeed: maxspeedOf(tags),
  };
}

/**
 * Vai buscar os radares dentro de uma área.
 *
 * A consulta pede tanto os pontos marcados como radar como os que fazem parte de
 * uma relação de fiscalização — é essa segunda parte que apanha o controlo de
 * velocidade média e os radares de semáforo, que muitas vezes não têm a etiqueta
 * `highway=speed_camera`.
 */
async function camerasInBox(box: string): Promise<Omit<SpeedCamera, 'routeIndex'>[]> {
  const cached = cache.get(box);
  if (cached) {
    return cached;
  }

  const query =
    `[out:json][timeout:25];\n(\n` +
    `  node["highway"="speed_camera"](${box});\n` +
    `  node["enforcement"](${box});\n` +
    `  node["highway"="checkpoint"]["checkpoint"="speed"](${box});\n` +
    `);\nout body 400;`;

  const response = await schedule(() => client.post<OverpassResponse>('', query));

  const cameras = response.data.elements
    .map(toCamera)
    .filter((c): c is Omit<SpeedCamera, 'routeIndex'> => c !== null);

  // Um ponto pode vir das duas partes da consulta ao mesmo tempo.
  const unicos = new Map(cameras.map((c) => [c.id, c]));
  const lista = [...unicos.values()];

  cache.set(box, lista);
  return lista;
}

/**
 * Os radares que ficam **em cima do percurso**, já ordenados pela ordem por que
 * se passa por eles.
 *
 * A filtragem por proximidade à linha é essencial: a área do percurso apanha
 * tudo o que está no retângulo, incluindo radares de estradas paralelas e da
 * autoestrada que passa ao lado. Avisar por causa desses seria pior do que não
 * avisar nada — ao fim de duas vezes ninguém liga ao aviso.
 */
export async function camerasAlongRoute(
  routeCoordinates: Coordinates[],
): Promise<SpeedCamera[]> {
  if (routeCoordinates.length < 2) {
    return [];
  }

  const lats = routeCoordinates.map((p) => p.latitude);
  const lons = routeCoordinates.map((p) => p.longitude);
  // Uma folga pequena à volta do percurso, para não cortar um radar mesmo na borda.
  const margem = 0.005;
  const box = [
    (Math.min(...lats) - margem).toFixed(4),
    (Math.min(...lons) - margem).toFixed(4),
    (Math.max(...lats) + margem).toFixed(4),
    (Math.max(...lons) + margem).toFixed(4),
  ].join(',');

  const encontrados = await camerasInBox(box);

  const emRota: SpeedCamera[] = [];

  for (const camera of encontrados) {
    let melhor = Infinity;
    let indice = 0;

    for (let i = 0; i < routeCoordinates.length; i += 1) {
      const d = distanceMeters(routeCoordinates[i], camera.coordinates);
      if (d < melhor) {
        melhor = d;
        indice = i;
      }
    }

    if (melhor <= CAMERA_CORRIDOR_M) {
      emRota.push({ ...camera, routeIndex: indice });
    }
  }

  return emRota.sort((a, b) => a.routeIndex - b.routeIndex);
}

/** O que se diz em voz alta, conforme o género de controlo. */
export function cameraLabel(camera: SpeedCamera): string {
  switch (camera.kind) {
    case 'media':
      return 'controlo de velocidade média';
    case 'semaforo':
      return 'radar de semáforo';
    case 'outro':
      return 'controlo de trânsito';
    default:
      return 'radar';
  }
}

/** O ícone do mapa e do painel, conforme o género. */
export function cameraIcon(kind: CameraKind): string {
  switch (kind) {
    case 'media':
      return 'speedometer';
    case 'semaforo':
      return 'traffic-light';
    case 'outro':
      return 'shield-alert-outline';
    default:
      return 'cctv';
  }
}
