/**
 * O formato exato do que a API da Carris Metropolitana devolve.
 *
 * Como nos outros serviços, isto descreve o que **eles** dizem, não o que a
 * aplicação usa — a tradução para os tipos de `geo.ts` fica no serviço. Assim,
 * se um dia entrar outro operador, só muda a tradução.
 *
 * Quase tudo está marcado como opcional de propósito. Isto não pôde ser testado
 * contra o serviço real (o ambiente de desenvolvimento não lhe chega), por isso
 * o código tem de aguentar campos em falta em vez de rebentar.
 */

/** Uma paragem, tal como vem de `/v2/stops`. */
export interface CarrisStop {
  id: string;
  name?: string;
  short_name?: string;
  /** Vêm como texto, não como número. */
  lat?: string;
  lon?: string;
  locality?: string;
  municipality_name?: string;
  lines?: string[];
}

/**
 * Uma passagem prevista numa paragem, tal como vem de `/v2/arrivals/by_stop/:id`.
 *
 * As horas vêm em `HH:MM:SS` e podem passar das 24 — é a convenção do GTFS para
 * as viagens que atravessam a meia-noite. `25:10:00` é a uma e dez da manhã
 * seguinte, ainda a contar como serviço do dia anterior.
 */
export interface CarrisArrival {
  line_id?: string;
  pattern_id?: string;
  route_id?: string;
  trip_id?: string;
  headsign?: string;
  stop_id?: string;
  /** A hora do horário. Existe sempre. */
  scheduled_arrival?: string;
  /** A hora prevista, já com o atraso real. Só existe quando há tempo real. */
  estimated_arrival?: string;
  /** A hora a que passou mesmo. Se estiver preenchida, já passou. */
  observed_arrival?: string;
}
