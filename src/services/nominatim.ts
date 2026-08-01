import axios from 'axios';

import {
  NOMINATIM_BASE_URL,
  NOMINATIM_MIN_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
} from './config';
import type { NominatimSearchResponse } from '../types/nominatim';
import type { Place } from '../types/geo';

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

/**
 * Fila que garante o intervalo mínimo entre pedidos.
 *
 * Cada pedido novo espera pelo anterior e, se for preciso, espera mais um pouco
 * até ter passado 1 segundo desde o último. Assim nunca se ultrapassa o limite do
 * serviço, mesmo que a aplicação peça várias coisas ao mesmo tempo.
 */
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function schedule<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(async () => {
    const waitFor = lastRequestAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (waitFor > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitFor));
    }
    lastRequestAt = Date.now();
    return task();
  });

  // A fila continua mesmo que este pedido falhe, senão bloqueava os seguintes.
  queue = result.catch(() => undefined);
  return result;
}

/** Converte um resultado do Nominatim no formato que a aplicação usa. */
function toPlace(raw: NominatimSearchResponse[number]): Place {
  return {
    id: raw.place_id,
    // Nem todos os resultados trazem `name`; nesse caso usa-se o início da morada.
    name: raw.name || raw.display_name.split(',')[0],
    address: raw.display_name,
    coordinates: {
      latitude: Number(raw.lat),
      longitude: Number(raw.lon),
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
      params: { q: term, format: 'jsonv2', limit, addressdetails: 0 },
    }),
  );

  const places = response.data.map(toPlace);
  cache.set(cacheKey, places);
  return places;
}
