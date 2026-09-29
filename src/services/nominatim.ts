import axios from 'axios';
import { acceptLanguage, activeLanguage } from '../i18n';

import {
  NOMINATIM_BASE_URL,
  NOMINATIM_MIN_INTERVAL_MS,
  PHOTON_BASE_URL,
  REQUEST_TIMEOUT_MS,
  SEARCH_TIMEOUT_MS,
  USER_AGENT,
} from './config';
import { SupersededError, createRateLimiter } from './rateLimit';
import type {
  NominatimReverseResponse,
  NominatimSearchResponse,
  NominatimSearchResult,
} from '../types/nominatim';
import type { PhotonFeature, PhotonResponse } from '../types/photon';
import type { Bounds, Coordinates, Place } from '../types/geo';
import { t } from '../i18n';
import { categoryLabel } from '../utils/categories';

const client = axios.create({
  baseURL: NOMINATIM_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
});

/**
 * Memória dos resultados já obtidos, para nunca repetir a mesma pesquisa.
 * Fica só em memória: ao fechar a aplicação, esvazia-se. Chega bem para o uso previsto.
 */
const cache = new Map<string, Place[]>();

/** Garante o intervalo mínimo de 1 pedido por segundo exigido pelo Nominatim. */
const schedule = createRateLimiter(NOMINATIM_MIN_INTERVAL_MS);

/**
 * As pesquisas a caminho, pela mesma chave da cache, e quem espera por elas.
 *
 * Carregar em Enter pesquisa logo, e o segundo de espera que vinha a correr
 * acabava a seguir e pedia **a mesma coisa outra vez** — que, por a primeira
 * ainda não ter respondido, não estava na cache e ia para a fila, um segundo
 * atrás. Aqui o segundo pedido espera pela resposta do primeiro.
 */
const emCurso = new Map<string, { pedido: Promise<Place[]>; interessados: (() => boolean)[] }>();

/** Converte um resultado do Nominatim no formato que a aplicação usa. */
function toPlace(raw: NominatimSearchResult): Place {
  const extra = raw.extratags ?? {};

  return {
    id: raw.place_id,
    // Nem todos os resultados trazem `name`; nesse caso usa-se o início da morada.
    name: raw.name || raw.display_name.split(',')[0],
    address: raw.display_name,
    coordinates: {
      latitude: Number(raw.lat),
      longitude: Number(raw.lon),
    },
    // O Nominatim dá a categoria em duas partes ('amenity' + 'restaurant'), que
    // é a mesma forma das etiquetas do OpenStreetMap — dá para reaproveitar a
    // mesma tradução que se usa nos negócios vindos da Overpass.
    category: categoryLabel({ [raw.category]: raw.type }),
    details: {
      phone: extra.phone ?? extra['contact:phone'],
      website: extra.website ?? extra['contact:website'],
      openingHours: extra.opening_hours,
    },
  };
}

/**
 * Procura locais a partir de texto escrito ("Rua Augusta" ou "Hotel Miramar").
 *
 * O `near` é a área que se está a ver no mapa, e faz toda a diferença ao
 * procurar negócios: sem ela, o Nominatim procura no mundo inteiro e ordena
 * pelo que é mais conhecido — escrever o nome de um café da esquina trazia um
 * homónimo do outro lado do planeta. Com ela, o que está à vista vem primeiro.
 *
 * Não é um limite, é uma preferência (`bounded=0`): quem procurar uma cidade
 * noutro país continua a encontrá-la.
 *
 * Não chamar isto a cada tecla escrita — usar sempre com o atraso definido em
 * SEARCH_DEBOUNCE_MS, ou só quando a pessoa confirmar a pesquisa.
 */
