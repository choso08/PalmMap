import axios from 'axios';

import { CARRIS_BASE_URL, REQUEST_TIMEOUT_MS, USER_AGENT } from './config';
import type { CarrisAlert, CarrisAlertText } from '../types/transit';

/**
 * Service alerts — strikes, diversions, works — from Carris Metropolitana's
 * open API (`/v2/alerts`, JSON, no key; ~57 KB for about sixty alerts, probed
 * 16 November 2026). TML's own alerts address, which answered in August, now
 * gives 404; Carris de Lisboa publishes none.
 *
 * Asked once every `ALERTS_TTL_MS` and kept: alerts last hours or months.
 */
const ALERTS_TTL_MS = 10 * 60 * 1000;

/** An alert ready for the screen. */
export interface ServiceAlert {
  id: string;
  title: string;
  description: string;
  /** Public line numbers it concerns (`1714`), without prefixes or directions. */
  lines: string[];
  /** Stop ids it names, if any. */
  stops: string[];
  /** GTFS-RT's effect: `DETOUR`, `REDUCED_SERVICE`, `NO_SERVICE`… */
  effect: string;
  /** When it ends, in seconds since 1970; null when open-ended. */
  until: number | null;
}

let cached: { at: number; alerts: ServiceAlert[] } | null = null;
let pending: Promise<ServiceAlert[]> | null = null;

/** The text in Portuguese (all of it is, today), else the first given. */
function textOf(value: CarrisAlertText | undefined): string {
  const list = value?.translation ?? [];
  return (list.find((x) => x.language === 'pt') ?? list[0])?.text?.trim() ?? '';
}

/** `[LA77N]1714_0` → `1714`: the number painted on the bus. */
function lineOfRoute(routeId: string): string {
  return routeId.replace(/^(\[[^\]]*\])+/, '').split('_')[0];
}

function prepare(raw: CarrisAlert, index: number, now: number): ServiceAlert | null {
  const periods = raw.active_period ?? [];
  const active =
    periods.length === 0 ||
    periods.some((p) => (p.start ?? 0) <= now && (p.end == null || p.end === 0 || p.end >= now));
  if (!active) {
    return null;
  }
  const title = textOf(raw.header_text);
  if (!title) {
    return null;
  }
  const entities = raw.informed_entity ?? [];
  const ends = periods.map((p) => p.end ?? 0).filter((e) => e > now);
  return {
    id: `${index}:${title}`,
    title,
    description: textOf(raw.description_text),
    lines: [...new Set(entities.map((e) => (e.route_id ? lineOfRoute(e.route_id) : '')).filter(Boolean))],
    stops: [...new Set(entities.map((e) => e.stop_id ?? '').filter(Boolean))],
    effect: raw.effect ?? '',
    until: ends.length ? Math.min(...ends) : null,
  };
}

/** The alerts in force now. Throws on a network failure, like the other services. */
export async function serviceAlerts(): Promise<ServiceAlert[]> {
  if (cached && Date.now() - cached.at < ALERTS_TTL_MS) {
    return cached.alerts;
  }
  if (!pending) {
    pending = axios
      .get<CarrisAlert[]>(`${CARRIS_BASE_URL}/alerts`, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: { 'User-Agent': USER_AGENT },
      })
      .then(({ data }) => {
        const now = Date.now() / 1000;
        const alerts = (Array.isArray(data) ? data : [])
          .map((a, i) => prepare(a, i, now))
          .filter((a): a is ServiceAlert => a !== null);
        cached = { at: Date.now(), alerts };
        return alerts;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** Those touching any of these lines or this stop. */
export function alertsFor(
  alerts: ServiceAlert[],
  lines: string[],
  stopId?: string | null,
): ServiceAlert[] {
  const wanted = new Set(lines.map((l) => l.trim()).filter(Boolean));
  return alerts.filter(
    (a) => a.lines.some((l) => wanted.has(l)) || (stopId != null && a.stops.includes(stopId)),
  );
}
