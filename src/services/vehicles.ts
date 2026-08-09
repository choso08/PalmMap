import axios from 'axios';

import {
  CARRIS_BASE_URL,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
  VEHICLE_MAX_AGE_S,
} from './config';
import type { Coordinates } from '../types/geo';
import type { CarrisVehicle } from '../types/transit';

/**
 * Os autocarros da Carris Metropolitana, onde estão neste momento.
 *
 * É o mesmo que se vê no mapa do sítio deles: os autocarros a mexer, cada um com
 * o número da linha. Vem da mesma API aberta das horas de passagem, sem chave
 * nenhuma, e **em JSON** — não em Protobuf, que teria obrigado a uma biblioteca
 * só para o descodificar.
 *
 * ## A armadilha, e é grande
 *
 * O serviço devolve **a frota inteira**, não os autocarros que andam. São 1679
 * veículos, dos quais 1550 trazem posição — mas essa posição é a **última
 * conhecida**, que para a maioria é de onde ficaram estacionados. Medido de
 * madrugada: a idade mediana era de **nove horas**, e a pior de doze dias.
 *
 * Desenhar a lista como vem enchia o mapa de mil e quinhentos autocarros
 * parados em garagens. Por isso só entram os que deram sinal há menos de
 * `VEHICLE_MAX_AGE_S`. **Não desligar este filtro** — sem ele isto não é uma
 * funcionalidade, é um mapa errado.
 *
 * ## E o peso
 *
 * A resposta são cerca de **1,1 MB**, e não há forma de pedir menos: não há
 * filtro por área nem por linha (o `by_line` responde 404). Vai comprimida pela
 * rede, o que a põe na ordem dos 150 KB, mas continua a ser o pedido mais
 * pesado que esta aplicação faz.
 *
 * É por isso que isto só corre **no tipo de mapa dos transportes**, **acima de
 * um zoom** e com uma definição para desligar. Ver `App.tsx`.
 *
 * ## Sobre os nomes dos campos
 *
 * Foram **lidos de uma resposta verdadeira**, não adivinhados — este projeto já
 * tem registado o que custou adivinhar os da mesma API. São `lat`, `lon`,
 * `bearing`, `line_id`, `trip_id`, `speed`, `timestamp` e `current_status`.
 */

const client = axios.create({
  baseURL: CARRIS_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
});

/** Um autocarro em andamento, pronto para o mapa. */
export interface LiveVehicle {
  id: string;
  /** O número da linha, como vem pintado no autocarro. */
  line: string;
  coordinates: Coordinates;
  /** Para onde aponta, em graus. `null` quando o serviço não diz. */
  bearing: number | null;
  /** A que velocidade vai, em km/h. */
  speedKmh: number;
  /** Se está parado numa paragem neste momento. */
  atStop: boolean;
  /** Há quantos segundos deu sinal. */
  ageSeconds: number;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Os autocarros que estão mesmo a andar agora.
 *
 * Devolve lista vazia quando não há nenhum — o que de madrugada é a resposta
 * certa, e não uma avaria.
 */
export async function liveVehicles(): Promise<LiveVehicle[]> {
  const { data } = await client.get<CarrisVehicle[]>('/vehicles');

  const agora = Date.now() / 1000;
  const andando: LiveVehicle[] = [];

  for (const veiculo of Array.isArray(data) ? data : []) {
    const latitude = toNumber(veiculo.lat);
    const longitude = toNumber(veiculo.lon);
    const quando = toNumber(veiculo.timestamp);

    // Sem posição é ficha da frota, não é um autocarro na rua.
    if (latitude === null || longitude === null || quando === null || !veiculo.id) {
      continue;
    }

    // O filtro que faz isto valer alguma coisa. Ver a nota no topo.
    const idade = agora - quando;
    if (idade < 0 || idade > VEHICLE_MAX_AGE_S) {
      continue;
    }

    const velocidade = toNumber(veiculo.speed) ?? 0;

    andando.push({
      id: veiculo.id,
      line: veiculo.line_id ?? veiculo.route_id ?? '—',
      coordinates: { latitude, longitude },
      bearing: toNumber(veiculo.bearing),
      // O serviço manda metros por segundo; o velocímetro de toda a gente está
      // em quilómetros por hora.
      speedKmh: Math.round(velocidade * 3.6),
      atStop: veiculo.current_status === 'STOPPED_AT',
      ageSeconds: Math.round(idade),
    });
  }

  return andando;
}
