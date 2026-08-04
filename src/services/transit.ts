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
        name: stop.name ?? stop.short_name ?? 'Paragem',
        locality: stop.locality ?? stop.municipality_name ?? '',
        coordinates: { latitude, longitude },
        lines: Array.isArray(stop.lines) ? stop.lines : [],
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

  const perto = todas
    .map((stop) => ({ ...stop, meters: distanceMeters(origin, stop.coordinates) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit);

  if (perto.length === 0 || perto[0].meters > FORA_DA_AREA_METROS) {
    return null;
  }

  return perto;
}

/**
 * Converte uma hora do GTFS em minutos desde a meia-noite.
 *
 * As horas podem passar das 24 (`25:10:00` é a uma e dez da manhã seguinte),
 * por isso não se pode usar a data diretamente.
 */
function minutesOfDay(time: string | undefined): number | null {
  if (!time) {
    return null;
  }
  const [h, m] = time.split(':');
  const hours = Number(h);
  const mins = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) {
    return null;
  }
  return hours * 60 + mins;
}

/** `HH:MM` a partir de minutos desde a meia-noite, já com a volta às 24 horas. */
function clockOf(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * As próximas passagens numa paragem.
 *
 * O serviço devolve o dia inteiro, incluindo o que já passou — daí a filtragem
 * aqui. Prefere-se sempre a hora prevista à do horário: é a que já leva o atraso
 * real do autocarro.
 */
export async function arrivalsAt(stopId: string, limit = 8): Promise<TransitArrival[]> {
  const { data } = await schedule(() =>
    client.get<CarrisArrival[]>(`/arrivals/by_stop/${encodeURIComponent(stopId)}`),
  );

  const agora = new Date();
  const agoraMin = agora.getHours() * 60 + agora.getMinutes();

  const proximas: TransitArrival[] = [];

  for (const arrival of Array.isArray(data) ? data : []) {
    // Se já foi visto a passar, acabou — não interessa mais.
    if (arrival.observed_arrival) {
      continue;
    }

    const live = Boolean(arrival.estimated_arrival);
    const quando = minutesOfDay(arrival.estimated_arrival ?? arrival.scheduled_arrival);
    if (quando === null) {
      continue;
    }

    // Passagens depois da meia-noite vêm como 24 ou mais. Trazê-las para o
    // relógio normal antes de comparar.
    let faltam = quando - agoraMin;
    if (faltam < -720) {
      // Já passou para o dia seguinte: 25:10 contra as 00:30 de agora.
      faltam += 1440;
    }

    // Um minuto de folga para trás: o autocarro que devia ter passado agora
    // mesmo continua a interessar a quem está na paragem.
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
