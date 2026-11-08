import axios from 'axios';
import { t } from '../i18n';

import {
  CATEGORY_SEARCH_RADIUS_M,
  MAP_PINS_GRID_DEG,
  MAP_PINS_LIMIT,
  OVERPASS_BASE_URL,
  OVERPASS_FALLBACK_URL,
  OVERPASS_MIN_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
} from './config';
import { createRateLimiter } from './rateLimit';
import type { Bounds, Coordinates, Place } from '../types/geo';
import type { OverpassElement, OverpassResponse } from '../types/overpass';
import { MAP_PIN_TAGS, categoryLabel, type SearchCategory } from '../utils/categories';

/**
 * Overpass's client and queue, shared by everyone who asks it things.
 *
 * **There has to be a single queue.** `createRateLimiter` keeps the time of
 * the last request inside itself; two queues with the same interval are two
 * queues, and the two seconds Overpass's rules ask for would be kept by each
 * one in turn — that is, two requests at once. That is what happened when the
 * speed cameras created their own.
 */
const overpassClient = axios.create({
  baseURL: OVERPASS_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'User-Agent': USER_AGENT,
    // Overpass expects the query in a `data` field, like a form.
    'Content-Type': 'application/x-www-form-urlencoded',
  },
});

export const overpassSchedule = createRateLimiter(OVERPASS_MIN_INTERVAL_MS);
const schedule = overpassSchedule;

/**
 * Runs a query, and if the main server fails tries the second one.
 *
 * A 200 with a `remark` counts as a failure — see the note in `fetchPlaces`.
 * It runs **within** a single turn of the queue: the second server is only
 * called once the first has already said no, so there are never two requests
 * at once. Throws `PlacesError`, with the "busy" message if that was the last
 * thing heard.
 */
export async function askOverpass(query: string): Promise<OverpassResponse> {
  let busy = false;
  for (const url of [OVERPASS_BASE_URL, OVERPASS_FALLBACK_URL]) {
    try {
      const response = await overpassClient.post<OverpassResponse>(url, query);
      if (!response.data.remark) {
        return response.data;
      }
      busy = true;
    } catch {
      busy = false;
    }
  }
  throw new PlacesError(busy ? t().errors.placesBusy : t().errors.placesFailed);
}

/**
 * Memory of the requests already made. Overpass is heavy to run, so the same
 * query is never repeated.
 */
const cache = new Map<string, Place[]>();

/**
 * The automatic pins, stored **per grid square** rather than per area.
 *
 * **Storing per area made every new area cost the whole area.** Dragging the
 * map half a screen sideways gave a different area, a different key and a
 * request for the whole screen — and until it came back, the half already seen
 * stayed as it was without gaining the other half's pins. Stored per square,
 * what is already known appears at once, and Overpass is only asked for the
 * strip that is missing: a smaller query, which the server answers faster.
 *
 * The key is the square's pair of integer indices (`i:j`), not the
 * coordinates, so that one extra decimal place does not turn the same square
 * into two.
 */
const cells = new Map<string, Place[]>();

/** Someone waiting for a response: one still wanting it is enough for it to go out. */
type Wanted = () => boolean;
const always: Wanted = () => true;

/**
 * The queries running right now, by the same key as the cache.
 *
 * **Without this, the same area was requested twice.** The queue spaces
 * requests two seconds apart; anyone arriving during that time asking for
 * exactly the same thing — and they do, because the map going back to an area
 * it passed a moment ago gives the same key — went into the queue behind the
 * first instead of waiting for it. The cache only started to count after the
 * first one **finished**. Here the promise is shared: the second receives the
 * first one's response, with no request at all and no wait for the queue's
 * interval.
 *
 * The interested parties are kept too: a shared request is only skipped in the
 * queue if **none** of them wants it any more. Asking only the first one would
 * throw away the response the second was waiting for.
 */
const inFlight = new Map<string, { request: Promise<Place[]>; interested: Wanted[] }>();

/** Error with a readable message, so the screen can show something useful. */
export class PlacesError extends Error {}

/**
 * Builds a query with **one `out` per tag group**.
 *
 * It is not tidiness: a single `out` at the end of a union gives the whole
 * limit to the first group — and within it to the things with the lowest
 * OpenStreetMap ids, wherever they happen to be. See the note on
 * `MAP_PINS_LIMIT`, where the bug is told in full.
 */
function taggedQuery(
  groups: { key: string; values: string[] | null }[],
  area: string,
  limit: number,
): string {
  const lines = groups.flatMap(({ key, values }) => [
    `nwr${tagFilter(key, values)}(${area});`,
    `out center ${limit};`,
  ]);
  return `[out:json][timeout:25];\n${lines.join('\n')}`;
}

