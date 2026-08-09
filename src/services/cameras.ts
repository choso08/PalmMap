import { CAMERA_CORRIDOR_M } from './config';
import { t } from '../i18n';
import type { Coordinates } from '../types/geo';
import type { OverpassElement, OverpassResponse } from '../types/overpass';
import { boundsOf, locateOnRoute } from '../utils/geometry';

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

/**
 * O cliente e a fila são **os mesmos** que os dos negócios.
 *
 * Ter fila própria era ter duas: cada uma cumpria os dois segundos por si, e um
 * percurso calculado enquanto o mapa procurava negócios mandava dois pedidos
 * pesados à Overpass no mesmo instante. É assim que se é bloqueado.
 */
import { boundingBox, overpassClient, overpassSchedule } from './overpass';

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

  const response = await overpassSchedule(() => overpassClient.post<OverpassResponse>('', query));

  if (response.data.remark) {
    // Ver a nota igual em `overpass.ts`: um 200 com `remark` é uma falha, e
    // guardá-la deixava este percurso sem radares para sempre.
    throw new Error(response.data.remark);
  }

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

  // Uma folga pequena à volta do percurso, para não cortar um radar mesmo na
  // borda. O retângulo calcula-se com uma passagem só: `Math.min(...lista)`
  // passa os pontos todos como argumentos, e num percurso longo — que com
  // `overview=full` são dezenas de milhares — isso rebenta a pilha.
  const margem = 0.005;
  const area = boundsOf(routeCoordinates);
  const box = boundingBox({
    south: area.south - margem,
    west: area.west - margem,
    north: area.north + margem,
    east: area.east + margem,
  });

  const encontrados = await camerasInBox(box);

  const emRota: SpeedCamera[] = [];

  // Um grau de latitude são uns 111 km. Comparar em graus antes de fazer a
  // conta a sério tira de cima a esmagadora maioria dos radares — sem isto,
  // eram 400 radares vezes dezenas de milhares de pontos, tudo de uma vez e a
  // bloquear o ecrã no momento em que o percurso acaba de aparecer.
  const grauFolga = (CAMERA_CORRIDOR_M / 111000) * 4;

  for (const camera of encontrados) {
    const perto =
      camera.coordinates.latitude >= area.south - grauFolga &&
      camera.coordinates.latitude <= area.north + grauFolga &&
      camera.coordinates.longitude >= area.west - grauFolga &&
      camera.coordinates.longitude <= area.east + grauFolga;

    if (!perto) {
      continue;
    }

    // O mesmo `locateOnRoute` que a navegação usa para saber onde se está: uma
    // só regra de "ponto mais próximo do percurso" em toda a aplicação.
    const { index, offRouteMeters } = locateOnRoute(routeCoordinates, camera.coordinates);
    if (offRouteMeters <= CAMERA_CORRIDOR_M) {
      emRota.push({ ...camera, routeIndex: index });
    }
  }

  return emRota.sort((a, b) => a.routeIndex - b.routeIndex);
}

/** O que se diz em voz alta, conforme o género de controlo. */
export function cameraLabel(camera: SpeedCamera): string {
  switch (camera.kind) {
    case 'media':
      return t().cameras.average;
    case 'semaforo':
      return t().cameras.trafficSignals;
    case 'outro':
      return t().cameras.traffic;
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
