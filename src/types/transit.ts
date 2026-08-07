/**
 * O formato exato do que a API da Carris Metropolitana devolve.
 *
 * Como nos outros serviços, isto descreve o que **eles** dizem, não o que a
 * aplicação usa — a tradução para os tipos de `geo.ts` fica no serviço. Assim,
 * se um dia entrar outro operador, só muda a tradução.
 *
 * **Os nomes destes campos foram lidos do código do próprio serviço**, que é
 * aberto, e não adivinhados. À primeira tentativa assumiu-se `name`, `locality`
 * e `lines` — e como nenhum existe, todas as paragens apareciam com o nome
 * "Paragem" e sem mais nada. A posição vinha certa porque `lat` e `lon` são os
 * únicos que se acertaram. Ver a nota no CLAUDE.md.
 */

/** Uma paragem, tal como vem de `/v2/stops`. */
export interface CarrisStop {
  id: string;
  /** O nome completo da paragem. **É `long_name`, não `name`.** */
  long_name?: string;
  /** Versão curta do nome, quando existe. */
  short_name?: string;
  /** Vêm como número, ao contrário do que se assumiu à primeira. */
  lat?: number | string;
  lon?: number | string;
  /** A localidade. **É `locality_name`, não `locality`.** */
  locality_name?: string;
  municipality_name?: string;
  /** As linhas que param aqui. **É `line_ids`, não `lines`.** */
  line_ids?: string[];
}

/**
 * Uma passagem prevista numa paragem, tal como vem de `/v2/arrivals/by_stop/:id`.
 *
 * As horas em texto vêm em `HH:MM:SS` e **podem passar das 24** — é a convenção
 * do GTFS para as viagens que atravessam a meia-noite. `25:10:00` é a uma e dez
 * da manhã seguinte, ainda a contar como serviço do dia anterior.
 *
 * **Por isso usam-se as versões `_unix`.** São segundos desde 1970, já com essa
 * conta feita do lado deles, e comparam-se diretamente com o relógio. Poupam-nos
 * a aritmética das 24 horas, que é onde este género de código costuma falhar.
 */
export interface CarrisArrival {
  line_id?: string;
  /**
   * Identifica a **viagem**: aquele autocarro, naquele horário, naquele dia.
   *
   * É a peça que permite montar um trajeto: se o mesmo `trip_id` aparece na
   * paragem onde se entra e na paragem onde se sai, é o mesmo autocarro — e as
   * duas horas são a partida e a chegada reais, sem se ter de adivinhar nada.
   */
  trip_id?: string;
  /** A ordem desta paragem dentro da viagem. Confirma o sentido da marcha. */
  stop_sequence?: number;
  pattern_id?: string;
  route_id?: string;
  headsign?: string;
  stop_id?: string;
  /** A hora do horário, em texto. */
  scheduled_arrival?: string;
  /** A mesma, em segundos desde 1970. É esta que se usa. */
  scheduled_arrival_unix?: number | null;
  /** A hora prevista, já com o atraso real. Só existe quando há tempo real. */
  estimated_arrival?: string;
  estimated_arrival_unix?: number | null;
  /** A hora a que passou mesmo. Se estiver preenchida, já passou. */
  observed_arrival?: string | null;
}
