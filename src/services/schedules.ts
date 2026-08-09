import axios from 'axios';
import { Directory, File, Paths } from 'expo-file-system';

import {
  REQUEST_TIMEOUT_MS,
  TRANSIT_WALK_MAX_M,
  USER_AGENT,
  WALK_DETOUR,
  WALK_SPEED_MS,
} from './config';
import type { TransitStop, TransitTrip } from './transit';
import type { Coordinates } from '../types/geo';
import type { ScheduleFeed, ScheduleFeedInfo } from '../types/schedule';

export type { ScheduleFeedInfo };
import { distanceMeters } from '../utils/geometry';

/**
 * Horários de comboio, metro e barco, guardados no telemóvel.
 *
 * ## Porque é que isto é diferente dos autocarros
 *
 * Os autocarros da Carris Metropolitana têm uma API aberta com **tempo real**: o
 * `transit.ts` pergunta-lhe as horas e recebe a hora a que o autocarro passa
 * mesmo, com o atraso já contado. Melhor do que isso não há.
 *
 * O comboio, o metro e o barco não têm nada assim. O que têm é **GTFS estático**
 * — um ZIP com o horário todo, publicado de vez em quando. Não se pode usar
 * diretamente: o da CP tem centenas de milhares de linhas e o telemóvel teria de
 * o ler inteiro para responder a uma pergunta simples.
 *
 * Por isso a conversão é feita no GitHub Actions
 * (`.github/workflows/build-transit.yml`), o resultado vai para uma Release, e
 * aqui só se descarrega um ficheiro pequeno e se lhe fazem perguntas. É o mesmo
 * caminho dos mapas offline, pela mesma razão.
 *
 * ## O que isto é, e o que não é
 *
 * **É o horário, não é o tempo real.** Diz a que horas o comboio devia passar.
 * Se estiver atrasado, isto não sabe. A aplicação marca a diferença: os
 * autocarros levam ponto verde, os comboios não. Não prometer o que não se tem.
 *
 * **Tem validade.** Cada ficheiro cobre uma janela de dias a partir de quando
 * foi gerado. Passada essa data deixa de responder, e diz porquê em vez de
 * mostrar uma lista vazia.
 *
 * **Funciona sem rede**, que é meia razão para existir: o ficheiro está no
 * telemóvel.
 */

const BASE_URL = 'https://github.com/choso08/PalmMap/releases/download/horarios';

/** Onde ficam os horários descarregados. */
const FOLDER = new Directory(Paths.document, 'horarios');

/** Erro com mensagem legível, para o ecrã poder mostrar algo de útil. */
export class ScheduleError extends Error {}

// --- Descarregar e guardar ----------------------------------------------------

function ensureFolder(): void {
  if (!FOLDER.exists) {
    FOLDER.create({ intermediates: true });
  }
}

function dataFile(info: ScheduleFeedInfo): File {
  return new File(FOLDER, info.ficheiro);
}

/**
 * O ficheiro de identificação.
 *
 * Tem de ser `.info.json` e não `.json` como nos mapas: aqui o ficheiro de dados
 * já é um `.json`, e os dois davam-se ao mesmo nome.
 */
function infoFile(id: string): File {
  return new File(FOLDER, `${id}.info.json`);
}

export function isInstalled(info: ScheduleFeedInfo): boolean {
  return dataFile(info).exists;
}

/** Os horários que estão mesmo no telemóvel. Lê a pasta, para funcionar sem rede. */
export function installedFeeds(): ScheduleFeedInfo[] {
  if (!FOLDER.exists) {
    return [];
  }

  const feeds: ScheduleFeedInfo[] = [];
  for (const entrada of FOLDER.list()) {
    if (!(entrada instanceof File) || !entrada.uri.endsWith('.info.json')) {
      continue;
    }
    try {
      const info = JSON.parse(entrada.textSync()) as ScheduleFeedInfo;
      if (new File(FOLDER, info.ficheiro).exists) {
        feeds.push(info);
      }
    } catch {
      // Identificação estragada: ignora-se esse operador em vez de deixar a
      // aplicação sem horário nenhum.
    }
  }
  return feeds;
}