/** Builds the tag filter, in the format Overpass understands. */
function tagFilter(key: string, values: string[] | null): string {
  if (values === null) {
    return `[${key}]`;
  }
  if (values.length === 1) {
    return `[${key}=${values[0]}]`;
  }
  return `[${key}~"^(${values.join('|')})$"]`;
}

/** Converts an Overpass element into the format the app uses. */
function toPlace(element: OverpassElement): Place | null {
  const tags = element.tags ?? {};

  // Without a name it is not worth showing: it would be an anonymous pin on the map.
  const name = tags.name;
  if (!name) {
    return null;
  }

  // Points carry lat/lon; areas and lines only carry the centre.
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (latitude === undefined || longitude === undefined) {
    return null;
  }

  // Overpass does not return the address assembled — it is built from the parts.
  const address = [
    [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' '),
    tags['addr:postcode'],
    tags['addr:city'],
  ]
    .filter(Boolean)
    .join(', ');

  return {
    id: element.id,
    name,
    address,
    coordinates: { latitude, longitude },
    category: categoryLabel(tags),
    details: {
      phone: tags.phone ?? tags['contact:phone'],
      website: tags.website ?? tags['contact:website'],
      openingHours: tags.opening_hours,
    },
  };
}

/** Shares a query with whoever is already waiting for the same key. */
function shared(
  key: string,
  isWanted: Wanted,
  run: (wanted: Wanted) => Promise<Place[]>,
): Promise<Place[]> {
  const pending = inFlight.get(key);
  if (pending) {
    pending.interested.push(isWanted);
    return pending.request;
  }

  const interested = [isWanted];
  const request = run(() => interested.some((wants) => wants())).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, { request, interested });
  return request;
}

async function runQuery(cacheKey: string, query: string, isWanted: Wanted): Promise<Place[]> {
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  return shared(cacheKey, isWanted, async (wanted) => {
    const places = await fetchPlaces(query, wanted);
    cache.set(cacheKey, places);
    return places;
  });
}

/**
 * Runs the query through the queue and converts the response. Stores nothing.
 *
 * A request nobody wants any more, when its turn comes, does not go out — and
 * rejects with `SupersededError`, which the caller ignores since it already has
 * something else on screen.
 */
async function fetchPlaces(query: string, isWanted: Wanted): Promise<Place[]> {
  // Overpass answers 200 with a `remark` when the query blows up on time or
  // memory. Keeping that in memory would keep a failure forever: that area was
  // left without businesses for the rest of the session, with no error at all.
  // `askOverpass` treats it as a failure.
  const data = await schedule(() => askOverpass(query), isWanted);

  // **Duplicates are removed.** Each tag group has its own `out`, and a place
  // that is both a shop and a restaurant comes out in both. The key is the
  // type **and** the number: in OpenStreetMap a node and a way can share a
  // number and are not the same place.
  const seen = new Set<string>();
  const places: Place[] = [];

  for (const element of data.elements) {
    const key = `${element.type}/${element.id}`;
    if (seen.has(key)) {
      continue;
    }
    const place = toPlace(element);
    if (place) {
      seen.add(key);
      places.push(place);
    }
  }

  return places;
}

/**
 * Looks for businesses of a category around a point.
 * It is what is behind the "Restaurants", "Pharmacies", etc. buttons.
 */
export async function searchNearby(
  category: SearchCategory,
  center: Coordinates,
  radiusMeters = CATEGORY_SEARCH_RADIUS_M,
  isWanted: Wanted = always,
): Promise<Place[]> {
  // Rounding the coordinates makes small GPS variations reuse the same result,
  // instead of firing a new request each time.
  const lat = center.latitude.toFixed(3);
  const lon = center.longitude.toFixed(3);
  const cacheKey = `nearby|${category.id}|${lat},${lon}|${radiusMeters}`;

  return runQuery(
    cacheKey,
    taggedQuery(category.tags, `around:${radiusMeters},${lat},${lon}`, MAP_PINS_LIMIT),
    isWanted,
  );
}

/** The rectangle in the format Overpass wants: south,west,north,east. */
export function boundingBox(bounds: Bounds): string {
  return [
    bounds.south.toFixed(4),
    bounds.west.toFixed(4),
    bounds.north.toFixed(4),
    bounds.east.toFixed(4),
  ].join(',');
}

