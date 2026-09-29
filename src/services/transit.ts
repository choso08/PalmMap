import axios from 'axios';

import {
  CARRIS_BASE_URL,
  CARRIS_MIN_INTERVAL_MS,
  CARRIS_STOPS_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  TRANSIT_WALK_MAX_M,
  USER_AGENT,
  WALK_DETOUR,
  WALK_SPEED_MS,
} from './config';
import { createRateLimiter } from './rateLimit';
import { t } from '../i18n';
import type { Coordinates } from '../types/geo';
import type { CarrisArrival, CarrisFacility, CarrisStop } from '../types/transit';
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

/** Falha ao falar com o serviço dos autocarros, já com a razão por escrito. */
export class TransitError extends Error {}

/**
 * Um pedido ao serviço dos autocarros, com o erro a dizer o que falhou mesmo.
 *
 * **Isto não é enfeite.** A mensagem era sempre a mesma — "verifique a ligação"
 * — e dizia o contrário do que se passava a quem tinha rede e mapa a carregar
 * normalmente. Pior: não havia como distinguir o serviço em baixo, o endereço
 * mudado, o pedido a demorar demais ou a rede mesmo em baixo, e sem telemóvel à
 * mão não há outra forma de o saber. Um número de resposta no ecrã resolve numa
 * fotografia o que de outra maneira são várias rondas de adivinhação.
 */
async function carrisGet<T>(path: string, timeout?: number): Promise<T> {
  try {
    const { data } = await schedule(() => client.get<T>(path, { timeout }));
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        throw new TransitError(t().errors.transitStatus(error.response.status));
      }
      if (error.code === 'ECONNABORTED') {
        throw new TransitError(t().errors.transitTimeout);
      }
      throw new TransitError(t().errors.transitOffline);
    }
    throw new TransitError(t().errors.schedulesFailed);
  }
}

/** Uma paragem pronta a mostrar no ecrã. */
export interface TransitStop {
  id: string;
  name: string;
  /** Onde fica, para distinguir duas paragens com o mesmo nome. */
  locality: string;
  coordinates: Coordinates;
  /** Que linhas param aqui, para se ver sem ter de abrir. */
  lines: string[];
  /** Ligações a outros meios: `train`, `subway`, `light_rail`, `boat`. */
  connections: string[];
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

