import axios from 'axios';
import { acceptLanguage, activeLanguage } from '../i18n';

import {
  NOMINATIM_BASE_URL,
  NOMINATIM_MIN_INTERVAL_MS,
  PHOTON_BASE_URL,
  REQUEST_TIMEOUT_MS,
  SEARCH_TIMEOUT_MS,
  USER_AGENT,
} from './config';
import { SupersededError, createRateLimiter } from './rateLimit';
import type {
  NominatimReverseResponse,
  NominatimSearchResponse,
  NominatimSearchResult,
} from '../types/nominatim';
import type { PhotonFeature, PhotonResponse } from '../types/photon';
import type { Bounds, Coordinates, Place } from '../types/geo';
import { t } from '../i18n';
import { categoryLabel } from '../utils/categories';

const client = axios.create({
  baseURL: NOMINATIM_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
});

/**
 * Memory of the results already obtained, so the same search is never repeated.
 * It only lives in memory: closing the app empties it. Plenty for the intended use.
 */
const cache = new Map<string, Place[]>();

/** Guarantees the minimum interval of 1 request per second Nominatim requires. */
const schedule = createRateLimiter(NOMINATIM_MIN_INTERVAL_MS);

/**
 * The searches on their way, by the same key as the cache, and who is waiting
 * for them.
 *
 * Pressing Enter searches straight away, and the one-second wait already
 * running finished right after and asked for **the same thing again** — which,
 * since the first had not answered yet, was not in the cache and went into the
 * queue, a second behind. Here the second request waits for the first one's
 * response.
 */
const inFlight = new Map<string, { request: Promise<Place[]>; interested: (() => boolean)[] }>();

/** Converts a Nominatim result into the format the app uses. */
function toPlace(raw: NominatimSearchResult): Place {
  const extra = raw.extratags ?? {};

  return {
    id: raw.place_id,
    // Not every result carries `name`; in that case the start of the address is used.
    name: raw.name || raw.display_name.split(',')[0],
    address: raw.display_name,
    coordinates: {
      latitude: Number(raw.lat),
      longitude: Number(raw.lon),
    },
    // Nominatim gives the category in two parts ('amenity' + 'restaurant'),
    // which is the same shape as OpenStreetMap tags — so the same translation
    // used for businesses coming from Overpass can be reused.
    category: categoryLabel({ [raw.category]: raw.type }),
    kindKey: raw.category,
    kindValue: raw.type,
    details: {
      phone: extra.phone ?? extra['contact:phone'],
      website: extra.website ?? extra['contact:website'],
      openingHours: extra.opening_hours,
    },
  };
}

/**
 * Looks places up from typed text ("Rua Augusta" or "Hotel Miramar").
 *
 * `near` is the area being viewed on the map, and it makes all the difference
 * when looking for businesses: without it, Nominatim searches the whole world
 * and sorts by what is best known — typing the name of the café round the
 * corner brought up a namesake on the other side of the planet. With it, what
 * is in view comes first.
 *
 * It is not a limit, it is a preference (`bounded=0`): someone searching for a
 * city in another country still finds it.
 *
 * Do not call this on every keystroke — always use it with the delay set in
 * SEARCH_DEBOUNCE_MS, or only when the person confirms the search.
 */
