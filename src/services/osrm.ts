import axios from 'axios';

import { OSRM_BASE_URL, REQUEST_TIMEOUT_MS, USER_AGENT } from './config';
import type { Coordinates, Route } from '../types/geo';
import type { OsrmRouteResponse } from '../types/osrm';

const client = axios.create({
  baseURL: OSRM_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
});

/** Erro com mensagem legível, para o ecrã poder mostrar algo de útil. */
export class RouteError extends Error {}

/**
 * Calcula o percurso de carro entre dois pontos.
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
      params: { overview: 'full', geometries: 'geojson' },
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
  };
}