  loading = (async () => {
    const data = await carrisGet<CarrisStop[]>('/stops', CARRIS_STOPS_TIMEOUT_MS);
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
        connections: Array.isArray(stop.facilities) ? stop.facilities : [],
        meters: 0,
      });
    }

    cachedStops = stops;
    return stops;
  })()
    .catch((error: unknown) => {
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

/**
 * As passagens de uma paragem, tal como o serviço as devolve.
 *
 * Fica em memória por pouco tempo: o planeamento de um trajeto pergunta pelas
 * mesmas paragens que o painel das horas acabou de perguntar, e não vale a pena
 * repetir o pedido. Curto de propósito — isto são horas em tempo real.
 */
const arrivalsCache = new Map<string, { quando: number; dados: CarrisArrival[] }>();
const ARRIVALS_CACHE_MS = 20000;

async function rawArrivalsAt(stopId: string): Promise<CarrisArrival[]> {
  const guardado = arrivalsCache.get(stopId);
  if (guardado && Date.now() - guardado.quando < ARRIVALS_CACHE_MS) {
    return guardado.dados;
  }

  const data = await carrisGet<CarrisArrival[]>(
    `/arrivals/by_stop/${encodeURIComponent(stopId)}`,
  );

  const dados = Array.isArray(data) ? data : [];
  arrivalsCache.set(stopId, { quando: Date.now(), dados });
  return dados;
}

/** A hora a que esta passagem acontece mesmo, e se é tempo real. */
function quandoPassa(arrival: CarrisArrival): { unix: number; live: boolean } | null {
  const previsto = arrival.estimated_arrival_unix;
  const live = typeof previsto === 'number' && previsto > 0;
  const quando = live ? previsto : arrival.scheduled_arrival_unix;

  if (typeof quando !== 'number' || quando <= 0) {
    return null;
  }
  return { unix: quando, live };
}

export async function arrivalsAt(stopId: string, limit = 8): Promise<TransitArrival[]> {
  const data = await rawArrivalsAt(stopId);

  const agora = Date.now() / 1000;
  const proximas: TransitArrival[] = [];

  for (const arrival of data) {
    // Se já foi visto a passar, acabou — não interessa mais.
    if (arrival.observed_arrival) {
      continue;
    }

    // Prefere-se sempre a hora prevista: é a que já leva o atraso real.
    const passa = quandoPassa(arrival);
    if (!passa) {
      continue;
    }
    const { unix: quando, live } = passa;

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

/**
 * Um trajeto de transportes, de onde se está até onde se quer ir.
 *
 * É sempre **uma linha só, sem transbordos** — ver `planBusTrips`.
 *
 * Serve para os dois lados: os autocarros, que saem daqui com tempo real, e os
 * comboios, o metro e os barcos, que saem do `schedules.ts` a partir do horário
 * guardado. O ecrã mostra os dois na mesma lista, e é o `kind` e o `live` que os
 * distinguem — a hora de um autocarro é a hora a que ele passa mesmo, a de um
 * comboio é a hora a que devia passar.
 */
export interface TransitTrip {
  /** Identifica a viagem. Serve de chave na lista. */
  tripId: string;
  /** Que meio de transporte: `bus`, `train`, `subway`, `light_rail`, `boat`. */
  kind: string;
  /** O número da linha, como vem pintado no autocarro. */
  line: string;
  /** Para onde o autocarro vai, como está no letreiro. */
  headsign: string;
  /** Onde se entra e onde se sai. */
  from: TransitStop;
  to: TransitStop;
  /** Horas, em segundos desde 1970. */
  departsAt: number;
  arrivesAt: number;
  /** A que horas é preciso sair de onde se está, para apanhar este. */
  leaveAt: number;
  /** A que horas se chega mesmo ao destino, já com o passeio final. */
  reachAt: number;
  /** Quantas paragens se anda dentro do autocarro. */
  stops: number;
  /** Verdadeiro quando as horas são de tempo real, e não do horário. */
  live: boolean;
}

/** As paragens a menos de uma certa distância, da mais perto para a mais longe. */
async function stopsWithin(
  origin: Coordinates,
  maxMeters: number,
  limit: number,
): Promise<TransitStop[]> {
  const perto = (await nearbyStops(origin, limit)) ?? [];
  return perto.filter((stop) => stop.meters <= maxMeters);
}

/** Quantos segundos leva a andar esta distância, com a volta dos quarteirões. */
function walkSeconds(meters: number): number {
  return (meters * WALK_DETOUR) / WALK_SPEED_MS;
}

/**
 * A que viagem pertence cada passagem de uma paragem.
 *
 * ## Porque é que isto existe
 *
 * **O `trip_id` deixou de vir nas passagens sem tempo real.** Até ao verão de
 * 2026 cada passagem trazia sempre o `trip_id` do horário. A 11 de agosto a
 * Carris reescreveu o `/arrivals/by_stop` para ir buscar os dados à TML, e desde
 * aí ele sai do tempo real (`eta?.trip_id ?? null`, no
 * `arrivals.endpoint.ts` deles, lido e não assumido): vem `null` em todas as
 * passagens que ainda não têm autocarro atribuído — ou seja, quase todas. O
 * planeamento ligava as duas pontas pelo `trip_id` e ficou sem trajetos
 * nenhuns, **sem dar erro nenhum**.
 *
 * ## O que identifica a viagem agora
 *
 * **A ordem dentro do padrão.** Um padrão (`pattern_id`) é o percurso exato de
 * uma linha num sentido: sempre as mesmas paragens, pela mesma ordem. Num padrão
 * os autocarros não se ultrapassam — fazem o mesmo caminho e param nos mesmos
 * sítios. E o serviço devolve **o dia inteiro** de cada padrão, também as horas
 * que já passaram. Juntando as duas coisas: o quinto autocarro do dia do padrão
 * P nesta paragem é o quinto autocarro do padrão P na paragem seguinte. A chave
 * é `padrão#ordem`.
 *
 * O grupo é padrão **e** `stop_sequence`, e não só padrão: uma linha circular
 * passa duas vezes na mesma paragem, e as duas passagens de cada viagem não são
 * a mesma coisa.
 *
 * **Por isto é que não se filtra nada antes de ordenar** — nem as que já
 * passaram, nem as sem hora. Uma passagem a menos numa das pontas desencontrava
 * a ordem de todas as seguintes. Quem filtra é quem usa isto, depois.
 */
function tripKeys(passagens: CarrisArrival[]): Map<CarrisArrival, string> {
  const grupos = new Map<string, CarrisArrival[]>();
  for (const arrival of passagens) {
    if (!arrival.pattern_id || typeof arrival.scheduled_arrival_unix !== 'number') {
      continue;
    }
    const grupo = `${arrival.pattern_id}|${arrival.stop_sequence ?? 0}`;
    const lista = grupos.get(grupo);
    if (lista) {
      lista.push(arrival);
    } else {
      grupos.set(grupo, [arrival]);
    }
  }

  const chaves = new Map<CarrisArrival, string>();
  for (const lista of grupos.values()) {
    // Pela hora do horário, e não pela prevista: a prevista mexe com o trânsito,
    // o horário é o que diz a ordem em que as viagens foram planeadas.
    lista.sort(
      (a, b) => (a.scheduled_arrival_unix as number) - (b.scheduled_arrival_unix as number),
    );
    lista.forEach((arrival, ordem) => {
      chaves.set(arrival, `${arrival.pattern_id}#${ordem}`);
    });
  }
  return chaves;
}

/**
 * Quantas viagens de cada padrão passam nesta paragem hoje.
 *
 * Serve de verificação à chave `padrão#ordem`: a ordem só identifica a viagem se
 * as duas pontas tiverem **as mesmas viagens** do padrão. Têm sempre — um padrão
 * serve todas as suas paragens — mas se um dia o serviço cortar a lista numa
 * delas, a ordem desencontrava-se em silêncio. Com números diferentes não se
 * emparelha nada desse padrão.
 */
function tripsPerPattern(passagens: CarrisArrival[]): Map<string, number> {
  const porGrupo = new Map<string, number>();
  for (const arrival of passagens) {
    if (!arrival.pattern_id || typeof arrival.scheduled_arrival_unix !== 'number') {
      continue;
    }
    const grupo = `${arrival.pattern_id}|${arrival.stop_sequence ?? 0}`;
    porGrupo.set(grupo, (porGrupo.get(grupo) ?? 0) + 1);
  }
  // O número de viagens do padrão é o de qualquer dos seus grupos; se dois
  // grupos do mesmo padrão não baterem, o padrão fica marcado como incerto.
  const porPadrao = new Map<string, number>();
  for (const [grupo, n] of porGrupo) {
    const padrao = grupo.slice(0, grupo.lastIndexOf('|'));
    const antes = porPadrao.get(padrao);
    porPadrao.set(padrao, antes === undefined || antes === n ? n : -1);
  }
  return porPadrao;
}

/**
 * Monta trajetos de autocarro entre dois pontos.
 *
 * ## Como é que isto funciona
 *
 * Não há nenhum serviço aberto que responda "como vou de A para B de
 * transportes" em Portugal. O que há é a lista de passagens de cada paragem — e
 * é a partir daí que isto se monta:
 *
 * 1. Procuram-se as paragens a pé de distância da origem e do destino.
 * 2. Pedem-se as passagens de cada uma.
 * 3. **Se a mesma viagem aparece numa paragem de partida e numa de chegada, é
 *    o mesmo autocarro.** As duas horas são a partida e a chegada reais, e a
 *    ordem entre elas confirma o sentido da marcha — não é preciso adivinhar
 *    nem ir buscar o desenho da linha. A viagem reconhece-se pela ordem dentro
 *    do padrão, e não pelo `trip_id` — ver `tripKeys`, que explica porquê.
 * 4. Junta-se o tempo a pé de cada ponta e ordena-se por hora de chegada.
 *
 * ## O que isto não faz, e é preciso dizer
 *
 * - **Só autocarros da Carris Metropolitana**, e só na Área Metropolitana de
 *   Lisboa. Comboios, metro e barcos não entram: cada um é outro operador, com
 *   outro serviço, e alguns nem serviço aberto têm.
 * - **Sem transbordos.** Só linhas que fazem o caminho todo de uma vez. Um
 *   trajeto com mudança de autocarro é um problema bastante maior, e mal feito é
 *   pior do que não existir.
 * - **O tempo a pé é estimado**, não é calculado no mapa: distância em linha
 *   reta, com um terço a mais pelos quarteirões. Serve para ordenar as opções.
 *
 * Devolve `null` quando não há paragens à mão de nenhuma das pontas — que é
 * diferente de não haver autocarro nenhum que sirva.
 */
export async function planBusTrips(
  origin: Coordinates,
  destination: Coordinates,
  limit = 5,
): Promise<TransitTrip[] | null> {
  const [saidas, chegadas] = await Promise.all([
    stopsWithin(origin, TRANSIT_WALK_MAX_M, 3),
    stopsWithin(destination, TRANSIT_WALK_MAX_M, 3),
  ]);

  if (saidas.length === 0 || chegadas.length === 0) {
    return null;
  }

  // As paragens de chegada primeiro: é contra elas que se procuram as viagens.
  const porViagem = new Map<
    string,
    { stop: TransitStop; unix: number; seq: number; tripId: string | null; padrao: number }
  >();

  // **Uma paragem que falhe não deita o planeamento abaixo.** São meia dúzia de
  // pedidos, e o serviço recusa um de vez em quando; com um `Promise.all` puro,
  // essa recusa isolada apagava as opções todas — incluindo as que já tinham
  // vindo bem. Só se desiste se falharem todas, e aí diz-se porquê.
  let falha: unknown = null;
  let falhadas = 0;

  await Promise.all(
    chegadas.map(async (stop) => {
      let passagens: CarrisArrival[];
      try {
        passagens = await rawArrivalsAt(stop.id);
      } catch (error) {
        falha = falha ?? error;
        falhadas += 1;
        return;
      }

      const chaves = tripKeys(passagens);
      const viagensDoPadrao = tripsPerPattern(passagens);

      for (const arrival of passagens) {
        const passa = quandoPassa(arrival);
        const chave = chaves.get(arrival);
        if (!chave || !passa) {
          continue;
        }

        // Entre duas paragens de chegada servidas pela mesma viagem, fica a que
        // deixa mais perto do destino.
        const atual = porViagem.get(chave);
        if (!atual || stop.meters < atual.stop.meters) {
          porViagem.set(chave, {
            stop,
            unix: passa.unix,
            seq: arrival.stop_sequence ?? 0,
            tripId: arrival.trip_id ?? null,
            padrao: viagensDoPadrao.get(arrival.pattern_id as string) ?? -1,
          });
        }
      }
    }),
  );

  if (falhadas === chegadas.length && falha) {
    throw falha;
  }

  const agora = Date.now() / 1000;
  const trajetos: TransitTrip[] = [];

  await Promise.all(
    saidas.map(async (stop) => {
      const aPe = walkSeconds(stop.meters);

      const passagens = await rawArrivalsAt(stop.id);
      // A ordem calcula-se sobre a lista inteira, **antes** de filtrar — ver
      // `tripKeys`. Só a seguir se põem de lado as que já passaram.
      const chaves = tripKeys(passagens);
      const viagensDoPadrao = tripsPerPattern(passagens);

      for (const arrival of passagens) {
        if (arrival.observed_arrival) {
          continue;
        }

        const saida = quandoPassa(arrival);
        const chave = chaves.get(arrival);
        const chegada = chave ? porViagem.get(chave) : undefined;
        if (!saida || !chave || !chegada) {
          continue;
        }

        // As duas verificações de que a ordem identifica mesmo a mesma viagem.
        // **As duas pontas têm de ter o mesmo número de viagens do padrão** — com
        // uma a menos numa delas, a ordem desencontrava-se e o autocarro das
        // 8h10 passava a chegar às 8h45 do seguinte. E **quando as duas trazem
        // `trip_id`**, que é quando há tempo real, têm de dizer o mesmo. Se
        // alguma coisa não bater, não se emparelha: antes trajeto nenhum do que
        // um que manda a pessoa para a paragem à hora errada.
        const padrao = viagensDoPadrao.get(arrival.pattern_id as string) ?? -1;
        if (padrao < 0 || padrao !== chegada.padrao) {
          continue;
        }
        if (arrival.trip_id && chegada.tripId && arrival.trip_id !== chegada.tripId) {
          continue;
        }

        // A chegada tem de ser depois da partida. É isto que impede um trajeto
        // no sentido contrário — a mesma viagem passa nas duas paragens, mas
        // pela ordem errada para quem quer ir neste sentido.
        const seq = arrival.stop_sequence ?? 0;
        if (chegada.unix <= saida.unix || chegada.seq <= seq) {
          continue;
        }

        const leaveAt = saida.unix - aPe;
        // Um minuto de folga: quem está mesmo à porta da paragem ainda apanha o
        // autocarro que sai daqui a nada.
        if (leaveAt < agora - 60) {
          continue;
        }

        trajetos.push({
          tripId: chave,
          kind: 'bus',
          line: arrival.line_id ?? arrival.route_id ?? '—',
          headsign: arrival.headsign ?? '',
          from: stop,
          to: chegada.stop,
          departsAt: saida.unix,
          arrivesAt: chegada.unix,
          leaveAt,
          reachAt: chegada.unix + walkSeconds(chegada.stop.meters),
          stops: Math.max(1, chegada.seq - seq),
          live: saida.live,
        });
      }
    }),
  );

  // Chega mais cedo primeiro. Uma linha só aparece uma vez: as três passagens
  // seguintes do mesmo autocarro não são três opções, são a mesma opção.
  const porLinha = new Map<string, TransitTrip>();
  for (const t of trajetos.sort((a, b) => a.reachAt - b.reachAt)) {
    if (!porLinha.has(t.line)) {
      porLinha.set(t.line, t);
    }
  }

  return [...porLinha.values()].slice(0, limit);
}

/**
 * Que género de estação é.
 *
 * `light_rail` é o metro de superfície — na margem sul, o Metro Sul do Tejo.
 */
export type StationKind = 'train' | 'subway' | 'light_rail' | 'boat';

/** Uma estação pronta a mostrar no mapa. */
export interface TransitStation {
  id: string;
  kind: StationKind;
  name: string;
  locality: string;
  coordinates: Coordinates;
  /** As paragens de autocarro que servem esta estação. */
  stopIds: string[];
  /** A que distância está de quem está a ver, em metros. */
  meters: number;
}

/** O endereço de cada género, na mesma API dos autocarros. */
const STATION_ENDPOINTS: Record<StationKind, string> = {
  train: '/facilities/train_stations',
  subway: '/facilities/subway_stations',
  light_rail: '/facilities/light_rail_stations',
  boat: '/facilities/boat_stations',
};

/**
 * Como se chama cada género, na língua atual.
 *
 * É uma função e não uma constante de propósito: uma constante era avaliada uma
 * vez, no arranque, e ficava presa à língua desse momento — trocar de língua
 * deixava as estações a dizer "Comboio" no meio de um ecrã inglês.
 */
export function stationLabel(kind: StationKind): string {
  return t().transit.kinds[kind];
}

/** O ícone de cada género. Confirmados na lista do MaterialCommunityIcons. */
export const STATION_ICONS: Record<StationKind, string> = {
  train: 'train',
  subway: 'subway-variant',
  light_rail: 'tram',
  boat: 'ferry',
};

/**
 * As estações de comboio, metro, metro de superfície e barco.
 *
 * São quatro listas curtas e que não mudam de sítio, por isso pedem-se uma vez
 * por sessão e ficam em memória, tal como as paragens.
 *
 * **Isto são só as localizações.** Destes operadores não há horários abertos
 * numa API — o Fertagus e a CP publicam GTFS estático, que é outro caminho, e o
 * Metro Sul do Tejo não publica nada. Ver o CLAUDE.md.
 */
let cachedStations: TransitStation[] | null = null;
let loadingStations: Promise<TransitStation[]> | null = null;

async function loadStations(): Promise<TransitStation[]> {
  if (cachedStations) {
    return cachedStations;
  }
  if (loadingStations) {
    return loadingStations;
  }

  loadingStations = (async () => {
    const listas = await Promise.all(
      (Object.keys(STATION_ENDPOINTS) as StationKind[]).map(async (kind) => {
        try {
          const data = await carrisGet<CarrisFacility[]>(
            STATION_ENDPOINTS[kind],
            CARRIS_STOPS_TIMEOUT_MS,
          );

          const estacoes: TransitStation[] = [];
          for (const facility of Array.isArray(data) ? data : []) {
            const latitude = toNumber(facility.lat);
            const longitude = toNumber(facility.lon);
            if (latitude === null || longitude === null || !facility.id) {
              continue;
            }

            estacoes.push({
              id: `${kind}:${facility.id}`,
              kind,
              name: facility.name ?? stationLabel(kind),
              locality: facility.locality ?? facility.municipality_name ?? '',
              coordinates: { latitude, longitude },
              stopIds: Array.isArray(facility.stop_ids) ? facility.stop_ids : [],
              meters: 0,
            });
          }
          return estacoes;
        } catch {
          // Um género que falhe não pode levar os outros atrás: é melhor mostrar
          // só os comboios do que não mostrar estação nenhuma.
          return [];
        }
      }),
    );

    cachedStations = listas.flat();
    return cachedStations;
  })().finally(() => {
    loadingStations = null;
  });

  return loadingStations;
}

/** As estações a menos de uma certa distância, da mais perto para a mais longe. */
export async function nearbyStations(
  origin: Coordinates,
  maxMeters = 1500,
  limit = 8,
): Promise<TransitStation[]> {
  const todas = await loadStations();

  return todas
    .map((estacao) => ({
      ...estacao,
      meters: distanceMeters(origin, estacao.coordinates),
    }))
    .filter((estacao) => estacao.meters <= maxMeters)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit);
}
