import axios from 'axios';
import { t } from '../i18n';
import { Directory, File, Paths } from 'expo-file-system';

import {
  REQUEST_TIMEOUT_MS,
  TRANSFER_MAX_WAIT_S,
  TRANSIT_WALK_MAX_M,
  USER_AGENT,
  WALK_DETOUR,
  WALK_SPEED_MS,
} from './config';
import type {
  RailPoint,
  TransitChange,
  RideRef,
  RideStop,
  TransitStation,
  TransitStop,
  TransitTrip,
} from './transit';
import type { Coordinates } from '../types/geo';
import type { ScheduleFeed, ScheduleFeedInfo } from '../types/schedule';

export type { ScheduleFeedInfo };
import { distanceMeters } from '../utils/geometry';

/**
 * Train, metro and ferry timetables, stored on the phone.
 *
 * ## Why this is different from the buses
 *
 * Carris Metropolitana's buses have an open API with **real time**:
 * `transit.ts` asks it for the times and gets the time the bus actually
 * passes, with the delay already counted. It doesn't get better than that.
 *
 * Trains, the metro and ferries have nothing like it. What they have is
 * **static GTFS** — a ZIP with the whole timetable, published every now and
 * then. It cannot be used directly: CP's has hundreds of thousands of lines
 * and the phone would have to read all of it to answer a simple question.
 *
 * So the conversion is done in GitHub Actions
 * (`.github/workflows/build-transit.yml`), the result goes to a Release, and
 * here a small file is just downloaded and asked questions. It is the same path
 * as the offline maps, for the same reason.
 *
 * ## What this is, and what it is not
 *
 * **It is the timetable, not real time.** It says when the train should pass.
 * If it is late, this does not know. The app marks the difference: buses get a
 * green dot, trains do not. Don't promise what you don't have.
 *
 * **It has an expiry date.** Each file covers a window of days from when it
 * was generated. Past that date it stops answering, and says why instead of
 * showing an empty list.
 *
 * **It works without network**, which is half the reason it exists: the file
 * is on the phone.
 *
 * The Release tag `horarios`, the on-device folder `horarios` and the
 * Portuguese field names of the published files stay as they are, so copies
 * of the app already installed keep finding them.
 */

const BASE_URL = 'https://github.com/choso08/PalmMap/releases/download/horarios';

/** Where the downloaded timetables are kept. */
const FOLDER = new Directory(Paths.document, 'horarios');

/** Error with a readable message, so the screen can show something useful. */
export class ScheduleError extends Error {}

// --- Downloading and storing ----------------------------------------------------

function ensureFolder(): void {
  if (!FOLDER.exists) {
    FOLDER.create({ intermediates: true });
  }
}

function dataFile(info: ScheduleFeedInfo): File {
  return new File(FOLDER, info.ficheiro);
}

/**
 * The identification file.
 *
 * It has to be `.info.json` and not `.json` as with the maps: here the data
 * file is already a `.json`, and the two would end up with the same name.
 */
function infoFile(id: string): File {
  return new File(FOLDER, `${id}.info.json`);
}

export function isInstalled(info: ScheduleFeedInfo): boolean {
  return dataFile(info).exists;
}

/** The timetables actually on the phone. Reads the folder, so it works without network. */
export function installedFeeds(): ScheduleFeedInfo[] {
  if (!FOLDER.exists) {
    return [];
  }

  const feeds: ScheduleFeedInfo[] = [];
  for (const entry of FOLDER.list()) {
    if (!(entry instanceof File) || !entry.uri.endsWith('.info.json')) {
      continue;
    }
    try {
      const info = JSON.parse(entry.textSync()) as ScheduleFeedInfo;
      if (new File(FOLDER, info.ficheiro).exists) {
        feeds.push(info);
      }
    } catch {
      // Broken identification: that operator is ignored instead of leaving the
      // app with no timetable at all.
    }
  }
  return feeds;
}

/** The list of what there is to download. */
export async function listFeeds(): Promise<ScheduleFeedInfo[]> {
  try {
    const response = await axios.get<{ horarios: ScheduleFeedInfo[] }>(
      `${BASE_URL}/horarios.json`,
      { timeout: REQUEST_TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT } },
    );

    // Everything is listed, Carris Metropolitana included (author's request,
    // November 2026): it has real time, but its timetable lets a trip be
    // planned for later, offline and with several changes. It was hidden with
    // `naApp: false`; that flag now only keeps it from downloading by itself
    // (`ensureFeedsFor`) — 27 MB is not fetched without a tap.
    return response.data.horarios ?? [];
  } catch {
    const stored = installedFeeds();
    if (stored.length > 0) {
      return stored;
    }
    throw new ScheduleError(
      t().errors.scheduleListFailed,
    );
  }
}

/** Downloads one operator's timetable. */
export async function downloadFeed(info: ScheduleFeedInfo): Promise<void> {
  ensureFolder();

  // The `.parcial` ("partial") suffix stays in Portuguese so leftovers from
  // older versions are still recognised and cleaned up.
  const partial = new File(FOLDER, `${info.ficheiro}.parcial`);
  if (partial.exists) {
    partial.delete();
  }

  try {
    const downloaded = await File.downloadFileAsync(
      `${BASE_URL}/${info.ficheiro}`,
      partial,
    );

    const destination = dataFile(info);
    if (destination.exists) {
      destination.delete();
    }
    await downloaded.move(destination);
    infoFile(info.id).write(JSON.stringify(info));
    cache.delete(info.id);
  } catch (error) {
    if (partial.exists) {
      partial.delete();
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new ScheduleError(
      t().errors.scheduleDownloadFailed(info.nome, detail),
    );
  }
}

/** Deletes one operator's stored timetable. */
export function removeFeed(info: ScheduleFeedInfo): void {
  for (const file of [dataFile(info), infoFile(info.id)]) {
    if (file.exists) {
      file.delete();
    }
  }
  cache.delete(info.id);
}

/** How much the stored timetables take up, in total. */
export function usedBytes(): number {
  if (!FOLDER.exists) {
    return 0;
  }
  return FOLDER.list().reduce(
    (total, entry) => (entry instanceof File ? total + (entry.size ?? 0) : total),
    0,
  );
}

// --- Reading and indexing -------------------------------------------------------

/**
 * A timetable already read and prepared to answer quickly.
 *
 * The preparation is done once, when the file is opened. Without it, every
 * question would mean walking through all the trips — and some operators have
 * thousands.
 */
interface IndexedFeed {
  info: ScheduleFeedInfo;
  data: ScheduleFeed;
  /** Each trip's times in absolute minutes, with the deltas already added up. */
  minutes: number[][];
  /** Each service's days, as a set, so they need not be searched in a list. */
  days: Set<string>[];
  /** Which trips each station appears in, and at which position of the route. */
  byStation: Map<number, { trip: number; pos: number }[]>;
}

const cache = new Map<string, IndexedFeed>();

function index(info: ScheduleFeedInfo, data: ScheduleFeed): IndexedFeed {
  const minutes: number[][] = [];
  const byStation = new Map<number, { trip: number; pos: number }[]>();

  data.trips.forEach((trip, i) => {
    const pattern = data.patterns[trip.p] ?? [];

    // The deltas go back to being absolute times. It is the inverse of the
    // arithmetic the conversion script does, done once instead of on every
    // question.
    const times: number[] = [];
    let running = 0;
    for (const delta of trip.t) {
      running += delta;
      times.push(running);
    }
    minutes.push(times);

    pattern.forEach((station, pos) => {
      const list = byStation.get(station);
      if (list) {
        list.push({ trip: i, pos });
      } else {
        byStation.set(station, [{ trip: i, pos }]);
      }
    });
  });

  return {
    info,
    data,
    minutes,
    days: data.services.map((dates) => new Set(dates)),
    byStation,
  };
}

/**
 * Opens a stored timetable.
 *
 * It stays in memory after the first time: it is a file of hundreds of
 * kilobytes and reading it on every question would be much worse than keeping
 * it.
 */
export function loadFeed(info: ScheduleFeedInfo): IndexedFeed | null {
  const stored = cache.get(info.id);
  if (stored) {
    return stored;
  }

  const file = dataFile(info);
  if (!file.exists) {
    return null;
  }

  try {
    const data = JSON.parse(file.textSync()) as ScheduleFeed;
    if (!Array.isArray(data.trips) || !Array.isArray(data.stops)) {
      return null;
    }
    const prepared = index(info, data);
    cache.set(info.id, prepared);
    return prepared;
  } catch {
    // Broken file: better to have no timetable for this operator than to blow
    // up the whole panel.
    return null;
  }
}

/** All the stored timetables, already prepared. */
function loadedFeeds(): IndexedFeed[] {
  const open: IndexedFeed[] = [];
  for (const info of installedFeeds()) {
    const feed = loadFeed(info);
    if (feed) {
      open.push(feed);
    }
  }
  return open;
}

// --- Date arithmetic ------------------------------------------------------------

/** A date as YYYYMMDD, in the phone's time zone. */
function ymd(d: Date): string {
  return (
    `${d.getFullYear()}` +
    `${String(d.getMonth() + 1).padStart(2, '0')}` +
    `${String(d.getDate()).padStart(2, '0')}`
  );
}

/**
 * When, in seconds since 1970, a call on a service day happens.
 *
 * The minutes can go past 1440 — `1505` is five past one the next morning,
 * still counted as the previous day's service. `Date` normalises that on its
 * own, **and the minutes are handed to it on purpose instead of adding seconds
 * to midnight**: that way the day the clocks change stays right.
 */
function unixAt(day: string, minutes: number): number {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(4, 6)) - 1;
  const dayOfMonth = Number(day.slice(6, 8));
  return new Date(year, month, dayOfMonth, 0, minutes, 0, 0).getTime() / 1000;
}

