import axios from 'axios';

import {
  NOMINATIM_BASE_URL,
  NOMINATIM_MIN_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
} from './config';
import { createRateLimiter } from './rateLimit';
import type {
  NominatimReverseResponse,
  NominatimSearchResponse,
  NominatimSearchResult,
} from '../types/nominatim';
import type { Coordinates, Place } from '../types/geo';
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
 * Procura locais a partir de texto escrito ("Rua Augusta, Lisboa").
 *
 * Não chamar isto a cada tecla escrita — usar sempre com o atraso definido em
 * SEARCH_DEBOUNCE_MS, ou só quando a pessoa confirmar a pesquisa.
 */
export async function searchPlaces(query: string, limit = 8): Promise<Place[]> {
  const term = query.trim();
  if (term.length === 0) {
    return [];
  }

  const cacheKey = `${term.toLowerCase()}|${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await schedule(() =>
    client.get<NominatimSearchResponse>('/search', {
      // `extratags=1` traz o telefone, o horário e o sítio na Internet.
      params: { q: term, format: 'jsonv2', limit, addressdetails: 0, extratags: 1 },
    }),
  );

  const places = response.data.map(toPlace);
  cache.set(cacheKey, places);
  return places;
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
        params: { lat, lon, format: 'jsonv2', zoom: 18, extratags: 1 },
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
