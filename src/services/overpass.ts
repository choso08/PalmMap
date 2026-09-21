import axios from 'axios';
import { t } from '../i18n';

import {
  CATEGORY_SEARCH_RADIUS_M,
  MAP_PINS_GRID_DEG,
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

/**
 * O cliente e a fila da Overpass, partilhados por quem lhe fizer perguntas.
 *
 * **A fila tem de ser uma só.** O `createRateLimiter` guarda o tempo do último
 * pedido dentro de si; duas filas com o mesmo intervalo são duas filas, e os
 * dois segundos que as regras da Overpass pedem passavam a ser cumpridos por
 * cada uma de sua vez — ou seja, dois pedidos ao mesmo tempo. Foi o que
 * aconteceu quando os radares criaram a sua.
 */
export const overpassClient = axios.create({
  baseURL: OVERPASS_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'User-Agent': USER_AGENT,
    // A Overpass espera a consulta num campo `data`, como um formulário.
    'Content-Type': 'application/x-www-form-urlencoded',
  },
});

export const overpassSchedule = createRateLimiter(OVERPASS_MIN_INTERVAL_MS);
const schedule = overpassSchedule;

/**
 * Memória dos pedidos já feitos. A Overpass é pesada de correr, por isso
 * nunca se repete a mesma consulta.
 */
const cache = new Map<string, Place[]>();

/**
 * As consultas que estão a decorrer neste momento, pela mesma chave da cache.
 *
 * **Sem isto, a mesma área era pedida duas vezes.** A fila espaça os pedidos
 * dois segundos; quem chegue durante esse tempo a pedir exatamente o mesmo — e
 * chega, porque o mapa a voltar a uma zona por onde passou há um instante dá a
 * mesma chave — entrava na fila atrás do primeiro em vez de esperar por ele. A
 * cache só começava a valer depois de o primeiro **acabar**. Aqui partilha-se a
 * promessa: o segundo recebe a resposta do primeiro, sem pedido nenhum e sem
 * esperar pelo intervalo da fila.
 */
const emCurso = new Map<string, Promise<Place[]>>();

/** Erro com mensagem legível, para o ecrã poder mostrar algo de útil. */
export class PlacesError extends Error {}

/**
 * Monta uma consulta com **um `out` por grupo de etiquetas**.
 *
 * Não é arrumação: um `out` só, no fim de uma união, dá o limite todo ao
 * primeiro grupo — e dentro dele às coisas com número mais baixo no
 * OpenStreetMap, que ficam onde calhar. Ver a nota em `MAP_PINS_LIMIT`, que é
 * onde a avaria está contada por inteiro.
 */
function taggedQuery(
  groups: { key: string; values: string[] | null }[],
  area: string,
  limit: number,
): string {
  const linhas = groups.flatMap(({ key, values }) => [
    `nwr${tagFilter(key, values)}(${area});`,
    `out center ${limit};`,
  ]);
  return `[out:json][timeout:25];\n${linhas.join('\n')}`;
}

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

  const aCaminho = emCurso.get(cacheKey);
  if (aCaminho) {
    return aCaminho;
  }

  const pedido = fetchQuery(cacheKey, query);
  emCurso.set(cacheKey, pedido);
  try {
    return await pedido;
  } finally {
    emCurso.delete(cacheKey);
  }
}

async function fetchQuery(cacheKey: string, query: string): Promise<Place[]> {
  let response;
  try {
    response = await schedule(() => overpassClient.post<OverpassResponse>('', query));
  } catch {
    throw new PlacesError(t().errors.placesFailed);
  }

  // A Overpass responde 200 com um `remark` quando a consulta rebenta pelo
  // tempo ou pela memória. Guardar isso na memória era guardar uma falha para
  // sempre: aquela zona ficava sem negócios o resto da sessão, sem erro nenhum.
  if (response.data.remark) {
    throw new PlacesError(t().errors.placesBusy);
  }

  // **Tira-se o que vier repetido.** Cada grupo de etiquetas tem o seu próprio
  // `out`, e um sítio que seja ao mesmo tempo loja e restaurante sai nos dois.
  // A chave é o tipo **e** o número: no OpenStreetMap um nó e uma linha podem
  // ter o mesmo número e não são o mesmo sítio.
  const seen = new Set<string>();
  const places: Place[] = [];

  for (const element of response.data.elements) {
    const chave = `${element.type}/${element.id}`;
    if (seen.has(chave)) {
      continue;
    }
    const place = toPlace(element);
    if (place) {
      seen.add(chave);
      places.push(place);
    }
  }

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

  return runQuery(
    cacheKey,
    taggedQuery(category.tags, `around:${radiusMeters},${lat},${lon}`, MAP_PINS_LIMIT),
  );
}

/**
 * Alarga a área até às linhas de uma grelha fixa.
 *
 * Assim, todas as vistas que caem no mesmo quadrado dão a mesma área — e
 * portanto a mesma chave de cache e **um só pedido**. Sem isto, um dedo a
 * arrastar meio centímetro dava uma área diferente ao metro, e a cache, que
 * existe precisamente para poupar a Overpass, nunca acertava.
 *
 * Alarga-se sempre para fora (`floor` de um lado, `ceil` do outro): a área
 * pedida tem de conter o que se está a ver, senão faltavam pinos nas bordas.
 */
function snapToGrid(bounds: Bounds): Bounds {
  const g = MAP_PINS_GRID_DEG;
  return {
    south: Math.floor(bounds.south / g) * g,
    west: Math.floor(bounds.west / g) * g,
    north: Math.ceil(bounds.north / g) * g,
    east: Math.ceil(bounds.east / g) * g,
  };
}

/** O retângulo no formato que a Overpass quer: sul,oeste,norte,este. */
export function boundingBox(bounds: Bounds): string {
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
  const box = boundingBox(snapToGrid(bounds));
  return runQuery(`bounds|${box}`, taggedQuery(MAP_PIN_TAGS, box, MAP_PINS_LIMIT));
}

/**
 * Os negócios desta área, **se já estiverem em memória**. Não pede nada.
 *
 * Serve para os pinos aparecerem **de imediato** ao voltar a uma zona por onde
 * já se passou. O tempo de espera do `MAP_PINS_DEBOUNCE_MS` existe para não
 * atirar um pedido à Overpass a cada arrastar do dedo — e uma resposta que já
 * está em memória não atira pedido nenhum. Esperar por ela era cumprir a letra
 * de uma regra contra a razão dela.
 *
 * Devolve `null` quando não há nada guardado, para se distinguir isso de uma
 * área que se sabe estar vazia.
 */
export function cachedInBounds(bounds: Bounds): Place[] | null {
  return cache.get(`bounds|${boundingBox(snapToGrid(bounds))}`) ?? null;
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
  return runQuery(
    `category|${category.id}|${box}`,
    taggedQuery(category.tags, box, MAP_PINS_LIMIT),
  );
}