/**
 * The service days to consider for a given moment.
 *
 * There are three: yesterday, today and tomorrow. **Yesterday comes in because
 * of the trips that go past midnight** — at 00:30 the train one wants to catch
 * is still yesterday's service. And tomorrow comes in for the symmetric reason:
 * at 23:50 what leaves right after already matters.
 */
function candidateDays(now: Date): string[] {
  const days: string[] = [];
  for (let offset = -1; offset <= 1; offset += 1) {
    days.push(ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)));
  }
  return days;
}

/** Whether this operator's timetable has expired by this date. */
export function isExpired(info: ScheduleFeedInfo, now = new Date()): boolean {
  return typeof info.fim === 'string' && info.fim.length === 8 && ymd(now) > info.fim;
}

// --- Questions -------------------------------------------------------------------

/** An expected departure at a station. */
export interface ScheduleDeparture {
  /** Identifies this departure in the list. */
  key: string;
  /** Which operator. */
  operator: string;
  /** Train, metro, light rail or ferry. */
  kind: string;
  /** At which station. */
  station: string;
  /** The line's name, as the operator calls it. */
  line: string;
  /** Where it is going. */
  destination: string;
  /** How many minutes to go. */
  minutes: number;
  /** The time it departs, as `HH:MM`. */
  time: string;
}

