/**
 * The format of the timetables converted from static GTFS.
 *
 * This describes, on the app's side, exactly what `scripts/build-transit.py`
 * writes. When changing one, change the other — they are the two ends of the
 * same file.
 *
 * **The keys are short on purpose.** They repeat once per trip and per stop,
 * thousands of times each, and in a file downloaded to a phone that counts. The
 * price is that they are unreadable on their own, which is why each one is
 * explained here.
 *
 * **Some keys are in Portuguese** (`nome`, `gerado`, `inicio`, `fim`,
 * `ficheiro`, `estacoes`, `origem`, `naApp`). They are part of files already
 * published in the `horarios` Release and read by installed copies of the app,
 * so they stay as they are: renaming them would break every version already
 * out there.
 */

/** A station, with all its platforms merged into one. */
export interface ScheduleStop {
  /** The name, as it appears on screen. */
  n: string;
  /** Latitude. */
  y: number;
  /** Longitude. */
  x: number;
}

/**
 * A trip: one specific train, at one specific time.
 */
export interface ScheduleTrip {
  /** Index into `routes`: which line it is. */
  r: number;
  /** Index into `services`: which days it runs. */
  s: number;
  /** Index into `headsigns`: what the destination sign says. */
  h: number;
  /** Index into `patterns`: which stations it calls at, and in what order. */
  p: number;
  /**
   * The calling times, in minutes.
   *
   * The first is absolute, counted from midnight; the following ones are what
   * is added to the previous one. That way almost all of them have one or two
   * digits.
   *
   * **It can go past 1440.** A train at one in the morning belongs to the
   * previous day's service, and comes as 1500 — see `absoluteMinutes` in the
   * service.
   *
   * Only in the first format (v1). A v2 file keeps `start` and `prof`.
   */
  t?: number[];
  /** v2: the first calling time, absolute minutes. */
  start?: number;
  /** v2: index into `profiles`, the deltas after `start`. */
  prof?: number;
}

/**
 * The second format (`<id>.v2.json`, November 2026), written next to the first
 * for the app versions that read only that.
 *
 * Why: the first spelled out every trip — Carris Metropolitana is 243,000
 * trips and 7.8 million numbers in 27 MB, and parsing it on the phone was most
 * of "transport takes ages to load". But trips of one pattern almost always
 * keep the same gaps between stops: 4,989 distinct gap lists for those 243,000
 * trips. So the gaps are stored once (`profiles`), and trips that share line,
 * service, headsign, pattern and gaps are one group with the list of their
 * start times (`groups`). 3.3 MB, and parsed about 13 times faster.
 */
export interface ScheduleFeedV2 extends Omit<ScheduleFeed, 'trips'> {
  v: 2;
  /** Gaps in minutes between consecutive calls, after the first. */
  profiles: number[][];
  /**
   * `[route, service, headsign, pattern, profile, starts]`; `starts` is
   * sorted and delta-encoded (the first absolute, then what is added).
   */
  groups: [number, number, number, number, number, number[]][];
}

/** One operator's timetable, as it comes from the Release. */
export interface ScheduleFeed {
  id: string;
  /** The operator's name. */
  nome: string;
  kind: string;
  /** When it was generated, as YYYY-MM-DD. */
  gerado: string;
  /** First and last day covered, as YYYYMMDD. */
  inicio: string;
  fim: string;
  stops: ScheduleStop[];
  /** Each line: short name and long name. */
  routes: [string, string][];
  /** The destination signs, without repetitions. */
  headsigns: string[];
  /** Each pattern is a sequence of indices into `stops`. */
  patterns: number[][];
  /**
   * For each service, the days it runs, as YYYYMMDD.
   *
   * These are the actual dates, not the day-of-week mask with the holidays
   * listed separately. It takes a few dozen kilobytes more and saves having the
   * holiday arithmetic written twice — the kind of thing that ends up
   * diverging in one of the two places.
   */
  services: string[][];
  trips: ScheduleTrip[];
  /**
   * The GTFS stop ids merged into each station, aligned with `stops`. Only in
   * files generated since November 2026 — older ones lack it. Lets a live
   * feed that names a stop (Carris de Lisboa's GTFS-RT) find it here.
   */
  stopIds?: string[][];
  /** The GTFS route id of each line, aligned with `routes`. Same age. */
  routeIds?: string[];
  /** Area covered: west, south, east, north. */
  bbox: [number, number, number, number];
}

/** One entry in the list of available timetables. */
export interface ScheduleFeedInfo {
  id: string;
  /** The operator's name. */
  nome: string;
  kind: string;
  /** The data file's name. */
  ficheiro: string;
  bytes: number;
  /** When it was generated, as YYYY-MM-DD. */
  gerado: string;
  /** Last day covered, as YYYYMMDD. After that it must be generated again. */
  fim: string;
  /** How many stations it has. */
  estacoes: number;
  bbox: [number, number, number, number];
  /** Where the GTFS came from. Recorded so it is known which source was used. */
  origem?: string;
  /** The v2 file (`ScheduleFeedV2`), when published; preferred by this app. */
  ficheiro2?: string;
  /** Its size. */
  bytes2?: number;
  /**
   * When `false`, the app does not offer this timetable for download.
   *
   * It is for operators that have real-time data through an API — today only
   * Carris Metropolitana. The file is still generated, because it is what
   * proves the conversion chain works when the others fail.
   */
  naApp?: boolean;
}
