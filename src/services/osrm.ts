import axios from 'axios';

import {
  OSRM_ENDPOINTS,
  OSRM_MIN_INTERVAL_MS,
  OSRM_PROFILE_PATH,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
} from './config';
import { createRateLimiter } from './rateLimit';
import type { Coordinates, Route, RouteStep } from '../types/geo';
import type { OsrmRouteResponse, OsrmStep } from '../types/osrm';
import { describeManeuver, maneuverIcon } from '../utils/maneuvers';

const client = axios.create({
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
});

/**
 * As condições de utilização da FOSSGIS pedem no máximo um pedido por segundo.
 * Sem isto, escolher o destino e mudar logo de meio de transporte mandava dois
 * pedidos quase ao mesmo tempo.
 */
const schedule = createRateLimiter(OSRM_MIN_INTERVAL_MS);

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
 * Cada meio de transporte tem o seu servidor — ver `OSRM_ENDPOINTS`. É isso que
 * faz um percurso a pé ignorar os sentidos únicos e contar o tempo a passo de
 * pessoa, em vez de vir o percurso de carro com outro nome.
 */
export async function getRoute(
  from: Coordinates,
  to: Coordinates,
  profile: 'driving' | 'walking' | 'cycling' = 'driving',
  avoidTolls = false,
): Promise<Route> {
  const [primeiro] = await getRoutes(from, [], to, profile, avoidTolls);
  return primeiro;
}

/**
 * Calcula o percurso, com paragens pelo caminho e caminhos alternativos.
 *
 * Devolve sempre pelo menos um percurso. Quando há mais do que um, o primeiro é
 * o que o OSRM considera melhor — mas a escolha é de quem conduz.
 *
 * **Alternativas e paragens não andam juntas.** O OSRM só sabe procurar caminhos
 * alternativos entre dois pontos; com paragens pelo meio responde que não está
 * implementado. Por isso só se pedem alternativas quando não há paragens.
 */
export async function getRoutes(
  from: Coordinates,
  via: Coordinates[],
  to: Coordinates,
  profile: 'driving' | 'walking' | 'cycling' = 'driving',
  avoidTolls = false,
): Promise<Route[]> {
  // O OSRM espera as coordenadas por esta ordem: longitude,latitude.
  const pontos = [from, ...via, to];
  const path = pontos.map((p) => `${p.longitude},${p.latitude}`).join(';');

  // `steps=true` é o que traz as manobras uma a uma.
  const params: Record<string, string> = {
    overview: 'full',
    geometries: 'geojson',
    steps: 'true',
  };

  if (via.length === 0) {
    // Três chegam: mais do que isso são variações de metros que só confundem.
    params.alternatives = '3';
  }

  if (avoidTolls && profile === 'driving') {
    // O perfil de carro do OSRM marca as estradas com portagem como uma classe
    // que se pode excluir. **Nem todos os servidores a têm ativada** — se este
    // não tiver, responde com erro e tenta-se outra vez sem isto, que é melhor
    // do que ficar sem percurso nenhum.
    params.exclude = 'toll';
  }

  let response;
  try {
    const base = OSRM_ENDPOINTS[profile];
    const perfil = OSRM_PROFILE_PATH[profile];
    response = await schedule(() =>
      client.get<OsrmRouteResponse>(`${base}/route/v1/${perfil}/${path}`, { params }),
    );
  } catch {
    throw new RouteError('Não foi possível contactar o serviço de percursos.');
  }

  if (params.exclude && response.data.code !== 'Ok') {
    // Segunda tentativa sem a exclusão. Sai um percurso com portagens, que é o
    // que há — e quem chamou fica a saber pelo `avoidedTolls`.
    return getRoutes(from, via, to, profile, false);
  }

  const { code, routes, message, waypoints } = response.data;
  if (code !== 'Ok' || routes.length === 0) {
    throw new RouteError(message ?? 'Não foi encontrado nenhum percurso entre estes pontos.');
  }

  const origem = waypoints?.[0];

  return routes.map((route) => ({
    // O GeoJSON vem em [longitude, latitude] — aqui inverte-se para o formato da aplicação.
    coordinates: route.geometry.coordinates.map(([longitude, latitude]) => ({
      latitude,
      longitude,
    })),
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    // Uma "leg" por cada troço entre paragens. Juntam-se todas: a navegação
    // segue-as de seguida, como se fosse um percurso só.
    steps: route.legs.flatMap((leg) => leg.steps.map(toRouteStep)),
    startAwayMeters: origem?.distance ?? 0,
    startsAt: origem
      ? { longitude: origem.location[0], latitude: origem.location[1] }
      : null,
    // Verdadeiro só quando o servidor mesmo aceitou evitar as portagens. Serve
    // para o painel poder dizer a verdade em vez de prometer o que não fez.
    avoidedTolls: Boolean(params.exclude),
  }));
}
