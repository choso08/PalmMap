import type { Coordinates } from '../types/geo';

/**
 * What another app asked the map to show: a point (with or without a name) or
 * a text to search for.
 *
 * PalmMap is registered with Android for `geo:` and `google.navigation:` links
 * (see `intentFilters` in `app.json`), so "Open in maps" in WhatsApp, Contacts,
 * Calendar or a web page can offer it. Nothing here asks the Internet; a text
 * to search goes to Nominatim later, through its usual queue.
 */
export interface GeoLink {
  coordinates?: Coordinates;
  /** The name the other app gave the point, e.g. `geo:0,0?q=38.7,-9.1(Casa)`. */
  label?: string;
  /** An address or place name to search for, when there are no coordinates. */
  query?: string;
}

const LAT_LON = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/;

function decode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

/** `38.7,-9.1` → coordinates; anything else, or `0,0` (geo's "no point"), → null. */
function coordinatesIn(text: string): Coordinates | null {
  const match = LAT_LON.exec(text);
  if (!match) {
    return null;
  }
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }
  return { latitude, longitude };
}

function queryParams(text: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of text.split('&')) {
    const equals = part.indexOf('=');
    if (equals > 0) {
      params[decode(part.slice(0, equals)).toLowerCase()] = decode(part.slice(equals + 1));
    }
  }
  return params;
}

/** Reads `q`: either `lat,lon(Name)` or free text. */
function fromQuery(q: string, fallback: Coordinates | null): GeoLink | null {
  const point = coordinatesIn(q);
  if (point) {
    const label = /\(([^)]*)\)\s*$/.exec(q)?.[1]?.trim();
    return { coordinates: point, ...(label ? { label } : {}) };
  }
  const text = q.trim();
  if (text) {
    return { query: text };
  }
  return fallback ? { coordinates: fallback } : null;
}

/**
 * Understands the forms other apps really send:
 *
 * - `geo:38.7223,-9.1393` and `geo:38.7223,-9.1393?z=16`
 * - `geo:0,0?q=38.7223,-9.1393(Rossio)` — a point with a name
 * - `geo:0,0?q=Rua+Augusta+Lisboa` — an address to search
 * - `google.navigation:q=38.7223,-9.1393` or `google.navigation:q=Rossio`
 *
 * Returns null for anything else, so an unknown link changes nothing.
 */
export function parseGeoLink(url: string): GeoLink | null {
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('geo:')) {
    const rest = trimmed.slice(4);
    const questionMark = rest.indexOf('?');
    const path = questionMark >= 0 ? rest.slice(0, questionMark) : rest;
    const params = queryParams(questionMark >= 0 ? rest.slice(questionMark + 1) : '');
    // `;u=35` (uncertainty) and friends come after the point.
    const point = coordinatesIn(decode(path.split(';')[0]));
    if (params.q) {
      return fromQuery(params.q, point);
    }
    return point ? { coordinates: point } : null;
  }

  if (lower.startsWith('google.navigation:')) {
    const params = queryParams(trimmed.slice('google.navigation:'.length));
    const q = params.q ?? params.ll;
    return q ? fromQuery(q, null) : null;
  }

  return null;
}