export async function searchPlaces(
  query: string,
  limit = 8,
  near?: Bounds | null,
  isWanted: () => boolean = () => true,
): Promise<Place[]> {
  const term = query.trim();
  if (term.length === 0) {
    return [];
  }

  // The area goes into the key rounded: otherwise every little drag of the map
  // made the same search count as a new one. **Rounded outwards**, never to
  // the nearest: zoomed in, north and south rounded to the same tenth, and
  // Nominatim answers a box with no height with 400 "Bounding box with invalid
  // parameters" (author's photo, November 2026; reproduced with `sondar:
  // search400`). Outwards, the box is always at least a tenth of a degree.
  const out = (n: number, up: boolean) =>
    ((up ? Math.ceil(n * 10 + 1e-9) : Math.floor(n * 10 - 1e-9)) / 10).toFixed(1);
  const viewbox = near
    ? `${out(near.west, false)},${out(near.north, true)},${out(near.east, true)},${out(near.south, false)}`
    : '';
  const cacheKey = `${term.toLowerCase()}|${limit}|${viewbox}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = inFlight.get(cacheKey);
  if (pending) {
    pending.interested.push(isWanted);
    return pending.request;
  }

  const interested = [isWanted];
  const request = fetchSearch(term, limit, viewbox, near ?? null, cacheKey, () =>
    interested.some((wants) => wants()),
  ).finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, { request, interested });
  return request;
}

/**
 * The request itself. If, when its turn in the queue comes, nobody wants the
 * response any more — more was typed in the meantime — it does not go out: one
 * request fewer to Nominatim and one second fewer ahead of the search that
 * matters.
 */
async function fetchSearch(
  term: string,
  limit: number,
  viewbox: string,
  near: Bounds | null,
  cacheKey: string,
  isWanted: () => boolean,
): Promise<Place[]> {
  let nominatimFailure: unknown;
  try {
    const response = await schedule(
      () =>
        client.get<NominatimSearchResponse>('/search', {
          timeout: SEARCH_TIMEOUT_MS,
          // `extratags=1` brings the phone number, opening hours and website.
          params: {
            q: term,
            format: 'jsonv2',
            limit,
            addressdetails: 0,
            extratags: 1,
            // Names come in the app's language wherever OpenStreetMap has them
            // translated: someone using English sees "Lisbon", not "Lisboa".
            'accept-language': acceptLanguage(activeLanguage()),
            // Order required by Nominatim: west, north, east, south.
            ...(viewbox ? { viewbox, bounded: 0 } : {}),
          },
        }),
      isWanted,
    );

    // A response that is not a list is no result at all — it is an error page
    // served with a 200, and treating it as a list blew up further on.
    if (!Array.isArray(response.data)) {
      throw new Error('unexpected response');
    }
    const places = response.data.map(toPlace);
    cache.set(cacheKey, places);
    return places;
  } catch (error) {
    if (error instanceof SupersededError) {
      throw error;
    }
    nominatimFailure = error;
  }

  // **Nominatim failed: ask Photon.** Only now, and never both at once — see
  // `PHOTON_BASE_URL`.
  try {
    const places = await searchPhoton(term, limit, near, isWanted);
    cache.set(cacheKey, places);
    return places;
  } catch (error) {
    if (error instanceof SupersededError) {
      throw error;
    }
    // Both failed. The message says what Nominatim answered, since it is the
    // main service — see `searchError`.
    throw searchError(nominatimFailure);
  }
}

/** A search error, with a message that says what really failed. */
export class SearchError extends Error {}

/**
 * Turns Nominatim's failure into a message that says **what** failed.
 *
 * **"Check your Internet connection" was the message for everything**, and it
 * said the opposite of what was going on to someone with network and the map
 * loading: a refusal by the service (403, 429) or a slow service looked the
 * same as having no network. With the response status on screen, a photo
 * tells which — the same decision taken for the timetables (`carrisGet`).
 */
function searchError(error: unknown): SearchError {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      return new SearchError(t().search.failedStatus(error.response.status));
    }
    if (error.code === 'ECONNABORTED') {
      return new SearchError(t().search.failedTimeout);
    }
    return new SearchError(t().search.failed);
  }
  return new SearchError(t().search.failedOther);
}

/** Photon has its own queue: it is another service, with its own limit. */
const photonSchedule = createRateLimiter(NOMINATIM_MIN_INTERVAL_MS);

const photon = axios.create({
  baseURL: PHOTON_BASE_URL,
  timeout: SEARCH_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
});

/**
 * Searches Photon, the fallback.
 *
 * The preference for what is in view is given by the map's centre
 * (`lat`/`lon`) — Photon has no equivalent of Nominatim's `viewbox`, and its
 * `bbox` is a limit, not a preference. The language is only given for
 * English: the public server has no Portuguese, and without one the local
 * names come, which in Portugal already are those.
 */
async function searchPhoton(
  term: string,
  limit: number,
  near: Bounds | null,
  isWanted: () => boolean,
): Promise<Place[]> {
  const response = await photonSchedule(
    () =>
      photon.get<PhotonResponse>('/api', {
        params: {
          q: term,
          limit,
          ...(activeLanguage() === 'en' ? { lang: 'en' } : {}),
          ...(near
            ? {
                lat: ((near.south + near.north) / 2).toFixed(4),
                lon: ((near.west + near.east) / 2).toFixed(4),
              }
            : {}),
        },
      }),
    isWanted,
  );

  return (response.data.features ?? [])
    .map(photonToPlace)
    .filter((place): place is Place => place !== null);
}

/** Converts a Photon result into the format the app uses. */
function photonToPlace(feature: PhotonFeature, index: number): Place | null {
  const coords = feature.geometry?.coordinates;
  const p = feature.properties ?? {};
  if (!coords || coords.length < 2) {
    return null;
  }
  // Mind the order: in GeoJSON longitude comes first.
  const [longitude, latitude] = coords;

  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  const parts = [street, p.postcode, p.city ?? p.district, p.state, p.country].filter(
    (part): part is string => Boolean(part) && part !== p.name,
  );
  const extra = p.extra ?? {};

  return {
    // Photon has no `place_id`; the OpenStreetMap number will do, and the
    // index breaks the tie for the rare ones that come without it.
    id: p.osm_id ?? -(index + 1),
    name: p.name || street || parts[0] || '',
    address: parts.join(', '),
    coordinates: { latitude, longitude },
    category: p.osm_key && p.osm_value ? categoryLabel({ [p.osm_key]: p.osm_value }) : undefined,
    kindKey: p.osm_key,
    kindValue: p.osm_value,
    details: {
      phone: extra.phone ?? extra['contact:phone'],
      website: extra.website ?? extra['contact:website'],
      openingHours: extra.opening_hours,
    },
  };
}

/**
 * Works out which address corresponds to a point on the map — the opposite of
 * the search.
 *
 * It is what names the pin dropped with a long press. Returns `null` if there
 * is nothing at that point (in the middle of the sea, for instance) or if the
 * service fails: in that case the pin stays anyway, just without an address.
 *
 * It goes through the same 1-request-per-second queue as the rest of
 * Nominatim.
 */
export async function reverseGeocode(coordinates: Coordinates): Promise<Place | null> {
  const lat = coordinates.latitude.toFixed(5);
  const lon = coordinates.longitude.toFixed(5);
  const cacheKey = `reverse|${lat},${lon}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    return cached[0] ?? null;
  }

  try {
    const response = await schedule(() =>
      client.get<NominatimReverseResponse>('/reverse', {
        params: {
          lat,
          lon,
          format: 'jsonv2',
          zoom: 18,
          extratags: 1,
          'accept-language': acceptLanguage(activeLanguage()),
        },
      }),
    );

    if ('error' in response.data) {
      return null;
    }

    const place = toPlace(response.data);
    cache.set(cacheKey, [place]);
    return place;
  } catch {
    return null;
  }
}