/** `HH:MM` from seconds since 1970. */
function clockOf(unix: number): string {
  const d = new Date(unix * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** A timetable's stations within a certain distance of a point. */
function stopsNear(
  feed: IndexedFeed,
  origin: Coordinates,
  maxMeters: number,
): Map<number, number> {
  const near = new Map<number, number>();

  feed.data.stops.forEach((stop, i) => {
    const meters = distanceMeters(origin, { latitude: stop.y, longitude: stop.x });
    if (meters <= maxMeters) {
      near.set(i, meters);
    }
  });

  return near;
}

/**
 * The station **nearest** to a point, in one timetable — and only that one.
 *
 * It is what is used for the departure times, and the difference from taking
 * every station inside a radius matters:
 *
 * - **A tight radius fails.** The locations come from the Carris API and the
 *   times from the operator's GTFS, and the two points for the same station do
 *   not coincide. With a 400-metre radius, Cascais was left out by thirty
 *   metres — seen in the real data, not in theory.
 * - **A wide radius lies.** Lisbon's metro stations are about five hundred
 *   metres apart; widening the radius put Marquês's trains at Rotunda.
 *
 * Keeping the nearest one solves both: the distance can be generous without
 * ever mixing up two stations. And since it is done per timetable, at an
 * interchange like Oriente the train comes from CP's file and the metro from
 * the Metro's, each with its own station — which is exactly what one wants to
 * see.
 */
function nearestStop(
  feed: IndexedFeed,
  origin: Coordinates,
  maxMeters: number,
): { index: number; meters: number } | null {
  let best: { index: number; meters: number } | null = null;

  feed.data.stops.forEach((stop, i) => {
    const meters = distanceMeters(origin, { latitude: stop.y, longitude: stop.x });
    if (meters <= maxMeters && (!best || meters < best.meters)) {
      best = { index: i, meters };
    }
  });

  return best;
}

/**
 * The line's name, shortened to fit on screen.
 *
 * CP writes `Linha de Sintra` and `Linha da Azambuja` in the short name — which
 * is anything but short, and does not fit in the label next to the
 * destination. The "Linha de" ("Line of") is removed, leaving "Sintra" and
 * "Azambuja": what everyone calls them.
 *
 * The other names are already codes (`AP`, `IC`, `IR`, `R`, `U`) and stay as
 * they are.
 */
function shortLine(name: string): string {
  return name.replace(/^Linha\s+d[eoa]s?\s+/i, '');
}

/**
 * The next departures at a station.
 *
 * It takes coordinates and not a name: the stations come from the Carris API
 * (the locations) and the timetables from each operator's GTFS, which are two
 * different sources and write names in different ways. **Comparing by
 * proximity is much safer than comparing names** — "Lisboa Oriente" and
 * "Oriente" are the same station, and no text comparison gets that right
 * without inventing rules.
 *
 * See `nearestStop` for why only the nearest station of each timetable is
 * used.
 */
export function departuresNear(
  origin: Coordinates,
  maxMeters = 900,
  limit = 8,
  now = new Date(),
): ScheduleDeparture[] {
  const nowUnix = now.getTime() / 1000;
  const days = candidateDays(now);
  const departures: ScheduleDeparture[] = [];

  for (const feed of loadedFeeds()) {
    // Bus timetables answer at their own stops (`departuresAtStop`): their
    // nearest stop to a metro station would put buses in the station's list.
    if (isExpired(feed.info, now) || feed.info.kind === 'bus') {
      continue;
    }

    const nearest = nearestStop(feed, origin, maxMeters);
    if (!nearest) {
      continue;
    }

    departures.push(...departuresFrom(feed, nearest.index, days, nowUnix));
  }

  return departures.sort((a, b) => a.minutes - b.minutes).slice(0, limit);
}

/**
 * The stops of the timetable-only bus operators inside a map area — Carris de
 * Lisboa, Braga's TUB — as stations, so the transport map can draw them and a
 * tap can open their times (author's request, November 2026: "for the
 * companies without live data, just put the timetables"). Their id says which
 * file and which stop (`sched:<feed>:<index>`), read back by
 * `departuresAtStop`. Carris Metropolitana is left out: it has real time —
 * except offline (`withLive`), when its stored timetable is all there is.
 */
export function scheduledBusStops(
  bounds: { west: number; south: number; east: number; north: number },
  limit = 300,
  withLive = false,
): TransitStation[] {
  const found: TransitStation[] = [];
  for (const feed of loadedFeeds()) {
    if (feed.info.kind !== 'bus' || isExpired(feed.info)) {
      continue;
    }
    // Carris Metropolitana's own stops come live from its API; its stored
    // timetable stands in for them only offline (`withLive`).
    if (feed.info.naApp === false && !withLive) {
      continue;
    }
    feed.data.stops.forEach((stop, i) => {
      if (
        found.length < limit &&
        stop.x >= bounds.west &&
        stop.x <= bounds.east &&
        stop.y >= bounds.south &&
        stop.y <= bounds.north
      ) {
        found.push({
          id: `sched:${feed.info.id}:${i}`,
          kind: 'bus',
          name: stop.n,
          locality: feed.info.nome,
          coordinates: { latitude: stop.y, longitude: stop.x },
          stopIds: [],
          meters: 0,
        });
      }
    });
  }
  return found;
}

/**
 * The stored buses at a stop given by its place — Carris Metropolitana's own
 * timetable for one of its live stops, when the network is gone (author's
 * request: "the ones with live times lose them offline"). The nearest stop of
 * each bus timetable within `maxMeters`.
 */
export function busDeparturesNear(
  point: Coordinates,
  maxMeters = 60,
  limit = 8,
  now = new Date(),
): ScheduleDeparture[] {
  const out: ScheduleDeparture[] = [];
  for (const feed of loadedFeeds()) {
    if (feed.info.kind !== 'bus' || isExpired(feed.info, now)) {
      continue;
    }
    const nearest = nearestStop(feed, point, maxMeters);
    if (nearest) {
      out.push(...departuresFrom(feed, nearest.index, candidateDays(now), now.getTime() / 1000));
    }
  }
  return out.sort((a, b) => a.minutes - b.minutes).slice(0, limit);
}

/** The next departures at one stop of a stored timetable, by its `sched:` id. */
export function departuresAtStop(
  stationId: string,
  limit = 8,
  now = new Date(),
): ScheduleDeparture[] {
  const m = /^sched:(.+):(\d+)$/.exec(stationId);
  if (!m) {
    return [];
  }
  const info = installedFeeds().find((f) => f.id === m[1]);
  const feed = info ? loadFeed(info) : null;
  if (!feed || isExpired(feed.info, now)) {
    return [];
  }
  return departuresFrom(feed, Number(m[2]), candidateDays(now), now.getTime() / 1000)
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, limit);
}

/** A stop's departures in the next two hours, over the given service days. */
function departuresFrom(
  feed: IndexedFeed,
  station: number,
  days: string[],
  nowUnix: number,
): ScheduleDeparture[] {
  const departures: ScheduleDeparture[] = [];
  for (const { trip, pos } of feed.byStation.get(station) ?? []) {
    const scheduled = feed.data.trips[trip];
    const minute = feed.minutes[trip]?.[pos];
    if (minute === undefined) {
      continue;
    }
    // A trip's last station is not a departure — it is the end of the line.
    if (pos >= (feed.data.patterns[scheduled.p]?.length ?? 0) - 1) {
      continue;
    }
    for (const day of days) {
      if (!feed.days[scheduled.s]?.has(day)) {
        continue;
      }
      const when = unixAt(day, minute);
      const minutesLeft = Math.round((when - nowUnix) / 60);
      if (minutesLeft < 0 || minutesLeft > 120) {
        continue;
      }
      departures.push({
        key: `${feed.info.id}-${trip}-${day}`,
        operator: feed.info.nome,
        kind: feed.info.kind,
        station: feed.data.stops[station]?.n ?? '',
        line: shortLine(feed.data.routes[scheduled.r]?.[0] || feed.info.nome),
        destination: feed.data.headsigns[scheduled.h] ?? '',
        minutes: minutesLeft,
        time: clockOf(when),
      });
    }
  }
  return departures;
}

/** How many seconds it takes to walk this distance, counting the way round the blocks. */
function walkSeconds(meters: number): number {
  return (meters * WALK_DETOUR) / WALK_SPEED_MS;
}

/** A station, in the shape the rest of the app already knows how to show. */
function asStop(feed: IndexedFeed, station: number, meters: number): TransitStop {
  const stop = feed.data.stops[station];
  return {
    id: `${feed.info.id}:${station}`,
    name: stop?.n ?? '',
    locality: feed.info.nome,
    coordinates: { latitude: stop?.y ?? 0, longitude: stop?.x ?? 0 },
    lines: [],
    connections: [],
    patterns: [],
    meters,
  };
}

/**
 * Train, metro or ferry trips between two points.
 *
 * The same idea as `planBusTrips`, and simpler to do: here the whole trip is
 * written in the file, with the stations it calls at and in what order. There
 * is no need to cross-match departures from different stops looking for the
 * same trip — it is enough to look for the trips that call at a departure
 * station and, **further along the same route**, at an arrival station.
 *
 * Still **without changes**, for the usual reason: a badly done trip with a
 * change is worse than none at all.
 */
export function planScheduledTrips(
  origin: Coordinates,
  destination: Coordinates,
  limit = 4,
  now = new Date(),
): TransitTrip[] {
  const nowUnix = now.getTime() / 1000;
  const days = candidateDays(now);
  const trips: TransitTrip[] = [];

  for (const feed of loadedFeeds()) {
    if (isExpired(feed.info, now)) {
      continue;
    }

    const departures = stopsNear(feed, origin, TRANSIT_WALK_MAX_M);
    const arrivals = stopsNear(feed, destination, TRANSIT_WALK_MAX_M);
    if (departures.size === 0 || arrivals.size === 0) {
      continue;
    }

    // The trips that call at some departure station within reach. **Every**
    // position where one can board is kept, not just the first: the best may
    // not be the first, and the comparison is what decides.
    const candidates = new Map<number, number[]>();
    for (const station of departures.keys()) {
      for (const { trip, pos } of feed.byStation.get(station) ?? []) {
        const list = candidates.get(trip);
        if (list) {
          list.push(pos);
        } else {
          candidates.set(trip, [pos]);
        }
      }
    }

    for (const [trip, boardings] of candidates) {
      const scheduled = feed.data.trips[trip];
      const pattern = feed.data.patterns[scheduled.p] ?? [];
      const times = feed.minutes[trip] ?? [];

      for (const day of days) {
        if (!feed.days[scheduled.s]?.has(day)) {
          continue;
        }

        /**
         * The best way to make this trip on this day.
         *
         * **It is chosen by arrival time at the destination, not by the order
         * of the route.** The first version kept the first departure station
         * within walking distance, and in the real data it was caught getting
         * off at Portela de Sintra — 831 metres from the destination — when the
         * same train stopped at Sintra next, four metres away. It reached the
         * station earlier and the place later.
         */
        let best: TransitTrip | null = null;

        for (const boardPos of boardings) {
          const boardStation = pattern[boardPos];
          const walk = walkSeconds(departures.get(boardStation) ?? 0);
          const departs = unixAt(day, times[boardPos]);
          const leaveAt = departs - walk;

          // A minute's slack, for someone already at the station door. And
          // nothing beyond four hours: that is no longer waiting for the train.
          if (leaveAt < nowUnix - 60 || departs - nowUnix > 4 * 3600) {
            continue;
          }

          // Getting off has to come after boarding on the same route. That is
          // what prevents a trip in the opposite direction: the line calls at
          // both stations, but in the wrong order for someone going this way.
          for (let pos = boardPos + 1; pos < pattern.length; pos += 1) {
            const walkAtEnd = arrivals.get(pattern[pos]);
            if (walkAtEnd === undefined) {
              continue;
            }

            const arrives = unixAt(day, times[pos]);
            const reachAt = arrives + walkSeconds(walkAtEnd);
            if (best && reachAt >= best.reachAt) {
              continue;
            }

            best = {
              tripId: `${feed.info.id}:${trip}:${day}`,
              kind: feed.info.kind,
              line: shortLine(feed.data.routes[scheduled.r]?.[0] || feed.info.nome),
              headsign: feed.data.headsigns[scheduled.h] ?? '',
              from: asStop(feed, boardStation, departures.get(boardStation) ?? 0),
              to: asStop(feed, pattern[pos], walkAtEnd),
              departsAt: departs,
              arrivesAt: arrives,
              leaveAt,
              reachAt,
              stops: pos - boardPos,
              // Never. This is the timetable, not the train moving.
              live: false,
              ride: {
                source: 'schedule',
                feedId: feed.info.id,
                trip,
                fromPos: boardPos,
                toPos: pos,
              },
            };
          }
        }

        if (best) {
          trips.push(best);
        }
      }
    }
  }

  // Arrives earliest first, and each line appears once: the next three trains
  // on the same line are not three options, they are the same option.
  const byLine = new Map<string, TransitTrip>();
  for (const t of trips.sort((a, b) => a.reachAt - b.reachAt)) {
    if (!byLine.has(t.line)) {
      byLine.set(t.line, t);
    }
  }

  return [...byLine.values()].slice(0, limit);
}

/** Minimum time to change trains: off one, along the platform or corridor, onto the next. */
const SCHEDULED_TRANSFER_MIN_S = 180;
/**
 * How far apart the two stations of a change may be. Interchanges are often
 * two stations of different operators — the CP and metro stops at Cais do
 * Sodré or Oriente are a couple of hundred metres apart in the data.
 */
const SCHEDULED_TRANSFER_WALK_M = 300;
/** How far ahead a first leg may leave; beyond this it is not "the next trip". */
const SCHEDULED_HORIZON_S = 2 * 3600;

/** A station reached by a first leg, at the earliest time found. */
interface Reached {
  feed: IndexedFeed;
  station: number;
  arrives: number;
  leg: TransitTrip;
  /** The first leg's route, so the second is never the same line. */
  route: string;
}

/**
 * Every station a trip from near `origin` reaches within `SCHEDULED_HORIZON_S`,
 * with the earliest arrival and the leg that gets there — the first half of a
 * trip with a change, by rail or by bus (`scheduledReachedFrom`).
 */
function reachFrom(
  feeds: IndexedFeed[],
  origin: Coordinates,
  nowUnix: number,
  days: string[],
): Map<string, Reached> {
  const routeKey = (feed: IndexedFeed, trip: number) =>
    `${feed.info.id}:${feed.data.trips[trip].r}`;
  const lineOf = (feed: IndexedFeed, trip: number) =>
    shortLine(feed.data.routes[feed.data.trips[trip].r]?.[0] || feed.info.nome);
  const reached = new Map<string, Reached>();
  for (const feed of feeds) {
    const departures = stopsNear(feed, origin, TRANSIT_WALK_MAX_M);
    for (const [station, meters] of departures) {
      const walk = walkSeconds(meters);
      for (const { trip, pos } of feed.byStation.get(station) ?? []) {
        const scheduled = feed.data.trips[trip];
        const pattern = feed.data.patterns[scheduled.p] ?? [];
        const times = feed.minutes[trip] ?? [];
        if (pos >= pattern.length - 1) {
          continue;
        }
        for (const day of days) {
          if (!feed.days[scheduled.s]?.has(day)) {
            continue;
          }
          const departs = unixAt(day, times[pos]);
          const leaveAt = departs - walk;
          if (leaveAt < nowUnix - 60 || departs - nowUnix > SCHEDULED_HORIZON_S) {
            continue;
          }
          for (let next = pos + 1; next < pattern.length; next += 1) {
            const arrives = unixAt(day, times[next]);
            const key = `${feed.info.id}:${pattern[next]}`;
            const known = reached.get(key);
            if (known && known.arrives <= arrives) {
              continue;
            }
            reached.set(key, {
              feed,
              station: pattern[next],
              arrives,
              route: routeKey(feed, trip),
              leg: {
                tripId: `${feed.info.id}:${trip}:${day}`,
                kind: feed.info.kind,
                line: lineOf(feed, trip),
                headsign: feed.data.headsigns[scheduled.h] ?? '',
                from: asStop(feed, station, meters),
                to: asStop(feed, pattern[next], 0),
                departsAt: departs,
                arrivesAt: arrives,
                leaveAt,
                reachAt: arrives,
                stops: next - pos,
                live: false,
                ride: {
                  source: 'schedule',
                  feedId: feed.info.id,
                  trip,
                  fromPos: pos,
                  toPos: next,
                },
              },
            });
          }
        }
      }
    }
  }
  return reached;
}

/**
 * Train, metro or ferry trips with **one change** — Azul to Verde, metro to
 * train, train to ferry.
 *
 * Without this the metro alone answered almost nothing: most journeys in
 * Lisbon need a change of line, and the panel said "no connection".
 *
 * Everything is in the stored files, so no request is made:
 *
 * 1. From every station within walking distance of the origin, every trip
 *    leaving in the next two hours is followed, and each later station keeps
 *    the earliest arrival (`reached`).
 * 2. Every trip that calls near the destination is marked, with where.
 * 3. For each reached station, the stations within
 *    `SCHEDULED_TRANSFER_WALK_M` — of any operator — are second boarding
 *    points: the first marked trip leaving at least `SCHEDULED_TRANSFER_MIN_S`
 *    plus the walk later, on another line, gives the arrival.
 *
 * It finds the earliest arrival through each change station, which is what
 * someone would pick; it does not try every combination.
 */
export function planScheduledTransfers(
  origin: Coordinates,
  destination: Coordinates,
  limit = 4,
  now = new Date(),
): TransitTrip[] {
  const nowUnix = now.getTime() / 1000;
  const days = candidateDays(now);
  const feeds = loadedFeeds().filter((f) => !isExpired(f.info, now));
  if (feeds.length === 0) {
    return [];
  }

  const routeKey = (feed: IndexedFeed, trip: number) =>
    `${feed.info.id}:${feed.data.trips[trip].r}`;
  const lineOf = (feed: IndexedFeed, trip: number) =>
    shortLine(feed.data.routes[feed.data.trips[trip].r]?.[0] || feed.info.nome);

  // 1. Where the first legs can take us, and when.
  const reached = reachFrom(feeds, origin, nowUnix, days);
  if (reached.size === 0) {
    return [];
  }

  // 2. The trips that call near the destination, and where (position, walk).
  const ending = new Map<IndexedFeed, Map<number, { pos: number; meters: number }[]>>();
  for (const feed of feeds) {
    const arrivals = stopsNear(feed, destination, TRANSIT_WALK_MAX_M);
    if (arrivals.size === 0) {
      continue;
    }
    const byTrip = new Map<number, { pos: number; meters: number }[]>();
    for (const [station, meters] of arrivals) {
      for (const { trip, pos } of feed.byStation.get(station) ?? []) {
        const list = byTrip.get(trip);
        if (list) {
          list.push({ pos, meters });
        } else {
          byTrip.set(trip, [{ pos, meters }]);
        }
      }
    }
    ending.set(feed, byTrip);
  }
  if (ending.size === 0) {
    return [];
  }

  // Every station of the feeds that end near the destination, for the
  // proximity search of step 3. A few hundred at most: a plain list will do.
  const boardable: { feed: IndexedFeed; station: number; y: number; x: number }[] = [];
  for (const feed of ending.keys()) {
    feed.data.stops.forEach((stop, station) => {
      if (feed.byStation.has(station)) {
        boardable.push({ feed, station, y: stop.y, x: stop.x });
      }
    });
  }

  // 3. Join a first leg to a second one at each reached station.
  const results: TransitTrip[] = [];
  for (const r of reached.values()) {
    const at = r.feed.data.stops[r.station];
    if (!at) {
      continue;
    }
    // A change at a station already near the destination is no change at all:
    // walking is better, and the direct planner covers riding on.
    if (
      distanceMeters(destination, { latitude: at.y, longitude: at.x }) <= TRANSIT_WALK_MAX_M
    ) {
      continue;
    }

    let best: TransitTrip | null = null;
    for (const b of boardable) {
      const walkMeters =
        b.feed === r.feed && b.station === r.station
          ? 0
          : distanceMeters({ latitude: at.y, longitude: at.x }, { latitude: b.y, longitude: b.x });
      if (walkMeters > SCHEDULED_TRANSFER_WALK_M) {
        continue;
      }
      const earliest = r.arrives + SCHEDULED_TRANSFER_MIN_S + walkSeconds(walkMeters);
      const byTrip = ending.get(b.feed)!;

      for (const { trip, pos } of b.feed.byStation.get(b.station) ?? []) {
        const ends = byTrip.get(trip);
        if (!ends || routeKey(b.feed, trip) === r.route) {
          continue;
        }
        const scheduled = b.feed.data.trips[trip];
        const times = b.feed.minutes[trip] ?? [];
        const pattern = b.feed.data.patterns[scheduled.p] ?? [];
        for (const day of days) {
          if (!b.feed.days[scheduled.s]?.has(day)) {
            continue;
          }
          const departs = unixAt(day, times[pos]);
          if (departs < earliest || departs - earliest > TRANSFER_MAX_WAIT_S) {
            continue;
          }
          for (const end of ends) {
            if (end.pos <= pos) {
              continue;
            }
            const arrives = unixAt(day, times[end.pos]);
            const reachAt = arrives + walkSeconds(end.meters);
            if (best && reachAt >= best.reachAt) {
              continue;
            }
            best = {
              ...r.leg,
              tripId: `${r.leg.tripId}>${b.feed.info.id}:${trip}:${day}`,
              to: asStop(b.feed, pattern[end.pos], end.meters),
              arrivesAt: arrives,
              reachAt,
              stops: r.leg.stops + (end.pos - pos),
              change: {
                at: asStop(r.feed, r.station, 0),
                boardAt: asStop(b.feed, b.station, 0),
                walkMeters,
                arrivesAt: r.arrives,
                kind: b.feed.info.kind,
                line: lineOf(b.feed, trip),
                headsign: b.feed.data.headsigns[scheduled.h] ?? '',
                departsAt: departs,
                ride: {
                  source: 'schedule',
                  feedId: b.feed.info.id,
                  trip,
                  fromPos: pos,
                  toPos: end.pos,
                },
              },
            };
          }
        }
      }
    }
    if (best) {
      results.push(best);
    }
  }

  // Earliest first, and each pair of lines once.
  const byPair = new Map<string, TransitTrip>();
  for (const trip of results.sort((a, b) => a.reachAt - b.reachAt)) {
    const key = `${trip.line}>${trip.change?.line}`;
    if (!byPair.has(key)) {
      byPair.set(key, trip);
    }
  }
  return [...byPair.values()].slice(0, limit);
}

// --- The timetable half of a bus + rail trip ------------------------------------
//
// See "Bus and rail in one trip" in `transit.ts`: the bus half comes from there,
// these give the half that runs on a stored timetable, and `transitPlan.ts` joins
// them.

/** A station of a stored timetable. */
export interface StationRef {
  feedId: string;
  station: number;
}

/**
 * The stations from which some trip calls near the destination later on —
 * where a bus could leave someone to take the metro, a train or a Carris de
 * Lisboa bus the rest of the way. Timeless: whether one runs in time is
 * `scheduledOnward`'s question. Stations already near the destination are left
 * out: from there one walks.
 */
export function scheduledBoardingsTo(destination: Coordinates): {
  points: RailPoint[];
  refs: StationRef[];
} {
  const points: RailPoint[] = [];
  const refs: StationRef[] = [];
  for (const feed of loadedFeeds()) {
    if (isExpired(feed.info)) {
      continue;
    }
    const seen = new Set<number>();
    for (const station of stopsNear(feed, destination, TRANSIT_WALK_MAX_M).keys()) {
      for (const { trip, pos } of feed.byStation.get(station) ?? []) {
        const pattern = feed.data.patterns[feed.data.trips[trip].p] ?? [];
        for (let i = 0; i < pos; i += 1) {
          seen.add(pattern[i]);
        }
      }
    }
    for (const station of seen) {
      const stop = feed.data.stops[station];
      if (!stop) {
        continue;
      }
      const at = { latitude: stop.y, longitude: stop.x };
      if (distanceMeters(at, destination) <= TRANSIT_WALK_MAX_M) {
        continue;
      }
      points.push({ coordinates: at });
      refs.push({ feedId: feed.info.id, station });
    }
  }
  return { points, refs };
}

/**
 * For each request — a station and the earliest moment one can be on its
 * platform — the trip from there that gets nearest the destination soonest,
 * leaving within `TRANSFER_MAX_WAIT_S`. Null where none does.
 */
export function scheduledOnward(
  requests: { ref: StationRef; earliest: number }[],
  destination: Coordinates,
  now = new Date(),
): (TransitTrip | null)[] {
  const days = candidateDays(now);
  const feeds = new Map(loadedFeeds().map((f) => [f.info.id, f]));
  const endsByFeed = new Map<string, Map<number, number>>();
  return requests.map(({ ref, earliest }) => {
    const feed = feeds.get(ref.feedId);
    if (!feed || isExpired(feed.info, now)) {
      return null;
    }
    let ends = endsByFeed.get(ref.feedId);
    if (!ends) {
      ends = stopsNear(feed, destination, TRANSIT_WALK_MAX_M);
      endsByFeed.set(ref.feedId, ends);
    }
    let best: TransitTrip | null = null;
    for (const { trip, pos } of feed.byStation.get(ref.station) ?? []) {
      const scheduled = feed.data.trips[trip];
      const pattern = feed.data.patterns[scheduled.p] ?? [];
      const times = feed.minutes[trip] ?? [];
      for (const day of days) {
        if (!feed.days[scheduled.s]?.has(day)) {
          continue;
        }
        const departs = unixAt(day, times[pos]);
        if (departs < earliest || departs - earliest > TRANSFER_MAX_WAIT_S) {
          continue;
        }
        for (let next = pos + 1; next < pattern.length; next += 1) {
          const walkAtEnd = ends.get(pattern[next]);
          if (walkAtEnd === undefined) {
            continue;
          }
          const arrives = unixAt(day, times[next]);
          const reachAt = arrives + walkSeconds(walkAtEnd);
          if (best && reachAt >= best.reachAt) {
            continue;
          }
          best = {
            tripId: `${feed.info.id}:${trip}:${day}`,
            kind: feed.info.kind,
            line: shortLine(feed.data.routes[scheduled.r]?.[0] || feed.info.nome),
            headsign: feed.data.headsigns[scheduled.h] ?? '',
            from: asStop(feed, ref.station, 0),
            to: asStop(feed, pattern[next], walkAtEnd),
            departsAt: departs,
            arrivesAt: arrives,
            leaveAt: departs,
            reachAt,
            stops: next - pos,
            live: false,
            ride: { source: 'schedule', feedId: feed.info.id, trip, fromPos: pos, toPos: next },
          };
        }
      }
    }
    return best;
  });
}

/**
 * Where a train, metro, ferry or Carris de Lisboa bus from near the origin
 * gets to, and when — the first half of "the metro, then a bus". Stations
 * already near the destination are left out: from there one walks.
 */
export function scheduledReachedFrom(
  origin: Coordinates,
  destination: Coordinates,
  now = new Date(),
): { points: RailPoint[]; legs: TransitTrip[] } {
  const feeds = loadedFeeds().filter((f) => !isExpired(f.info, now));
  const reached = reachFrom(feeds, origin, now.getTime() / 1000, candidateDays(now));
  const points: RailPoint[] = [];
  const legs: TransitTrip[] = [];
  for (const r of reached.values()) {
    const stop = r.feed.data.stops[r.station];
    if (!stop) {
      continue;
    }
    const at = { latitude: stop.y, longitude: stop.x };
    if (distanceMeters(at, destination) <= TRANSIT_WALK_MAX_M) {
      continue;
    }
    points.push({ coordinates: at, arrives: r.arrives });
    legs.push(r.leg);
  }
  return { points, legs };
}

/**
 * A stored-timetable ride's stations, boarding and alighting included, with
 * the timetable's time at each — counted from the ride's own departure, so
 * the minutes between stations are the timetable's. Empty when the feed is no
 * longer on the phone.
 */
export function scheduledRide(
  ref: Extract<RideRef, { source: 'schedule' }>,
  departsAt: number,
): RideStop[] {
  const feed = loadedFeeds().find((f) => f.info.id === ref.feedId);
  const scheduled = feed?.data.trips[ref.trip];
  if (!feed || !scheduled) {
    return [];
  }
  const pattern = feed.data.patterns[scheduled.p] ?? [];
  const times = feed.minutes[ref.trip] ?? [];
  const out: RideStop[] = [];
  for (let pos = ref.fromPos; pos <= ref.toPos && pos < pattern.length; pos += 1) {
    const stop = asStop(feed, pattern[pos], 0);
    out.push({
      id: stop.id,
      name: stop.name,
      coordinates: stop.coordinates,
      unix: departsAt + (times[pos] - times[ref.fromPos]) * 60,
    });
  }
  return out;
}

/** Whether some stored timetable covers this point. */
export function hasCoverage(point: Coordinates): boolean {
  return loadedFeeds().some((feed) => {
    const [west, south, east, north] = feed.data.bbox ?? [0, 0, 0, 0];
    return (
      point.longitude >= west &&
      point.longitude <= east &&
      point.latitude >= south &&
      point.latitude <= north
    );
  });
}

/**
 * Areas already checked this session (half a degree, about 50 km), so the
 * published list is asked for once per area. It was one latch for the whole
 * session: the first place checked was the only one, and planning a trip
 * somewhere else never fetched that area's timetables.
 */
const autoChecked = new Map<string, Promise<void>>();

/**
 * Fetches, on its own, the timetables that cover this point and are missing,
 * expired or older than the published ones.
 *
 * **Asking people to go to Settings to download a timetable meant the metro
 * "did not exist"** until they did — and nothing on the transport map said
 * so. The files are small (the Metro Sul do Tejo is under 100 KB, CP under
 * 1 MB), so they are fetched when the transport map is opened over an area
 * they cover. Once per session; failing is silent and the next session tries
 * again. Returns whether anything new arrived.
 */
export async function ensureFeedsFor(point: Coordinates): Promise<boolean> {
  const area = `${Math.round(point.latitude * 2)},${Math.round(point.longitude * 2)}`;
  const before = autoChecked.get(area);
  if (before) {
    await before;
    return false;
  }
  let changed = false;
  const check = (async () => {
    try {
      const published = await listFeeds();
      const stored = new Map(installedFeeds().map((f) => [f.id, f]));
      for (const info of published) {
        const [west, south, east, north] = info.bbox ?? [0, 0, 0, 0];
        // A margin of about ten kilometres: the station that matters may be
        // just outside the operator's box.
        const m = 0.1;
        const covers =
          point.longitude >= west - m &&
          point.longitude <= east + m &&
          point.latitude >= south - m &&
          point.latitude <= north + m;
        if (!covers) {
          continue;
        }
        // Never by itself: what is only offered on request (Carris
        // Metropolitana, 27 MB, which has real time anyway).
        if (info.naApp === false) {
          continue;
        }
        const old = stored.get(info.id);
        const needed = !old || !isInstalled(old) || isExpired(old) || info.gerado > old.gerado;
        if (!needed) {
          continue;
        }
        try {
          await downloadFeed(info);
          changed = true;
        } catch {
          // One operator failing does not stop the others.
        }
      }
    } catch {
      // No list, no network: nothing to do now.
    }
  })();
  autoChecked.set(area, check);
  await check;
  return changed;
}

// --- Several changes: RAPTOR over the stored timetables -------------------------
//
// The author asked whether a trip could take several changes (November 2026):
// Odivelas → Cascais, or Caparica → a Lisbon street by bus, metro and tram. The
// one-change planners above stop at one. This is RAPTOR (Delling, Pajor and
// Werneck, "Round-Based Public Transit Routing", 2012) in its simplest form:
// round k holds the earliest arrival at every station using k vehicles; each
// round rides every trip boardable from the stations the last one improved,
// then walks to stations within `SCHEDULED_TRANSFER_WALK_M`. All on the phone,
// no request, over every stored timetable at once — metro, CP, Fertagus,
// ferries, MTS, Carris de Lisboa, and Carris Metropolitana when downloaded.

/** At most this many vehicles in one trip (three changes). */
const RAPTOR_MAX_RIDES = 4;

/** A label's origin: ridden here from `board`, or walked here from `from`. */
type RaptorParent =
  | { type: 'ride'; feed: IndexedFeed; trip: number; boardPos: number; alightPos: number; board: number; departs: number }
  | { type: 'walk'; from: number; meters: number };

interface RaptorNetwork {
  feeds: IndexedFeed[];
  /** Global station id = `offset[feed] + station`. */
  offset: Map<IndexedFeed, number>;
  feedOf: IndexedFeed[];
  stationOf: Int32Array;
  lat: Float64Array;
  lon: Float64Array;
  /** Stations within `SCHEDULED_TRANSFER_WALK_M`, with the distance. */
  near: { to: number; meters: number }[][];
}

let network: { key: string; net: RaptorNetwork } | null = null;

/** A station's calls sorted by minute, so a time window is a binary search. */
const sortedCalls = new WeakMap<IndexedFeed, Map<number, { trip: number; pos: number; min: number }[]>>();
function callsByMinute(feed: IndexedFeed, station: number) {
  let byStation = sortedCalls.get(feed);
  if (!byStation) {
    byStation = new Map();
    sortedCalls.set(feed, byStation);
  }
  let list = byStation.get(station);
  if (!list) {
    list = (feed.byStation.get(station) ?? [])
      .map(({ trip, pos }) => ({ trip, pos, min: feed.minutes[trip]?.[pos] ?? 0 }))
      .sort((a, b) => a.min - b.min);
    byStation.set(station, list);
  }
  return list;
}

/** The stations of every stored feed in one numbering, with the walks between them. */
function raptorNetwork(feeds: IndexedFeed[]): RaptorNetwork {
  const key = feeds.map((f) => `${f.info.id}@${f.info.gerado}`).join('|');
  if (network?.key === key) {
    return network.net;
  }
  let total = 0;
  const offset = new Map<IndexedFeed, number>();
  for (const feed of feeds) {
    offset.set(feed, total);
    total += feed.data.stops.length;
  }
  const feedOf: IndexedFeed[] = new Array(total);
  const stationOf = new Int32Array(total);
  const lat = new Float64Array(total);
  const lon = new Float64Array(total);
  for (const feed of feeds) {
    const base = offset.get(feed)!;
    feed.data.stops.forEach((stop, i) => {
      feedOf[base + i] = feed;
      stationOf[base + i] = i;
      lat[base + i] = stop.y;
      lon[base + i] = stop.x;
    });
  }
  // A grid of about 300 m, so neighbours are found without comparing all pairs.
  const cell = (g: number) => `${Math.floor(lat[g] * 370)}:${Math.floor(lon[g] * 290)}`;
  const grid = new Map<string, number[]>();
  for (let g = 0; g < total; g += 1) {
    const k = cell(g);
    const list = grid.get(k);
    if (list) {
      list.push(g);
    } else {
      grid.set(k, [g]);
    }
  }
  const near: { to: number; meters: number }[][] = new Array(total);
  for (let g = 0; g < total; g += 1) {
    const la = Math.floor(lat[g] * 370);
    const lo = Math.floor(lon[g] * 290);
    const list: { to: number; meters: number }[] = [];
    for (let i = -1; i <= 1; i += 1) {
      for (let j = -1; j <= 1; j += 1) {
        for (const h of grid.get(`${la + i}:${lo + j}`) ?? []) {
          if (h === g) {
            continue;
          }
          const m = distanceMeters(
            { latitude: lat[g], longitude: lon[g] },
            { latitude: lat[h], longitude: lon[h] },
          );
          if (m <= SCHEDULED_TRANSFER_WALK_M) {
            list.push({ to: h, meters: m });
          }
        }
      }
    }
    near[g] = list;
  }
  const net = { feeds, offset, feedOf, stationOf, lat, lon, near };
  network = { key, net };
  return net;
}

/**
 * Trips with up to three changes, leaving from near `origin` at `departAt` or
 * later, over every stored timetable. One trip per number of vehicles, each
 * kept only when it arrives sooner than with fewer (the answer Maps gives:
 * fewer changes, or faster). Runs up to `runs` times, each from just after the
 * previous best departure, for later options too.
 */
export async function planScheduledRaptor(
  origin: Coordinates,
  destination: Coordinates,
  departAt: number,
  runs = 2,
): Promise<TransitTrip[]> {
  const now = new Date(departAt * 1000);
  const feeds = loadedFeeds().filter((f) => !isExpired(f.info, now));
  if (feeds.length === 0) {
    return [];
  }
  const net = raptorNetwork(feeds);
  const days = candidateDays(now);
  const out: TransitTrip[] = [];
  let from = departAt;
  for (let run = 0; run < runs; run += 1) {
    const found = await raptorOnce(net, origin, destination, from, days);
    if (found.length === 0) {
      break;
    }
    out.push(...found);
    from = Math.min(...found.map((t) => t.departsAt)) + 60;
  }
  return out;
}

/** Lets the screen draw: a long search must not freeze the app. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function raptorOnce(
  net: RaptorNetwork,
  origin: Coordinates,
  destination: Coordinates,
  t0: number,
  days: string[],
): Promise<TransitTrip[]> {
  const total = net.stationOf.length;
  const horizon = t0 + SCHEDULED_HORIZON_S;
  // `unixAt` builds a Date, and this asks it hundreds of thousands of times
  // for a few thousand distinct (day, minute) pairs: kept in a table.
  const clock = new Map<number, number>();
  const at = (dayIndex: number, minutes: number) => {
    const key = dayIndex * 10000 + minutes;
    let v = clock.get(key);
    if (v === undefined) {
      v = unixAt(days[dayIndex], minutes);
      clock.set(key, v);
    }
    return v;
  };
  const feedIndex = new Map(net.feeds.map((f, i) => [f, i]));

  // Round 0: walking from the origin.
  const access = new Map<number, number>();
  const egress = new Map<number, number>();
  for (const feed of net.feeds) {
    const base = net.offset.get(feed)!;
    for (const [s, m] of stopsNear(feed, origin, TRANSIT_WALK_MAX_M)) {
      access.set(base + s, m);
    }
    for (const [s, m] of stopsNear(feed, destination, TRANSIT_WALK_MAX_M)) {
      egress.set(base + s, m);
    }
  }
  if (access.size === 0 || egress.size === 0) {
    return [];
  }

  const best = new Float64Array(total).fill(Infinity);
  const rounds: Float64Array[] = [];
  const parents: Map<number, RaptorParent>[] = [];
  const round0 = new Float64Array(total).fill(Infinity);
  let marked = new Set<number>();
  for (const [g, m] of access) {
    round0[g] = t0 + walkSeconds(m);
    best[g] = round0[g];
    marked.add(g);
  }
  rounds.push(round0);
  parents.push(new Map());

  const results: TransitTrip[] = [];
  // Nothing slower than walking the whole way is wanted (`beatsWalking`), so
  // that is the bound from the start — it prunes most of a large network.
  let bestReach = t0 + walkSeconds(distanceMeters(origin, destination));

  for (let k = 1; k <= RAPTOR_MAX_RIDES && marked.size > 0; k += 1) {
    await breathe();
    const prev = rounds[k - 1];
    const cur = new Float64Array(prev);
    const par = new Map<number, RaptorParent>();
    const improved = new Set<number>();
    // Each (trip, day) scanned once, from its earliest boardable position.
    const boarded = new Map<number, number>();
    const boardings: { feed: IndexedFeed; trip: number; day: number; key: number; pos: number; board: number; departs: number }[] = [];

    for (const g of marked) {
      const feed = net.feedOf[g];
      const station = net.stationOf[g];
      const ready = prev[g] + (k > 1 ? SCHEDULED_TRANSFER_MIN_S : 0);
      const latest = k === 1 ? horizon : ready + TRANSFER_MAX_WAIT_S;
      const calls = callsByMinute(feed, station);
      for (let d = 0; d < days.length; d += 1) {
        // The window in this day's minutes, an hour wider each side for
        // clock changes; the exact check is below.
        const midnight = at(d, 0);
        const lo = Math.floor((ready - midnight) / 60) - 60;
        const hi = Math.ceil((latest - midnight) / 60) + 60;
        let a = 0;
        let z = calls.length;
        while (a < z) {
          const m = (a + z) >> 1;
          if (calls[m].min < lo) {
            a = m + 1;
          } else {
            z = m;
          }
        }
        for (let c = a; c < calls.length && calls[c].min <= hi; c += 1) {
          const { trip, pos, min } = calls[c];
          const scheduled = feed.data.trips[trip];
          if (!feed.days[scheduled.s]?.has(days[d])) {
            continue;
          }
          const pattern = feed.data.patterns[scheduled.p] ?? [];
          if (pos >= pattern.length - 1) {
            continue;
          }
          const departs = at(d, min);
          if (departs < ready || departs > latest) {
            continue;
          }
          const key = (feedIndex.get(feed)! * 2_000_000 + trip) * 4 + d;
          const before = boarded.get(key);
          if (before !== undefined && before <= pos) {
            continue;
          }
          boarded.set(key, pos);
          boardings.push({ feed, trip, day: d, key, pos, board: g, departs });
        }
      }
    }

    for (let n = 0; n < boardings.length; n += 1) {
      const b = boardings[n];
      if (n % 3000 === 2999) {
        await breathe();
      }
      if (boarded.get(b.key) !== b.pos) {
        continue;
      }
      const base = net.offset.get(b.feed)!;
      const scheduled = b.feed.data.trips[b.trip];
      const pattern = b.feed.data.patterns[scheduled.p] ?? [];
      const times = b.feed.minutes[b.trip] ?? [];
      for (let p = b.pos + 1; p < pattern.length; p += 1) {
        const g = base + pattern[p];
        const arrives = at(b.day, times[p]);
        if (arrives >= bestReach) {
          // Later stops of this trip only arrive later still.
          break;
        }
        if (arrives < cur[g] && arrives < best[g]) {
          cur[g] = arrives;
          best[g] = arrives;
          par.set(g, {
            type: 'ride',
            feed: b.feed,
            trip: b.trip,
            boardPos: b.pos,
            alightPos: p,
            board: b.board,
            departs: b.departs,
          });
          improved.add(g);
        }
      }
    }

    // Walks to nearby stations, from what this round reached by riding.
    const next = new Set<number>(improved);
    for (const g of improved) {
      for (const { to, meters } of net.near[g]) {
        const arrives = cur[g] + walkSeconds(meters);
        if (arrives < cur[to] && arrives < best[to]) {
          cur[to] = arrives;
          best[to] = arrives;
          par.set(to, { type: 'walk', from: g, meters });
          next.add(to);
        }
      }
    }
    rounds.push(cur);
    parents.push(par);
    marked = next;

    // The best way to the destination with k vehicles, if it beats fewer.
    let reach = Infinity;
    let end = -1;
    for (const [g, m] of egress) {
      if (!par.has(g)) {
        continue;
      }
      const r = cur[g] + walkSeconds(m);
      if (r < reach) {
        reach = r;
        end = g;
      }
    }
    if (end >= 0 && reach < bestReach - 120) {
      bestReach = reach;
      const trip = raptorJourney(net, parents, k, end, access, egress.get(end)!, reach);
      if (trip) {
        results.push(trip);
      }
    }
  }
  return results;
}

/** Walks the labels back from the destination's station and builds the trip. */
function raptorJourney(
  net: RaptorNetwork,
  parents: Map<number, RaptorParent>[],
  rounds: number,
  end: number,
  access: Map<number, number>,
  endWalk: number,
  reachAt: number,
): TransitTrip | null {
  type Ride = Extract<RaptorParent, { type: 'ride' }> & { alight: number; walkAfter: number };
  const rides: Ride[] = [];
  // Back from the destination: in each round the label was either ridden to
  // (`ride`) or walked to from a station ridden to in the same round (`walk`).
  // The boarding station of round k was improved in round k-1 (only those are
  // boarded from), so its label lives there — ridden, walked, or the origin's
  // walk in round 0.
  let g = end;
  for (let k = rounds; k >= 1; k -= 1) {
    let walkAfter = 0;
    let p = parents[k].get(g);
    if (p?.type === 'walk') {
      walkAfter = p.meters;
      g = p.from;
      p = parents[k].get(g);
    }
    if (!p || p.type !== 'ride') {
      return null;
    }
    rides.unshift({ ...p, alight: g, walkAfter });
    g = p.board;
  }
  const startMeters = access.get(g);
  if (startMeters === undefined) {
    return null;
  }

  const stopAt = (ride: Ride, pos: number, meters: number) => {
    const scheduled = ride.feed.data.trips[ride.trip];
    const pattern = ride.feed.data.patterns[scheduled.p] ?? [];
    return asStop(ride.feed, pattern[pos], meters);
  };
  const arrivalOf = (ride: Ride) => {
    const base = ride.departs;
    const times = ride.feed.minutes[ride.trip] ?? [];
    return base + (times[ride.alightPos] - times[ride.boardPos]) * 60;
  };
  const describe = (ride: Ride) => {
    const scheduled = ride.feed.data.trips[ride.trip];
    return {
      kind: ride.feed.info.kind,
      line: shortLine(ride.feed.data.routes[scheduled.r]?.[0] || ride.feed.info.nome),
      headsign: ride.feed.data.headsigns[scheduled.h] ?? '',
      ride: {
        source: 'schedule' as const,
        feedId: ride.feed.info.id,
        trip: ride.trip,
        fromPos: ride.boardPos,
        toPos: ride.alightPos,
      },
    };
  };

  const first = rides[0];
  const last = rides[rides.length - 1];
  const changes: TransitChange[] = rides.slice(1).map((ride, i) => {
    const prev = rides[i];
    const d = describe(ride);
    return {
      at: stopAt(prev, prev.alightPos, 0),
      boardAt: stopAt(ride, ride.boardPos, 0),
      walkMeters: prev.walkAfter,
      arrivesAt: arrivalOf(prev),
      kind: d.kind,
      line: d.line,
      headsign: d.headsign,
      departsAt: ride.departs,
      ride: d.ride,
    };
  });
  const d = describe(first);
  return {
    tripId: rides.map((r) => `${r.feed.info.id}:${r.trip}:${r.departs}`).join('>'),
    kind: d.kind,
    line: d.line,
    headsign: d.headsign,
    from: stopAt(first, first.boardPos, startMeters),
    // The walk from where one gets off: to a nearby station first, if any, and on.
    to: stopAt(last, last.alightPos, endWalk + last.walkAfter),
    departsAt: first.departs,
    arrivesAt: arrivalOf(last),
    leaveAt: first.departs - walkSeconds(startMeters),
    reachAt,
    stops: rides.reduce((n, r) => n + r.alightPos - r.boardPos, 0),
    live: false,
    ride: d.ride,
    ...(changes.length > 0 ? { changes } : {}),
  };
}