/** A lista do que há para descarregar. */
export async function listFeeds(): Promise<ScheduleFeedInfo[]> {
  try {
    const response = await axios.get<{ horarios: ScheduleFeedInfo[] }>(
      `${BASE_URL}/horarios.json`,
      { timeout: REQUEST_TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT } },
    );

    // O `naApp: false` tira da lista o que não faz sentido descarregar — hoje só
    // a Carris Metropolitana, que tem tempo real por API e não precisa de um
    // horário de papel. **Não se filtra por `kind`**: um autocarro de Braga não
    // tem tempo real nenhum, e para esse o horário é tudo o que há.
    return (response.data.horarios ?? []).filter((f) => f.naApp !== false);
  } catch {
    const guardados = installedFeeds();
    if (guardados.length > 0) {
      return guardados;
    }
    throw new ScheduleError(
      'Não foi possível obter a lista de horários. Verifique a ligação à Internet.',
    );
  }
}

/** Descarrega o horário de um operador. */
export async function downloadFeed(info: ScheduleFeedInfo): Promise<void> {
  ensureFolder();

  const parcial = new File(FOLDER, `${info.ficheiro}.parcial`);
  if (parcial.exists) {
    parcial.delete();
  }

  try {
    const descarregado = await File.downloadFileAsync(
      `${BASE_URL}/${info.ficheiro}`,
      parcial,
    );

    const destino = dataFile(info);
    if (destino.exists) {
      destino.delete();
    }
    await descarregado.move(destino);
    infoFile(info.id).write(JSON.stringify(info));
    cache.delete(info.id);
  } catch (erro) {
    if (parcial.exists) {
      parcial.delete();
    }
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    throw new ScheduleError(
      `Não foi possível descarregar os horários de ${info.nome}. ${detalhe}`.trim(),
    );
  }
}

/** Apaga o horário guardado de um operador. */
export function removeFeed(info: ScheduleFeedInfo): void {
  for (const ficheiro of [dataFile(info), infoFile(info.id)]) {
    if (ficheiro.exists) {
      ficheiro.delete();
    }
  }
  cache.delete(info.id);
}

/** Quanto ocupam, ao todo, os horários guardados. */
export function usedBytes(): number {
  if (!FOLDER.exists) {
    return 0;
  }
  return FOLDER.list().reduce(
    (total, entrada) => (entrada instanceof File ? total + (entrada.size ?? 0) : total),
    0,
  );
}

// --- Ler e indexar -------------------------------------------------------------

/**
 * Um horário já lido e preparado para responder depressa.
 *
 * A preparação faz-se uma vez, ao abrir o ficheiro. Sem ela, cada pergunta
 * obrigava a percorrer as viagens todas — e há operadores com milhares.
 */
interface IndexedFeed {
  info: ScheduleFeedInfo;
  data: ScheduleFeed;
  /** As horas de cada viagem em minutos absolutos, com os deltas já somados. */
  minutos: number[][];
  /** Os dias de cada serviço, em conjunto, para não se procurar numa lista. */
  dias: Set<string>[];
  /** Em que viagens aparece cada estação, e em que posição do percurso. */
  porEstacao: Map<number, { trip: number; pos: number }[]>;
}

const cache = new Map<string, IndexedFeed>();

function index(info: ScheduleFeedInfo, data: ScheduleFeed): IndexedFeed {
  const minutos: number[][] = [];
  const porEstacao = new Map<number, { trip: number; pos: number }[]>();

  data.trips.forEach((trip, i) => {
    const padrao = data.patterns[trip.p] ?? [];

    // Os deltas voltam a ser horas absolutas. É a conta inversa da que o script
    // de conversão faz, e faz-se uma vez em vez de a cada pergunta.
    const horas: number[] = [];
    let acumulado = 0;
    for (const delta of trip.t) {
      acumulado += delta;
      horas.push(acumulado);
    }
    minutos.push(horas);

    padrao.forEach((estacao, pos) => {
      const lista = porEstacao.get(estacao);
      if (lista) {
        lista.push({ trip: i, pos });
      } else {
        porEstacao.set(estacao, [{ trip: i, pos }]);
      }
    });
  });

  return {
    info,
    data,
    minutos,
    dias: data.services.map((datas) => new Set(datas)),
    porEstacao,
  };
}