export async function searchPlaces(
  query: string,
  limit = 8,
  near?: Bounds | null,
  isWanted: () => boolean = () => true,
): Promise<Place[]> {
  const term = query.trim();
  if (term.length === 0) {
    return [];
  }

  // A área entra na chave arredondada: sem isso, cada pequeno arrastar do mapa
  // fazia a mesma pesquisa contar como nova.
  const caixa = near
    ? `${near.west.toFixed(1)},${near.north.toFixed(1)},${near.east.toFixed(1)},${near.south.toFixed(1)}`
    : '';
  const cacheKey = `${term.toLowerCase()}|${limit}|${caixa}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const aCaminho = emCurso.get(cacheKey);
  if (aCaminho) {
    aCaminho.interessados.push(isWanted);
    return aCaminho.pedido;
  }

  const interessados = [isWanted];
  const pedido = fetchSearch(term, limit, caixa, near ?? null, cacheKey, () =>
    interessados.some((quer) => quer()),
  ).finally(() => emCurso.delete(cacheKey));
  emCurso.set(cacheKey, { pedido, interessados });
  return pedido;
}

/**
 * O pedido em si. Se, quando lhe chega a vez na fila, já ninguém quiser a
 * resposta — escreveu-se mais entretanto — não sai: é menos um pedido ao
 * Nominatim e menos um segundo à frente da pesquisa que interessa.
 */
async function fetchSearch(
  term: string,
  limit: number,
  caixa: string,
  near: Bounds | null,
  cacheKey: string,
  isWanted: () => boolean,
): Promise<Place[]> {
  let falhaNominatim: unknown;
  try {
    const response = await schedule(
      () =>
        client.get<NominatimSearchResponse>('/search', {
          timeout: SEARCH_TIMEOUT_MS,
          // `extratags=1` traz o telefone, o horário e o sítio na Internet.
          params: {
            q: term,
            format: 'jsonv2',
            limit,
            addressdetails: 0,
            extratags: 1,
            // Os nomes vêm na língua da aplicação onde o OpenStreetMap os tiver
            // traduzidos: quem está em inglês vê "Lisbon" e não "Lisboa".
            'accept-language': acceptLanguage(activeLanguage()),
            // Ordem exigida pelo Nominatim: oeste, norte, este, sul.
            ...(caixa ? { viewbox: caixa, bounded: 0 } : {}),
          },
        }),
      isWanted,
    );

    // Uma resposta que não seja uma lista não é resultado nenhum — é uma
    // página de erro servida com 200, e tratá-la como lista rebentava adiante.
    if (!Array.isArray(response.data)) {
      throw new Error('resposta inesperada');
    }
    const places = response.data.map(toPlace);
    cache.set(cacheKey, places);
    return places;
  } catch (error) {
    if (error instanceof SupersededError) {
      throw error;
    }
    falhaNominatim = error;
  }

  // **O Nominatim falhou: pergunta-se ao Photon.** Só agora, e nunca aos dois ao
  // mesmo tempo — ver `PHOTON_BASE_URL`.
  try {
    const places = await searchPhoton(term, limit, near, isWanted);
    cache.set(cacheKey, places);
    return places;
  } catch (error) {
    if (error instanceof SupersededError) {
      throw error;
    }
    // Os dois falharam. A mensagem diz o que o Nominatim respondeu, que é o
    // serviço principal — ver `searchError`.
    throw searchError(falhaNominatim);
  }
}

/** Erro da pesquisa, com uma mensagem que diz o que falhou mesmo. */
export class SearchError extends Error {}

/**
 * Traduz a falha do Nominatim numa mensagem que diga **o que** falhou.
 *
 * **"Verifique a ligação à Internet" era a mensagem para tudo**, e dizia o
 * contrário do que se passava a quem tinha rede e o mapa a carregar: uma
 * recusa do serviço (403, 429) ou um serviço lento ficavam iguais a estar sem
 * rede. Com o número de resposta no ecrã, uma fotografia diz qual é — é a
 * mesma decisão tomada nos horários (`carrisGet`).
 */
function searchError(error: unknown): SearchError {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      return new SearchError(t().search.failedStatus(error.response.status));
    }
    if (error.code === 'ECONNABORTED') {
      return new SearchError(t().search.failedTimeout);
    }
    return new SearchError(t().search.failed);
  }
  return new SearchError(t().search.failedOther);
}

/** O Photon tem fila própria: é outro serviço, com o seu próprio limite. */
const photonSchedule = createRateLimiter(NOMINATIM_MIN_INTERVAL_MS);

const photon = axios.create({
  baseURL: PHOTON_BASE_URL,
  timeout: SEARCH_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
});

/**
 * Pesquisa no Photon, o segundo recurso.
 *
 * A preferência pelo que está à vista faz-se com o centro do mapa (`lat`/`lon`)
 * — o Photon não tem o `viewbox` do Nominatim, e o `bbox` dele é um limite, não
 * uma preferência. A língua só se indica em inglês: o servidor público não tem
 * português, e sem nada vêm os nomes locais, que em Portugal já são esses.
 */
async function searchPhoton(
  term: string,
  limit: number,
  near: Bounds | null,
  isWanted: () => boolean,
): Promise<Place[]> {
  const response = await photonSchedule(
    () =>
      photon.get<PhotonResponse>('/api', {
        params: {
          q: term,
          limit,
          ...(activeLanguage() === 'en' ? { lang: 'en' } : {}),
          ...(near
            ? {
                lat: ((near.south + near.north) / 2).toFixed(4),
                lon: ((near.west + near.east) / 2).toFixed(4),
              }
            : {}),
        },
      }),
    isWanted,
  );

  return (response.data.features ?? [])
    .map(photonToPlace)
    .filter((place): place is Place => place !== null);
}

/** Converte um resultado do Photon no formato que a aplicação usa. */
function photonToPlace(feature: PhotonFeature, index: number): Place | null {
  const coords = feature.geometry?.coordinates;
  const p = feature.properties ?? {};
  if (!coords || coords.length < 2) {
    return null;
  }
  // Atenção à ordem: em GeoJSON é longitude primeiro.
  const [longitude, latitude] = coords;

  const rua = [p.street, p.housenumber].filter(Boolean).join(' ');
  const partes = [rua, p.postcode, p.city ?? p.district, p.state, p.country].filter(
    (parte): parte is string => Boolean(parte) && parte !== p.name,
  );
  const extra = p.extra ?? {};

  return {
    // O Photon não tem `place_id`; o número do OpenStreetMap serve, e o índice
    // desempata os raros que venham sem ele.
    id: p.osm_id ?? -(index + 1),
    name: p.name || rua || partes[0] || '',
    address: partes.join(', '),
    coordinates: { latitude, longitude },
    category: p.osm_key && p.osm_value ? categoryLabel({ [p.osm_key]: p.osm_value }) : undefined,
    details: {
      phone: extra.phone ?? extra['contact:phone'],
      website: extra.website ?? extra['contact:website'],
      openingHours: extra.opening_hours,
    },
  };
}

/**
 * Descobre que morada corresponde a um ponto do mapa — o contrário da pesquisa.
 *
 * É o que dá nome ao pino que se larga com um toque longo. Devolve `null` se
 * não houver nada naquele ponto (no meio do mar, por exemplo) ou se o serviço
 * falhar: nesse caso o pino fica na mesma, só sem morada.
 *
 * Passa pela mesma fila de 1 pedido por segundo do resto do Nominatim.
 */
export async function reverseGeocode(coordinates: Coordinates): Promise<Place | null> {
  const lat = coordinates.latitude.toFixed(5);
  const lon = coordinates.longitude.toFixed(5);
  const cacheKey = `reverse|${lat},${lon}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    return cached[0] ?? null;
  }

  try {
    const response = await schedule(() =>
      client.get<NominatimReverseResponse>('/reverse', {
        params: {
          lat,
          lon,
          format: 'jsonv2',
          zoom: 18,
          extratags: 1,
          'accept-language': acceptLanguage(activeLanguage()),
        },
      }),
    );

    if ('error' in response.data) {
      return null;
    }

    const place = toPlace(response.data);
    cache.set(cacheKey, [place]);
    return place;
  } catch {
    return null;
  }
}
