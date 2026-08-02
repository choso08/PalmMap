import axios from 'axios';

import {
  CATEGORY_SEARCH_RADIUS_M,
  MAP_PINS_LIMIT,
  OVERPASS_BASE_URL,
  OVERPASS_MIN_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
} from './config';
import { createRateLimiter } from './rateLimit';
import type { Bounds, Coordinates, Place } from '../types/geo';
import type { OverpassElement, OverpassResponse } from '../types/overpass';
import { MAP_PIN_TAGS, categoryLabel, type SearchCategory } from '../utils/categories';

const client = axios.create({
  baseURL: OVERPASS_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'User-Agent': USER_AGENT,
    // A Overpass espera a consulta num campo `data`, como um formulário.
    'Content-Type': 'application/x-www-form-urlencoded',
  },
});

const schedule = createRateLimiter(OVERPASS_MIN_INTERVAL_MS);

/**
 * Memória dos pedidos já feitos. A Overpass é pesada de correr, por isso
 * nunca se repete a mesma consulta.
 */
const cache = new Map<string, Place[]>();

/** Erro com mensagem legível, para o ecrã poder mostrar algo de útil. */
export class PlacesError extends Error {}

/** Constrói o filtro de etiquetas, no formato que a Overpass entende. */
function tagFilter(key: string, values: string[] | null): string {
  if (values === null) {
    return `[${key}]`;
  }
  if (values.length === 1) {
    return `[${key}=${values[0]}]`;
  }
  return `[${key}~"^(${values.join('|')})$"]`;
}

/** Converte um elemento da Overpass no formato que a aplicação usa. */
function toPlace(element: OverpassElement): Place | null {
  const tags = element.tags ?? {};

  // Sem nome não vale a pena mostrar: seria um pino anónimo no mapa.
  const name = tags.name;
  if (!name) {
    return null;
  }

  // Os pontos trazem lat/lon; as áreas e linhas só trazem o centro.
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (latitude === undefined || longitude === undefined) {
    return null;
  }

  // A Overpass não devolve a morada montada — constrói-se a partir das partes.
  const address = [
    [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' '),
    tags['addr:postcode'],
    tags['addr:city'],
  ]
    .filter(Boolean)
    .join(', ');

  return {
    id: element.id,
    name,
    address,
    coordinates: { latitude, longitude },
    category: categoryLabel(tags),
    details: {
      phone: tags.phone ?? tags['contact:phone'],
      website: tags.website ?? tags['contact:website'],
      openingHours: tags.opening_hours,
    },
  };
}

async function runQuery(cacheKey: string, query: string): Promise<Place[]> {
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let response;
  try {
    response = await schedule(() => client.post<OverpassResponse>('', query));
  } catch {
    throw new PlacesError('Não foi possível procurar locais. Tente daqui a pouco.');
  }

  const places = response.data.elements
    .map(toPlace)
    .filter((place): place is Place => place !== null);

  cache.set(cacheKey, places);
  return places;
}

/**
 * Procura negócios de uma categoria à volta de um ponto.
 * É o que está por trás dos botões "Restaurantes", "Farmácias", etc.
 */
export async function searchNearby(
  category: SearchCategory,
  center: Coordinates,
  radiusMeters = CATEGORY_SEARCH_RADIUS_M,
): Promise<Place[]> {
  // Arredondar as coordenadas faz com que pequenas variações do GPS reaproveitem
  // o mesmo resultado, em vez de dispararem um pedido novo de cada vez.
  const lat = center.latitude.toFixed(3);
  const lon = center.longitude.toFixed(3);
  const cacheKey = `nearby|${category.id}|${lat},${lon}|${radiusMeters}`;

  const filters = category.tags
    .map(({ key, values }) => `  nwr${tagFilter(key, values)}(around:${radiusMeters},${lat},${lon});`)
    .join('\n');

  const query = `[out:json][timeout:25];\n(\n${filters}\n);\nout center ${MAP_PINS_LIMIT};`;

  return runQuery(cacheKey, query);
}

function boundingBox(bounds: Bounds): string {
  return [
    bounds.south.toFixed(4),
    bounds.west.toFixed(4),
    bounds.north.toFixed(4),
    bounds.east.toFixed(4),
  ].join(',');
}

/**
 * Procura os negócios que estão dentro da área visível do mapa.
 *
 * Quem chama isto tem de respeitar o zoom mínimo e o tempo de espera definidos
 * em `config.ts` — sem isso, cada arrastar do dedo geraria um pedido novo.
 */
export async function searchInBounds(bounds: Bounds): Promise<Place[]> {
  const box = boundingBox(bounds);

  const filters = MAP_PIN_TAGS.map(
    ({ key, values }) => `  nwr${tagFilter(key, values)}(${box});`,
  ).join('\n');

  const query = `[out:json][timeout:25];\n(\n${filters}\n);\nout center ${MAP_PINS_LIMIT};`;

  return runQuery(`bounds|${box}`, query);
}

/**
 * Procura negócios de uma categoria dentro da área visível do mapa.
 *
 * É o que está por trás dos botões "Restaurantes", "Farmácias", etc. Procura no
 * que se está a ver, e não à volta do GPS: de outra forma, ao olhar para outra
 * zona do mapa os resultados apareciam longe dali e parecia que o botão não
 * fazia nada.
 */
export async function searchCategoryInBounds(
  category: SearchCategory,
  bounds: Bounds,
): Promise<Place[]> {
  const box = boundingBox(bounds);

  const filters = category.tags
    .map(({ key, values }) => `  nwr${tagFilter(key, values)}(${box});`)
    .join('\n');

  const query = `[out:json][timeout:25];\n(\n${filters}\n);\nout center ${MAP_PINS_LIMIT};`;

  return runQuery(`category|${category.id}|${box}`, query);
}
