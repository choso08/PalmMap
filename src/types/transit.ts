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
  /**
   * Ligações que esta paragem tem a outros meios.
   *
   * Traz `'train'`, `'subway'`, `'light_rail'`, `'boat'` — é o que permite dizer
   * "aqui muda para o comboio" sem se ter de cruzar coordenadas à mão.
   */
  facilities?: string[];
}

/**
 * Uma estação de comboio, metro, metro de superfície ou barco.
 *
 * Vem dos endpoints `/facilities/*` da mesma API dos autocarros. São só as
 * **localizações** — não há horários destes operadores por aqui.
 *
 * **Atenção aos tipos.** No código do serviço há duas formas deste objeto: uma
 * com `lat`/`lon` como número e outra como texto. Não se sabe qual é a que a v2
 * serve, por isso aceitam-se as duas — já se perdeu tempo suficiente com nomes
 * e formatos adivinhados nesta API.
 */
export interface CarrisFacility {
  id: string;
  name?: string;
  lat?: number | string;
  lon?: number | string;
  locality?: string;
  municipality_name?: string;
  /**
   * As paragens de autocarro que servem esta estação.
   *
   * É isto que liga um trajeto de autocarro a um transbordo para o comboio, sem
   * ser preciso adivinhar por proximidade.
   */
  stop_ids?: string[];
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

/**
 * Um veículo, tal como o `/vehicles` da Carris Metropolitana o devolve.
 *
 * **Os nomes foram lidos de uma resposta verdadeira**, não adivinhados. A
 * resposta traz trinta campos por veículo — ficha da frota incluída, com
 * matrícula, marca, modelo e lotação — e aqui só se declaram os que a aplicação
 * usa. Os outros existem e não fazem mal nenhum.
 *
 * **Nem todos os veículos da lista estão a andar.** Os que não estão vêm sem
 * `lat`, `lon` nem `timestamp` — é isso que os distingue, e não um campo a dizê-lo.
 * E dos que trazem posição, a maioria tem-na de horas ou dias atrás: é a última
 * conhecida, de onde ficaram estacionados. Ver `src/services/vehicles.ts`.
 */
export interface CarrisVehicle {
  /** Identifica o veículo, na forma `41|300`. */
  id?: string;
  lat?: number | string;
  lon?: number | string;
  /** Para onde aponta, em graus. */
  bearing?: number | string;
  /** Metros por segundo, não quilómetros por hora. */
  speed?: number | string;
  /** Segundos desde 1970, de quando esta posição foi dada. */
  timestamp?: number | string;
  /** O número da linha que está a fazer. */
  line_id?: string;
  route_id?: string;
  pattern_id?: string;
  trip_id?: string;
  /** A paragem a que se refere o `current_status`. */
  stop_id?: string;
  /** `STOPPED_AT`, `IN_TRANSIT_TO` ou `INCOMING_AT`, como no GTFS-RT. */
  current_status?: string;
}