/**
 * Abre um horário guardado.
 *
 * Fica em memória depois da primeira vez: é um ficheiro de centenas de
 * kilobytes e lê-lo a cada pergunta seria bem pior do que o guardar.
 */
export function loadFeed(info: ScheduleFeedInfo): IndexedFeed | null {
  const guardado = cache.get(info.id);
  if (guardado) {
    return guardado;
  }

  const ficheiro = dataFile(info);
  if (!ficheiro.exists) {
    return null;
  }

  try {
    const data = JSON.parse(ficheiro.textSync()) as ScheduleFeed;
    if (!Array.isArray(data.trips) || !Array.isArray(data.stops)) {
      return null;
    }
    const preparado = index(info, data);
    cache.set(info.id, preparado);
    return preparado;
  } catch {
    // Ficheiro estragado: vale mais não ter horários deste operador do que
    // rebentar o painel inteiro.
    return null;
  }
}

/** Todos os horários guardados, já preparados. */
function loadedFeeds(): IndexedFeed[] {
  const abertos: IndexedFeed[] = [];
  for (const info of installedFeeds()) {
    const feed = loadFeed(info);
    if (feed) {
      abertos.push(feed);
    }
  }
  return abertos;
}

// --- Contas com datas -----------------------------------------------------------

/** Uma data em AAAAMMDD, no fuso do telemóvel. */
function ymd(d: Date): string {
  return (
    `${d.getFullYear()}` +
    `${String(d.getMonth() + 1).padStart(2, '0')}` +
    `${String(d.getDate()).padStart(2, '0')}`
  );
}

/**
 * A que horas acontece, em segundos desde 1970, uma passagem de um dia de
 * serviço.
 *
 * Os minutos podem passar dos 1440 — `1505` é a uma e cinco da manhã seguinte,
 * ainda a contar como serviço do dia anterior. O `Date` normaliza isso sozinho,
 * **e é de propósito que se lhe entregam os minutos em vez de se somar segundos
 * à meia-noite**: assim o dia em que os relógios mudam continua certo.
 */
function unixAt(dia: string, minutos: number): number {
  const ano = Number(dia.slice(0, 4));
  const mes = Number(dia.slice(4, 6)) - 1;
  const diaDoMes = Number(dia.slice(6, 8));
  return new Date(ano, mes, diaDoMes, 0, minutos, 0, 0).getTime() / 1000;
}

/**
 * Os dias de serviço a considerar para uma dada altura.
 *
 * São três: ontem, hoje e amanhã. **Ontem entra por causa das viagens que passam
 * da meia-noite** — às 00:30 o comboio que se quer apanhar ainda é serviço de
 * ontem. E amanhã entra pela razão simétrica: às 23:50 já interessa o que sai
 * logo a seguir.
 */
function candidateDays(agora: Date): string[] {
  const dias: string[] = [];
  for (let offset = -1; offset <= 1; offset += 1) {
    dias.push(ymd(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + offset)));
  }
  return dias;
}

/** Se o horário deste operador ainda é válido nesta data. */
export function isExpired(info: ScheduleFeedInfo, agora = new Date()): boolean {
  return typeof info.fim === 'string' && info.fim.length === 8 && ymd(agora) > info.fim;
}

// --- Perguntas -------------------------------------------------------------------

