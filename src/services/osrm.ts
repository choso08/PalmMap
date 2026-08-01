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
function toRouteStep(step: OsrmStep): RouteStep {
  const [longitude, latitude] = step.maneuver.location;

  return {
    instruction: describeManeuver(step.maneuver, step.name),
    icon: maneuverIcon(step.maneuver.type, step.maneuver.modifier),
    streetName: step.name || undefined,
    distanceMeters: step.distance,
    location: { latitude, longitude },
  };
}

/**
 * Calcula o percurso de carro entre dois pontos, com as instruções passo a passo.
 *
 * O servidor público do OSRM é para demonstrações e pode estar em baixo — quem
 * chamar esta função deve tratar o erro e mostrar uma mensagem decente.
 */
export async function getRoute(from: Coordinates, to: Coordinates): Promise<Route> {
  // O OSRM espera as coordenadas por esta ordem: longitude,latitude.
  const path = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;

  let response;
  try {
    response = await client.get<OsrmRouteResponse>(`/route/v1/driving/${path}`, {
      // `steps=true` é o que traz as manobras uma a uma.
      params: { overview: 'full', geometries: 'geojson', steps: 'true' },
    });
  } catch {
    throw new RouteError('Não foi possível contactar o serviço de percursos.');
  }

  const { code, routes, message } = response.data;
  if (code !== 'Ok' || routes.length === 0) {
    throw new RouteError(message ?? 'Não foi encontrado nenhum percurso entre estes pontos.');
  }

  const route = routes[0];

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
  };
}