/** The indices of the grid squares an area touches. */
interface CellRange {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * The grid squares (`MAP_PINS_GRID_DEG`) an area touches.
 *
 * It always widens outwards (`floor` on one side, `ceil` on the other): the
 * requested area has to contain what is being viewed, or pins would be missing
 * at the edges.
 */
function cellRange(bounds: Bounds): CellRange {
  const g = MAP_PINS_GRID_DEG;
  // The slack wipes out floating-point error: -9.150 / 0.005 gives
  // -1830.0000001, and without it an exact edge gained an extra square.
  const slack = 1e-6;
  const south = Math.floor(bounds.south / g + slack);
  const west = Math.floor(bounds.west / g + slack);
  return {
    south,
    west,
    north: Math.max(south, Math.ceil(bounds.north / g - slack) - 1),
    east: Math.max(west, Math.ceil(bounds.east / g - slack) - 1),
  };
}

function cellKey(i: number, j: number): string {
  return `${i}:${j}`;
}

/** The stored pins of every square in the area, and whether they are all there. */
function fromCells(r: CellRange): { places: Place[]; missing: [number, number][] } {
  const places: Place[] = [];
  const missing: [number, number][] = [];
  for (let i = r.south; i <= r.north; i++) {
    for (let j = r.west; j <= r.east; j++) {
      const stored = cells.get(cellKey(i, j));
      if (stored) {
        places.push(...stored);
      } else {
        missing.push([i, j]);
      }
    }
  }
  return { places, missing };
}

/**
 * Looks for the businesses inside the visible area of the map.
 *
 * Asks Overpass **only for the rectangle of the squares not yet known** — see
 * `cells`. Everything that comes is filed in the square it falls into, and
 * every square in the rectangle is marked as seen, even those that come back
 * empty: a square without businesses is an answer, not a lack of one.
 *
 * Whoever calls this must respect the minimum zoom and the wait set in
 * `config.ts` — otherwise every finger drag would generate a new request.
 */
export async function searchInBounds(
  bounds: Bounds,
  isWanted: Wanted = always,
): Promise<Place[]> {
  const range = cellRange(bounds);
  const { missing } = fromCells(range);
  if (missing.length === 0) {
    return fromCells(range).places;
  }

  const toRequest: CellRange = {
    south: Math.min(...missing.map(([i]) => i)),
    north: Math.max(...missing.map(([i]) => i)),
    west: Math.min(...missing.map(([, j]) => j)),
    east: Math.max(...missing.map(([, j]) => j)),
  };
  const g = MAP_PINS_GRID_DEG;
  const box = boundingBox({
    south: toRequest.south * g,
    west: toRequest.west * g,
    north: (toRequest.north + 1) * g,
    east: (toRequest.east + 1) * g,
  });

  await shared(`cells|${box}`, isWanted, async (wanted) => {
    const places = await fetchPlaces(taggedQuery(MAP_PIN_TAGS, box, MAP_PINS_LIMIT), wanted);

    const bySquare = new Map<string, Place[]>();
    for (let i = toRequest.south; i <= toRequest.north; i++) {
      for (let j = toRequest.west; j <= toRequest.east; j++) {
        bySquare.set(cellKey(i, j), []);
      }
    }
    // A place right on the rectangle's edge may fall into the neighbouring
    // square, which was not requested — it is left out, and comes when that
    // one is requested.
    for (const place of places) {
      const list = bySquare.get(
        cellKey(
          Math.floor(place.coordinates.latitude / g),
          Math.floor(place.coordinates.longitude / g),
        ),
      );
      list?.push(place);
    }
    for (const [key, list] of bySquare) {
      cells.set(key, list);
    }
    return places;
  });

  return fromCells(range).places;
}

/**
 * The businesses of this area **that are already in memory**. Requests
 * nothing.
 *
 * It makes the pins appear **immediately**: in full when going back to an area
 * already visited, and partly when dragging the map sideways — what stays in
 * view stays, and only the new strip waits for Overpass. The
 * `MAP_PINS_DEBOUNCE_MS` wait exists so as not to fire a request on every
 * finger drag, and a response already in memory fires no request at all.
 * Waiting for it would be obeying the letter of a rule against its reason.
 *
 * `complete` says whether the whole area is covered; if not, something still
 * needs requesting.
 */
export function cachedInBounds(bounds: Bounds): { places: Place[]; complete: boolean } {
  const { places, missing } = fromCells(cellRange(bounds));
  return { places, complete: missing.length === 0 };
}

/**
 * Looks for businesses of a category inside the visible area of the map.
 *
 * It is what is behind the "Restaurants", "Pharmacies", etc. buttons. It looks
 * in what is being viewed, not around the GPS: otherwise, when looking at
 * another area of the map the results appeared far away and it seemed the
 * button did nothing.
 */
export async function searchCategoryInBounds(
  category: SearchCategory,
  bounds: Bounds,
  isWanted: Wanted = always,
): Promise<Place[]> {
  const box = boundingBox(bounds);
  return runQuery(
    `category|${category.id}|${box}`,
    taggedQuery(category.tags, box, MAP_PINS_LIMIT),
    isWanted,
  );
}