/** Uma passagem prevista numa estação. */
export interface ScheduleDeparture {
  /** Identifica esta passagem na lista. */
  key: string;
  /** Que operador. */
  operator: string;
  /** Comboio, metro, metro de superfície ou barco. */
  kind: string;
  /** Em que estação. */
  station: string;
  /** O nome da linha, como o operador lhe chama. */
  line: string;
  /** Para onde vai. */
  destination: string;
  /** Quantos minutos faltam. */
  minutes: number;
  /** A hora a que passa, em `HH:MM`. */
  time: string;
}

/** `HH:MM` a partir de segundos desde 1970. */
function clockOf(unix: number): string {
  const d = new Date(unix * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** As estações de um horário a menos de uma certa distância de um ponto. */
function stopsNear(
  feed: IndexedFeed,
  origin: Coordinates,
  maxMeters: number,
): Map<number, number> {
  const perto = new Map<number, number>();

  feed.data.stops.forEach((stop, i) => {
    const meters = distanceMeters(origin, { latitude: stop.y, longitude: stop.x });
    if (meters <= maxMeters) {
      perto.set(i, meters);
    }
  });

  return perto;
}

/**
 * A estação **mais próxima** de um ponto, num horário — e só essa.
 *
 * É o que se usa para as horas de passagem, e a diferença em relação a apanhar
 * todas as que estão dentro de um raio é importante:
 *
 * - **Um raio apertado falha.** As localizações vêm da API da Carris e as horas
 *   do GTFS do operador, e os dois pontos da mesma estação não coincidem. Com um
 *   raio de 400 metros, Cascais ficava de fora por trinta metros — visto nos
 *   dados reais, não em teoria.
 * - **Um raio largo mente.** As estações de metro de Lisboa ficam a uns
 *   quinhentos metros umas das outras; alargar o raio punha na Rotunda os
 *   comboios do Marquês.
 *
 * Ficar com a mais próxima resolve as duas: pode-se ser generoso na distância
 * sem nunca misturar duas estações. E como se faz por horário, numa interface
 * como o Oriente o comboio vem do ficheiro da CP e o metro do do Metro, cada um
 * com a sua estação — que é exatamente o que se quer ver.
 */
function nearestStop(
  feed: IndexedFeed,
  origin: Coordinates,
  maxMeters: number,
): { indice: number; meters: number } | null {
  let melhor: { indice: number; meters: number } | null = null;

  feed.data.stops.forEach((stop, i) => {
    const meters = distanceMeters(origin, { latitude: stop.y, longitude: stop.x });
    if (meters <= maxMeters && (!melhor || meters < melhor.meters)) {
      melhor = { indice: i, meters };
    }
  });

  return melhor;
}

/**
 * O nome da linha, encurtado para caber no ecrã.
 *
 * A CP escreve `Linha de Sintra` e `Linha da Azambuja` no nome curto — que de
 * curto não tem nada, e não cabe na etiqueta ao lado do destino. Tira-se o
 * "Linha de", que fica "Sintra" e "Azambuja": é como toda a gente lhes chama.
 *
 * Os outros nomes já são códigos (`AP`, `IC`, `IR`, `R`, `U`) e ficam como estão.
 */
function shortLine(nome: string): string {
  return nome.replace(/^Linha\s+d[eoa]s?\s+/i, '');
}

/**
 * As próximas passagens numa estação.
 *
 * Recebe coordenadas e não um nome: as estações vêm da API da Carris (as
 * localizações) e os horários vêm do GTFS de cada operador, que são duas fontes
 * diferentes e escrevem os nomes de maneiras diferentes. **Comparar por
 * proximidade é muito mais seguro do que comparar nomes** — "Lisboa Oriente" e
 * "Oriente" são a mesma estação, e nenhuma comparação de texto acerta nisso sem
 * inventar regras.
 *
 * O raio é apertado de propósito. As estações de metro de Lisboa ficam a uns
 * quinhentos metros umas das outras, e um raio generoso punha na estação errada
 * comboios da estação do lado — o que é pior do que não mostrar nada.
 */
export function departuresNear(
  origin: Coordinates,
  maxMeters = 900,
  limit = 8,
  agora = new Date(),
): ScheduleDeparture[] {
  const nowUnix = agora.getTime() / 1000;
  const dias = candidateDays(agora);
  const passagens: ScheduleDeparture[] = [];

  for (const feed of loadedFeeds()) {
    if (isExpired(feed.info, agora)) {
      continue;
    }

    const maisPerto = nearestStop(feed, origin, maxMeters);
    if (!maisPerto) {
      continue;
    }

    {
      const estacao = maisPerto.indice;
      for (const { trip, pos } of feed.porEstacao.get(estacao) ?? []) {
        const viagem = feed.data.trips[trip];
        const minuto = feed.minutos[trip]?.[pos];
        if (minuto === undefined) {
          continue;
        }

        // A última estação de uma viagem não é uma partida — é o fim da linha.
        // Anunciá-la punha no painel comboios em que não se pode entrar.
        if (pos >= (feed.data.patterns[viagem.p]?.length ?? 0) - 1) {
          continue;
        }

        for (const dia of dias) {
          if (!feed.dias[viagem.s]?.has(dia)) {
            continue;
          }

          const quando = unixAt(dia, minuto);
          const faltam = Math.round((quando - nowUnix) / 60);
          if (faltam < 0 || faltam > 120) {
            continue;
          }

          passagens.push({
            key: `${feed.info.id}-${trip}-${dia}`,
            operator: feed.info.nome,
            kind: feed.info.kind,
            station: feed.data.stops[estacao]?.n ?? '',
            line: shortLine(feed.data.routes[viagem.r]?.[0] || feed.info.nome),
            destination: feed.data.headsigns[viagem.h] ?? '',
            minutes: faltam,
            time: clockOf(quando),
          });
        }
      }
    }
  }

  return passagens.sort((a, b) => a.minutes - b.minutes).slice(0, limit);
}

/** Quantos segundos leva a andar esta distância, com a volta dos quarteirões. */
function walkSeconds(meters: number): number {
  return (meters * WALK_DETOUR) / WALK_SPEED_MS;
}

/** Uma estação, na forma que o resto da aplicação já sabe mostrar. */
function asStop(feed: IndexedFeed, estacao: number, meters: number): TransitStop {
  const stop = feed.data.stops[estacao];
  return {
    id: `${feed.info.id}:${estacao}`,
    name: stop?.n ?? '',
    locality: feed.info.nome,
    coordinates: { latitude: stop?.y ?? 0, longitude: stop?.x ?? 0 },
    lines: [],
    connections: [],
    meters,
  };
}

/**
 * Trajetos de comboio, metro ou barco entre dois pontos.
 *
 * É a mesma ideia do `planBusTrips`, e mais simples de fazer: aqui tem-se a
 * viagem inteira escrita no ficheiro, com as estações por que passa e por que
 * ordem. Não é preciso cruzar passagens de paragens diferentes à procura do
 * mesmo `trip_id` — basta procurar as viagens que passam numa estação de
 * partida e, **mais à frente no mesmo percurso**, numa estação de chegada.
 *
 * Continua **sem transbordos**, pela mesma razão de sempre: um trajeto com
 * mudança mal feito é pior do que não existir.
 */
export function planScheduledTrips(
  origin: Coordinates,
  destination: Coordinates,
  limit = 4,
  agora = new Date(),
): TransitTrip[] {
  const nowUnix = agora.getTime() / 1000;
  const dias = candidateDays(agora);
  const trajetos: TransitTrip[] = [];

  for (const feed of loadedFeeds()) {
    if (isExpired(feed.info, agora)) {
      continue;
    }

    const saidas = stopsNear(feed, origin, TRANSIT_WALK_MAX_M);
    const chegadas = stopsNear(feed, destination, TRANSIT_WALK_MAX_M);
    if (saidas.size === 0 || chegadas.size === 0) {
      continue;
    }

    // As viagens que passam por alguma estação de partida à mão. Guardam-se
    // **todas** as posições onde se pode entrar, e não só a primeira: a melhor
    // pode não ser a primeira, e é a comparação que decide.
    const candidatas = new Map<number, number[]>();
    for (const estacao of saidas.keys()) {
      for (const { trip, pos } of feed.porEstacao.get(estacao) ?? []) {
        const lista = candidatas.get(trip);
        if (lista) {
          lista.push(pos);
        } else {
          candidatas.set(trip, [pos]);
        }
      }
    }

    for (const [trip, entradas] of candidatas) {
      const viagem = feed.data.trips[trip];
      const padrao = feed.data.patterns[viagem.p] ?? [];
      const horas = feed.minutos[trip] ?? [];

      for (const dia of dias) {
        if (!feed.dias[viagem.s]?.has(dia)) {
          continue;
        }

        /**
         * A melhor forma de fazer esta viagem neste dia.
         *
         * **Escolhe-se por hora de chegada ao destino, não pela ordem do
         * percurso.** A primeira versão ficava com a primeira estação de saída
         * que estivesse a pé de distância, e nos dados reais isso apanhou-se a
         * sair em Portela de Sintra — a 831 metros do destino — quando o mesmo
         * comboio parava em Sintra a seguir, a quatro metros. Chegava mais cedo
         * à estação e mais tarde ao sítio.
         */
        let melhor: TransitTrip | null = null;

        for (const entradaPos of entradas) {
          const estacaoEntrada = padrao[entradaPos];
          const aPe = walkSeconds(saidas.get(estacaoEntrada) ?? 0);
          const parte = unixAt(dia, horas[entradaPos]);
          const leaveAt = parte - aPe;

          // Um minuto de folga, para quem já está à porta da estação. E nada
          // para lá de quatro horas: isso já não é esperar pelo comboio.
          if (leaveAt < nowUnix - 60 || parte - nowUnix > 4 * 3600) {
            continue;
          }

          // A saída tem de vir depois da entrada no mesmo percurso. É isto que
          // impede um trajeto no sentido contrário: a linha passa nas duas
          // estações, mas pela ordem errada para quem quer ir neste sentido.
          for (let pos = entradaPos + 1; pos < padrao.length; pos += 1) {
            const noFim = chegadas.get(padrao[pos]);
            if (noFim === undefined) {
              continue;
            }

            const chega = unixAt(dia, horas[pos]);
            const reachAt = chega + walkSeconds(noFim);
            if (melhor && reachAt >= melhor.reachAt) {
              continue;
            }

            melhor = {
              tripId: `${feed.info.id}:${trip}:${dia}`,
              kind: feed.info.kind,
              line: shortLine(feed.data.routes[viagem.r]?.[0] || feed.info.nome),
              headsign: feed.data.headsigns[viagem.h] ?? '',
              from: asStop(feed, estacaoEntrada, saidas.get(estacaoEntrada) ?? 0),
              to: asStop(feed, padrao[pos], noFim),
              departsAt: parte,
              arrivesAt: chega,
              leaveAt,
              reachAt,
              stops: pos - entradaPos,
              // Nunca. Isto é o horário, não é o comboio a andar.
              live: false,
            };
          }
        }

        if (melhor) {
          trajetos.push(melhor);
        }
      }
    }
  }

  // Chega mais cedo primeiro, e cada linha aparece uma vez: os três comboios
  // seguintes da mesma linha não são três opções, são a mesma opção.
  const porLinha = new Map<string, TransitTrip>();
  for (const t of trajetos.sort((a, b) => a.reachAt - b.reachAt)) {
    if (!porLinha.has(t.line)) {
      porLinha.set(t.line, t);
    }
  }

  return [...porLinha.values()].slice(0, limit);
}

/** Se há algum horário guardado que cubra este ponto. */
export function hasCoverage(point: Coordinates): boolean {
  return loadedFeeds().some((feed) => {
    const [oeste, sul, este, norte] = feed.data.bbox ?? [0, 0, 0, 0];
    return (
      point.longitude >= oeste &&
      point.longitude <= este &&
      point.latitude >= sul &&
      point.latitude <= norte
    );
  });
}
