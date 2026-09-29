import axios from 'axios';
import { t } from '../i18n';

import {
  CATEGORY_SEARCH_RADIUS_M,
  MAP_PINS_GRID_DEG,
  MAP_PINS_LIMIT,
  OVERPASS_BASE_URL,
  OVERPASS_FALLBACK_URL,
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
const overpassClient = axios.create({
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
 * Faz uma consulta, e se o servidor principal falhar tenta o segundo.
 *
 * Um 200 com `remark` conta como falha — ver a nota em `fetchPlaces`. Corre
 * **dentro** de uma vez da fila: o segundo servidor só é chamado quando o
 * primeiro já respondeu que não, por isso nunca há dois pedidos ao mesmo tempo.
 * Lança `PlacesError`, com a mensagem de "cheio" se foi isso que se ouviu por
 * último.
 */
export async function askOverpass(query: string): Promise<OverpassResponse> {
  let cheio = false;
  for (const url of [OVERPASS_BASE_URL, OVERPASS_FALLBACK_URL]) {
    try {
      const response = await overpassClient.post<OverpassResponse>(url, query);
      if (!response.data.remark) {
        return response.data;
      }
      cheio = true;
    } catch {
      cheio = false;
    }
  }
  throw new PlacesError(cheio ? t().errors.placesBusy : t().errors.placesFailed);
}

/**
 * Memória dos pedidos já feitos. A Overpass é pesada de correr, por isso
 * nunca se repete a mesma consulta.
 */
const cache = new Map<string, Place[]>();

/**
 * Os pinos automáticos, guardados **por quadrado da grelha** e não por área.
 *
 * **Guardar por área fazia cada zona nova custar a área inteira.** Arrastar o
 * mapa meio ecrã para o lado dava uma área diferente, uma chave diferente e um
 * pedido do ecrã todo — e até ele voltar, a metade que já se tinha visto ficava
 * como estava sem ganhar os pinos da outra. Guardado por quadrado, o que já se
 * conhece aparece logo, e à Overpass pede-se só a tira que falta: uma consulta
 * mais pequena, que o servidor responde mais depressa.
 *
 * A chave é o par de índices inteiros do quadrado (`i:j`), e não as
 * coordenadas, para uma casa decimal a mais não fazer do mesmo quadrado dois.
 */
const cells = new Map<string, Place[]>();

/** Quem espera por uma resposta: basta um continuar a querê-la para ela sair. */
type Wanted = () => boolean;
const always: Wanted = () => true;

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
 *
 * Guardam-se também os interessados: um pedido partilhado só se salta na fila
 * se **nenhum** deles o quiser já. Perguntar só ao primeiro deitava fora a
 * resposta de que o segundo estava à espera.
 */
const emCurso = new Map<string, { pedido: Promise<Place[]>; interessados: Wanted[] }>();

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

/** Partilha uma consulta com quem já estiver à espera da mesma chave. */
function shared(
  key: string,
  isWanted: Wanted,
  run: (wanted: Wanted) => Promise<Place[]>,
): Promise<Place[]> {
  const aCaminho = emCurso.get(key);
  if (aCaminho) {
    aCaminho.interessados.push(isWanted);
    return aCaminho.pedido;
  }

  const interessados = [isWanted];
  const pedido = run(() => interessados.some((quer) => quer())).finally(() => {
    emCurso.delete(key);
  });
  emCurso.set(key, { pedido, interessados });
  return pedido;
}

async function runQuery(cacheKey: string, query: string, isWanted: Wanted): Promise<Place[]> {
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  return shared(cacheKey, isWanted, async (wanted) => {
    const places = await fetchPlaces(query, wanted);
    cache.set(cacheKey, places);
    return places;
  });
}

/**
 * Faz a consulta pela fila e converte a resposta. Não guarda nada.
 *
 * Um pedido que já ninguém quer, quando lhe chega a vez, não sai — e rejeita com
 * `SupersededError`, que quem chamou ignora por já ter outra coisa no ecrã.
 */
async function fetchPlaces(query: string, isWanted: Wanted): Promise<Place[]> {
  // A Overpass responde 200 com um `remark` quando a consulta rebenta pelo
  // tempo ou pela memória. Guardar isso na memória era guardar uma falha para
  // sempre: aquela zona ficava sem negócios o resto da sessão, sem erro nenhum.
  // O `askOverpass` trata isso como falha.
  const data = await schedule(() => askOverpass(query), isWanted);

  // **Tira-se o que vier repetido.** Cada grupo de etiquetas tem o seu próprio
  // `out`, e um sítio que seja ao mesmo tempo loja e restaurante sai nos dois.
  // A chave é o tipo **e** o número: no OpenStreetMap um nó e uma linha podem
  // ter o mesmo número e não são o mesmo sítio.
  const seen = new Set<string>();
  const places: Place[] = [];

  for (const element of data.elements) {
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
  isWanted: Wanted = always,
): Promise<Place[]> {
  // Arredondar as coordenadas faz com que pequenas variações do GPS reaproveitem
  // o mesmo resultado, em vez de dispararem um pedido novo de cada vez.
  const lat = center.latitude.toFixed(3);
  const lon = center.longitude.toFixed(3);
  const cacheKey = `nearby|${category.id}|${lat},${lon}|${radiusMeters}`;

  return runQuery(
    cacheKey,
    taggedQuery(category.tags, `around:${radiusMeters},${lat},${lon}`, MAP_PINS_LIMIT),
    isWanted,
  );
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

/** Os índices dos quadrados da grelha que uma área toca. */
interface CellRange {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Os quadrados da grelha (`MAP_PINS_GRID_DEG`) que uma área toca.
 *
 * Alarga-se sempre para fora (`floor` de um lado, `ceil` do outro): a área
 * pedida tem de conter o que se está a ver, senão faltavam pinos nas bordas.
 */
function cellRange(bounds: Bounds): CellRange {
  const g = MAP_PINS_GRID_DEG;
  // A folga apaga o erro das contas em vírgula flutuante: -9,150 / 0,005 dá
  // -1830,0000001, e sem ela uma borda exata ganhava um quadrado a mais.
  const folga = 1e-6;
  const south = Math.floor(bounds.south / g + folga);
  const west = Math.floor(bounds.west / g + folga);
  return {
    south,
    west,
    north: Math.max(south, Math.ceil(bounds.north / g - folga) - 1),
    east: Math.max(west, Math.ceil(bounds.east / g - folga) - 1),
  };
}

function cellKey(i: number, j: number): string {
  return `${i}:${j}`;
}

/** Os pinos guardados de todos os quadrados da área, e se estão lá todos. */
function fromCells(r: CellRange): { places: Place[]; missing: [number, number][] } {
  const places: Place[] = [];
  const missing: [number, number][] = [];
  for (let i = r.south; i <= r.north; i++) {
    for (let j = r.west; j <= r.east; j++) {
      const guardados = cells.get(cellKey(i, j));
      if (guardados) {
        places.push(...guardados);
      } else {
        missing.push([i, j]);
      }
    }
  }
  return { places, missing };
}

/**
 * Procura os negócios que estão dentro da área visível do mapa.
 *
 * Pede à Overpass **só o retângulo dos quadrados que ainda não se conhecem** —
 * ver `cells`. Tudo o que vier é arrumado no quadrado onde cai, e todos os
 * quadrados do retângulo ficam dados como vistos, mesmo os que vierem vazios:
 * um quadrado sem negócios é uma resposta, não uma falta dela.
 *
 * Quem chama isto tem de respeitar o zoom mínimo e o tempo de espera definidos
 * em `config.ts` — sem isso, cada arrastar do dedo geraria um pedido novo.
 */
export async function searchInBounds(
  bounds: Bounds,
  isWanted: Wanted = always,
): Promise<Place[]> {
  const range = cellRange(bounds);
  const { missing } = fromCells(range);
  if (missing.length === 0) {
    return fromCells(range).places;
  }

  const pedir: CellRange = {
    south: Math.min(...missing.map(([i]) => i)),
    north: Math.max(...missing.map(([i]) => i)),
    west: Math.min(...missing.map(([, j]) => j)),
    east: Math.max(...missing.map(([, j]) => j)),
  };
  const g = MAP_PINS_GRID_DEG;
  const box = boundingBox({
    south: pedir.south * g,
    west: pedir.west * g,
    north: (pedir.north + 1) * g,
    east: (pedir.east + 1) * g,
  });

  await shared(`cells|${box}`, isWanted, async (wanted) => {
    const places = await fetchPlaces(taggedQuery(MAP_PIN_TAGS, box, MAP_PINS_LIMIT), wanted);

    const porQuadrado = new Map<string, Place[]>();
    for (let i = pedir.south; i <= pedir.north; i++) {
      for (let j = pedir.west; j <= pedir.east; j++) {
        porQuadrado.set(cellKey(i, j), []);
      }
    }
    // Um sítio mesmo em cima da borda do retângulo pode cair no quadrado ao
    // lado, que não foi pedido — fica de fora, e vem quando esse for pedido.
    for (const place of places) {
      const lista = porQuadrado.get(
        cellKey(
          Math.floor(place.coordinates.latitude / g),
          Math.floor(place.coordinates.longitude / g),
        ),
      );
      lista?.push(place);
    }
    for (const [key, lista] of porQuadrado) {
      cells.set(key, lista);
    }
    return places;
  });

  return fromCells(range).places;
}

/**
 * Os negócios desta área **que já estão em memória**. Não pede nada.
 *
 * Serve para os pinos aparecerem **de imediato**: por inteiro ao voltar a uma
 * zona por onde já se passou, e em parte ao arrastar o mapa para o lado — o que
 * continua à vista fica, e só a tira nova espera pela Overpass. O tempo de
 * espera do `MAP_PINS_DEBOUNCE_MS` existe para não atirar um pedido a cada
 * arrastar do dedo, e uma resposta que já está em memória não atira pedido
 * nenhum. Esperar por ela era cumprir a letra de uma regra contra a razão dela.
 *
 * `complete` diz se a área está toda coberta; se não estiver, falta pedir.
 */
export function cachedInBounds(bounds: Bounds): { places: Place[]; complete: boolean } {
  const { places, missing } = fromCells(cellRange(bounds));
  return { places, complete: missing.length === 0 };
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
  isWanted: Wanted = always,
): Promise<Place[]> {
  const box = boundingBox(bounds);
  return runQuery(
    `category|${category.id}|${box}`,
    taggedQuery(category.tags, box, MAP_PINS_LIMIT),
    isWanted,
  );
}
