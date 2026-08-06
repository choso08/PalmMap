import axios from 'axios';

import {
  CARRIS_BASE_URL,
  CARRIS_MIN_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
} from './config';
import { createRateLimiter } from './rateLimit';
import type { Coordinates } from '../types/geo';
import type { CarrisArrival, CarrisStop } from '../types/transit';
import { distanceMeters } from '../utils/geometry';

/**
 * Paragens e horas de passagem dos transportes públicos.
 *
 * ## O que isto cobre, e o que não cobre
 *
 * A fonte é a **API aberta da Carris Metropolitana**, que serve a Área
 * Metropolitana de Lisboa — quinze dos dezoito concelhos. Não pede chave nenhuma
 * e é a mesma que a aplicação oficial usa, por isso os tempos são os mesmos.
 *
 * **Fora dessa área não há nada disto.** Não é descuido: em Portugal não existe
 * uma fonte aberta única com os horários de todos os operadores. O Porto, o
 * Algarve e o resto do país teriam de entrar um a um, cada um com o seu serviço,
 * e alguns nem serviço têm. A aplicação diz isso à pessoa em vez de mostrar uma
 * lista vazia.
 *
 * Isto é separado do mapa dos transportes (a ÖPNVKarte): esse desenha por onde
 * as linhas passam em qualquer sítio do mundo, este diz a que horas passam aqui.
 *
 * ## Cuidados
 *
 * Não foi possível experimentar contra o serviço real — o ambiente de
 * desenvolvimento não lhe chega, como acontece com a Overpass e o OSRM. Por isso
 * todo o tratamento das respostas é defensivo: campos em falta não podem
 * rebentar nada.
 */

const schedule = createRateLimiter(CARRIS_MIN_INTERVAL_MS);

const client = axios.create({
  baseURL: CARRIS_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
});

/** Uma paragem pronta a mostrar no ecrã. */
export interface TransitStop {
  id: string;
  name: string;
  /** Onde fica, para distinguir duas paragens com o mesmo nome. */
  locality: string;
  coordinates: Coordinates;
  /** Que linhas param aqui, para se ver sem ter de abrir. */
  lines: string[];
  /** A que distância está de quem está a ver, em metros. */
  meters: number;
}

/** Uma passagem prevista, pronta a mostrar. */
export interface TransitArrival {
  /** O número da linha, como vem pintado no autocarro. */
  line: string;
  /** Para onde vai. */
  destination: string;
  /** Quantos minutos faltam. Zero quer dizer "está a chegar". */
  minutes: number;
  /** A hora a que passa, em `HH:MM`. */
  time: string;
  /** Verdadeiro quando é tempo real; falso quando é só o horário. */
  live: boolean;
}

/**
 * Todas as paragens da rede, guardadas depois do primeiro pedido.
 *
 * São milhares e não mudam de sítio, por isso pedem-se uma vez por sessão. É a
 * única forma de saber quais estão perto: o serviço não tem procura por
 * proximidade.
 */
let cachedStops: TransitStop[] | null = null;

/** Impede dois pedidos ao mesmo tempo enquanto a lista está a ser carregada. */
let loading: Promise<TransitStop[]> | null = null;

function toNumber(value: string | number | undefined): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

async function loadStops(): Promise<TransitStop[]> {
  if (cachedStops) {
    return cachedStops;
  }
  if (loading) {
    return loading;
  }

  loading = schedule(async () => {
    const { data } = await client.get<CarrisStop[]>('/stops');
    const stops: TransitStop[] = [];

    for (const stop of Array.isArray(data) ? data : []) {
      const latitude = toNumber(stop.lat);
      const longitude = toNumber(stop.lon);
      if (latitude === null || longitude === null || !stop.id) {
        continue;
      }

      stops.push({
        id: stop.id,
        // `long_name` e não `name`: ver a nota nos tipos. Com o nome errado, a
        // lista aparecia toda com "Paragem" e nada mais.
        name: stop.long_name ?? stop.short_name ?? `Paragem ${stop.id}`,
        locality: stop.locality_name ?? stop.municipality_name ?? '',
        coordinates: { latitude, longitude },
        lines: Array.isArray(stop.line_ids) ? stop.line_ids : [],
        meters: 0,
      });
    }

    cachedStops = stops;
    return stops;
  })
    .catch((error) => {
      // Uma falha não pode deixar a promessa presa: o próximo pedido tem de
      // poder tentar de novo.
      loading = null;
      throw error;
    })
    .finally(() => {
      loading = null;
    });

  return loading;
}

/** Distância a partir da qual se assume que se está fora da área servida. */
const FORA_DA_AREA_METROS = 20000;

/**
 * As paragens mais próximas de um ponto.
 *
 * Devolve `null` quando o ponto está claramente fora da Área Metropolitana de
 * Lisboa — mostrar a paragem mais próxima a sessenta quilómetros não ajudava
 * ninguém e dava a ideia errada de que a aplicação cobre o país todo.
 */
export async function nearbyStops(
  origin: Coordinates,
  limit = 6,
): Promise<TransitStop[] | null> {
  const todas = await loadStops();

  // Uma passagem só, guardando as melhores à medida que se anda. A alternativa
  // — copiar as milhares de paragens, ordenar tudo e ficar com seis — fazia
  // milhares de cópias de objetos de cada vez, e isto corre sempre que a
  // posição muda.
  const perto: TransitStop[] = [];
  let pior = Infinity;

  for (const stop of todas) {
    const meters = distanceMeters(origin, stop.coordinates);
    if (perto.length === limit && meters >= pior) {
      continue;
    }

    const entrada = { ...stop, meters };
    const onde = perto.findIndex((p) => p.meters > meters);
    perto.splice(onde === -1 ? perto.length : onde, 0, entrada);
    if (perto.length > limit) {
      perto.pop();
    }
    pior = perto[perto.length - 1].meters;
  }

  if (perto.length === 0 || perto[0].meters > FORA_DA_AREA_METROS) {
    return null;
  }

  return perto;
}

/** `HH:MM` a partir de segundos desde 1970, no fuso do telemóvel. */
function clockOf(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export async function arrivalsAt(stopId: string, limit = 8): Promise<TransitArrival[]> {
  const { data } = await schedule(() =>
    client.get<CarrisArrival[]>(`/arrivals/by_stop/${encodeURIComponent(stopId)}`),
  );

  const agora = Date.now() / 1000;
  const proximas: TransitArrival[] = [];

  for (const arrival of Array.isArray(data) ? data : []) {
    // Se já foi visto a passar, acabou — não interessa mais.
    if (arrival.observed_arrival) {
      continue;
    }

    // Prefere-se sempre a hora prevista: é a que já leva o atraso real.
    const previsto = arrival.estimated_arrival_unix;
    const live = typeof previsto === 'number' && previsto > 0;
    const quando = live ? previsto : arrival.scheduled_arrival_unix;

    if (typeof quando !== 'number' || quando <= 0) {
      continue;
    }

    const faltam = Math.round((quando - agora) / 60);

    // Um minuto de folga para trás: o autocarro que devia ter passado agora
    // mesmo continua a interessar a quem está na paragem. E nada para lá de
    // duas horas, que já não é esperar — é consultar o horário.
    if (faltam < -1 || faltam > 120) {
      continue;
    }

    proximas.push({
      line: arrival.line_id ?? arrival.route_id ?? '—',
      destination: arrival.headsign ?? '',
      minutes: Math.max(0, faltam),
      time: clockOf(quando),
      live,
    });
  }

  return proximas.sort((a, b) => a.minutes - b.minutes).slice(0, limit);
}
