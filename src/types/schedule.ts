/**
 * O formato dos horários convertidos do GTFS estático.
 *
 * Isto descreve, do lado da aplicação, exatamente o que o
 * `scripts/build-transit.py` escreve. Ao mexer num, mexer no outro — são as duas
 * pontas do mesmo ficheiro.
 *
 * **As chaves são curtas de propósito.** Repetem-se uma vez por viagem e por
 * paragem, milhares de vezes cada, e num ficheiro que se descarrega para um
 * telemóvel isso conta. O preço é ficarem ilegíveis sozinhas, e é por isso que
 * cada uma está explicada aqui.
 */

/** Uma estação, já com as plataformas todas juntas numa só. */
export interface ScheduleStop {
  /** O nome, como aparece no ecrã. */
  n: string;
  /** Latitude. */
  y: number;
  /** Longitude. */
  x: number;
}

/**
 * Uma viagem: um comboio concreto, a uma hora concreta.
 */
export interface ScheduleTrip {
  /** Índice em `routes`: que linha é. */
  r: number;
  /** Índice em `services`: em que dias corre. */
  s: number;
  /** Índice em `headsigns`: o que diz o letreiro. */
  h: number;
  /** Índice em `patterns`: por que estações passa, e por que ordem. */
  p: number;
  /**
   * As horas de passagem, em minutos.
   *
   * A primeira é absoluta, contada desde a meia-noite; as seguintes são o que
   * se acrescenta à anterior. Assim ficam quase todas com um ou dois dígitos.
   *
   * **Pode passar dos 1440.** Um comboio à uma da manhã é serviço do dia
   * anterior, e vem como 1500 — ver `absoluteMinutes` no serviço.
   */
  t: number[];
}

/** O horário de um operador, tal como vem da Release. */
export interface ScheduleFeed {
  id: string;
  nome: string;
  kind: string;
  /** Quando foi gerado, em AAAA-MM-DD. */
  gerado: string;
  /** Primeiro e último dia coberto, em AAAAMMDD. */
  inicio: string;
  fim: string;
  stops: ScheduleStop[];
  /** Cada linha: nome curto e nome comprido. */
  routes: [string, string][];
  /** Os letreiros, sem repetições. */
  headsigns: string[];
  /** Cada padrão é uma sequência de índices em `stops`. */
  patterns: number[][];
  /**
   * Para cada serviço, os dias em que corre, em AAAAMMDD.
   *
   * São as datas mesmo, e não a máscara de dias da semana com os feriados à
   * parte. Ocupa mais umas dezenas de kilobytes e poupa ter a aritmética dos
   * feriados escrita duas vezes — que é o género de coisa que acaba por
   * divergir numa das duas.
   */
  services: string[][];
  trips: ScheduleTrip[];
  /** Área abrangida: oeste, sul, este, norte. */
  bbox: [number, number, number, number];
}

/** Uma entrada da lista de horários disponíveis. */
export interface ScheduleFeedInfo {
  id: string;
  nome: string;
  kind: string;
  ficheiro: string;
  bytes: number;
  /** Quando foi gerado, em AAAA-MM-DD. */
  gerado: string;
  /** Último dia coberto, em AAAAMMDD. Passado isso, é preciso gerar de novo. */
  fim: string;
  estacoes: number;
  bbox: [number, number, number, number];
  /** De onde veio o GTFS. Fica registado para se saber que fonte foi usada. */
  origem?: string;
}
