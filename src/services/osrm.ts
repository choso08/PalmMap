import axios from 'axios';

import { OSRM_BASE_URL, REQUEST_TIMEOUT_MS, USER_AGENT } from './config';
import type { Coordinates, Route, RouteStep } from '../types/geo';
import type { OsrmRouteResponse, OsrmStep } from '../types/osrm';
import { describeManeuver, maneuverIcon } from '../utils/maneuvers';

const client = axios.create({
  baseURL: OSRM_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
});

/** Erro com mensagem legível, para o ecrã poder mostrar algo de útil. */
export class RouteError extends Error {}

/** Converte uma manobra do OSRM numa instrução pronta a mostrar. */
/**
 * Se uma manobra merece ser dita em voz alta.
 *
 * Fica de fora tudo o que não obriga a decidir nada:
 *
 * - `continue` — segue-se pela mesma estrada, mesmo que ela descreva uma curva.
 *   É a causa de se ouvir a voz a cada curva de uma autoestrada.
 * - `new name` — a estrada muda de nome e vai-se em frente na mesma.
 * - `depart` — já se está a partir; dizê-lo não acrescenta nada.
 * - `notification` — o OSRM usa isto para avisos, não para manobras.
 */
function worthAnnouncing(step: OsrmStep): boolean {
  const { type } = step.maneuver;
  return type !== 'continue' && type !== 'new name' && type !== 'depart' && type !== 'notification';
}

function toRouteStep(step: OsrmStep): RouteStep {
  const [longitude, latitude] = step.maneuver.location;

  return {
    instruction: describeManeuver(step.maneuver, step.name),
    icon: maneuverIcon(step.maneuver.type, step.maneuver.modifier),
    streetName: step.name || undefined,
    distanceMeters: step.distance,
    location: { latitude, longitude },
    announce: worthAnnouncing(step),
  };
}

/**
 * Calcula o percurso entre dois pontos, com as instruções passo a passo.
 *
 * O servidor público do OSRM é para demonstrações e pode estar em baixo — quem
 * chamar esta função deve tratar o erro e mostrar uma mensagem decente.
 *
 * Sobre o `profile`: o endereço aceita 'driving', 'walking' e 'cycling', mas o
 * servidor público de demonstração pode ter só o perfil de carro instalado e
 * devolver na mesma o percurso de carro. Não foi possível confirmar isto — ver
 * a nota no CLAUDE.md.
 */
export async function getRoute(
  from: Coordinates,
  to: Coordinates,
  profile: 'driving' | 'walking' | 'cycling' = 'driving',
): Promise<Route> {
  // O OSRM espera as coordenadas por esta ordem: longitude,latitude.
  const path = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;

  let response;
  try {
    response = await client.get<OsrmRouteResponse>(`/route/v1/${profile}/${path}`, {
      // `steps=true` é o que traz as manobras uma a uma.
      params: { overview: 'full', geometries: 'geojson', steps: 'true' },
    });
  } catch {
    throw new RouteError('Não foi possível contactar o serviço de percursos.');
  }

  const { code, routes, message, waypoints } = response.data;
  if (code !== 'Ok' || routes.length === 0) {
    throw new RouteError(message ?? 'Não foi encontrado nenhum percurso entre estes pontos.');
  }

  const route = routes[0];
  const origem = waypoints?.[0];

  return {
    // O GeoJSON vem em [longitude, latitude] — aqui inverte-se para o formato da aplicação.
    coordinates: route.geometry.coordinates.map(([longitude, latitude]) => ({
      latitude,
      longitude,
    })),
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    // Um percurso sem paragens intermédias tem uma só "leg", mas juntam-se
    // todas para o caso de um dia se acrescentarem pontos de passagem.
    steps: route.legs.flatMap((leg) => leg.steps.map(toRouteStep)),
    startAwayMeters: origem?.distance ?? 0,
    startsAt: origem
      ? { longitude: origem.location[0], latitude: origem.location[1] }
      : null,
  };
}
