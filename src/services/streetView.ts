import axios from 'axios';
import { PANORAMAX_URL, STREET_VIEW_TAP_M, STREET_VIEW_TIMEOUT_MS, USER_AGENT } from './config';
import type { Coordinates } from '../types/geo';
import type { PanoramaxPictureFeature, PanoramaxPicturesResponse } from '../types/photos';
import { distanceMeters } from '../utils/geometry';

/**
 * Street view from Panoramax, the open street-level photo service (OSM France
 * and IGN; CC BY-SA, no key) — author's request, 19 November 2026.
 *
 * Coverage was measured first (`sondar: streetview`, 250 points in ten towns):
 * Évora has plenty, most of it 360°; Lisbon's Baixa and Porto a few streets;
 * Almada, Seixal, Coimbra, Braga, Faro and Viseu nearly nothing. So the map
 * draws where pictures exist (the coverage layer, in `MapView`) and only
 * there does a tap open one: nothing is promised where there is none.
 */

export interface StreetPicture {
  id: string;
  collection: string;
  coordinates: Coordinates;
  /** The picture itself, 2048 px wide. */
  uri: string;
  /** A 500 px version, shown while the big one arrives. */
  thumbUri: string | null;
  /** Which way the camera looked, degrees from north, when known. */
  azimuth: number | null;
  /** A 360° picture (equirectangular), to be turned with the finger. */
  spherical: boolean;
  /** When it was taken (ms), or null. */
  takenAt: number | null;
  /** Who took it, for the credit the licence asks for. */
  author: string | null;
  /** The pictures before and after in the same sequence, by id. */
  prev: string | null;
  next: string | null;
}

const client = axios.create({
  timeout: STREET_VIEW_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
});

function fromFeature(f: PanoramaxPictureFeature): StreetPicture | null {
  const [lon, lat] = f.geometry?.coordinates ?? [];
  if (!f.id || typeof lat !== 'number' || typeof lon !== 'number') {
    return null;
  }
  const uri = f.assets?.sd?.href ?? f.assets?.hd?.href ?? f.assets?.thumb?.href;
  if (!uri) {
    return null;
  }
  const link = (rel: string) => f.links?.find((l) => l.rel === rel)?.id ?? null;
  const taken = f.properties?.datetime ? Date.parse(f.properties.datetime) : NaN;
  const azimuth = f.properties?.['view:azimuth'];
  return {
    id: f.id,
    collection: f.collection ?? '',
    coordinates: { latitude: lat, longitude: lon },
    uri,
    thumbUri: f.assets?.thumb?.href ?? null,
    azimuth: typeof azimuth === 'number' ? azimuth : null,
    spherical: f.properties?.['pers:interior_orientation']?.field_of_view === 360,
    takenAt: Number.isFinite(taken) ? taken : null,
    author: f.providers?.find((p) => p.roles?.includes('producer'))?.name ?? f.providers?.[0]?.name ?? null,
    prev: link('prev'),
    next: link('next'),
  };
}

/** The picture nearest a point, within `radius` metres, or null. */
export async function pictureNear(at: Coordinates, radius = STREET_VIEW_TAP_M): Promise<StreetPicture | null> {
  const dLat = radius / 111320;
  const dLon = dLat / Math.cos((at.latitude * Math.PI) / 180);
  const bbox = [at.longitude - dLon, at.latitude - dLat, at.longitude + dLon, at.latitude + dLat]
    .map((n) => n.toFixed(6))
    .join(',');
  const { data } = await client.get<PanoramaxPicturesResponse>(`${PANORAMAX_URL}/search?bbox=${bbox}&limit=50`);
  let best: { p: StreetPicture; d: number } | null = null;
  for (const f of data.features ?? []) {
    const p = fromFeature(f);
    if (!p) {
      continue;
    }
    const d = distanceMeters(at, p.coordinates);
    if (d <= radius && (!best || d < best.d)) {
      best = { p, d };
    }
  }
  if (!best) {
    return null;
  }
  const found = best.p;
  // The search answer may leave out the sequence links, and a picture kept
  // without them never walks (‹ › stay off): ask the item for them then.
  if (!found.prev && !found.next && found.collection) {
    const full = askPicture(found.id, found.collection)
      .then((p) => p ?? found)
      .catch(() => found);
    pictures.set(found.id, full);
    return full;
  }
  pictures.set(found.id, Promise.resolve(found));
  return found;
}

/**
 * One picture by id — the next or previous of a sequence, or a place's
 * `panoramax` tag. The item address when the sequence is known (it carries
 * the prev/next links), the search by id otherwise.
 */
async function askPicture(id: string, collection?: string): Promise<StreetPicture | null> {
  if (collection) {
    const { data } = await client.get<PanoramaxPictureFeature>(
      `${PANORAMAX_URL}/collections/${encodeURIComponent(collection)}/items/${encodeURIComponent(id)}`,
    );
    return fromFeature(data);
  }
  const { data } = await client.get<PanoramaxPicturesResponse>(
    `${PANORAMAX_URL}/search?ids=${encodeURIComponent(id)}&limit=1`,
  );
  const first = data.features?.[0];
  if (!first?.id || !first.collection) {
    return first ? fromFeature(first) : null;
  }
  // The search answer may leave out the sequence links: ask the item.
  return first.links?.some((l) => l.rel === 'next' || l.rel === 'prev')
    ? fromFeature(first)
    : askPicture(first.id, first.collection);
}

/**
 * Pictures already asked, by id — the step back is then instant. Kept for
 * the session; a walk along a street is a few hundred small answers at most.
 */
const pictures = new Map<string, Promise<StreetPicture | null>>();

export function pictureById(id: string, collection?: string): Promise<StreetPicture | null> {
  let asked = pictures.get(id);
  if (!asked) {
    asked = askPicture(id, collection);
    pictures.set(id, asked);
    // A failure is not kept: the next tap asks again.
    asked.catch(() => pictures.delete(id));
  }
  return asked;
}

/**
 * Gets the pictures before and after ready — their answer and their image —
 * so a step along the street shows at once instead of waiting for the
 * network (author: "not very fluid", 19 November 2026). Two steps ahead in
 * the direction being walked, one behind.
 *
 * The images are handed to `onImage`, for the sheet to draw out of sight
 * with the app's User-Agent: `Image.prefetch` sends none, and the loaded
 * image stays in the image cache under its address all the same.
 */
export function preloadAround(
  picture: StreetPicture,
  forward: 'next' | 'prev',
  onImage: (uri: string) => void,
): void {
  const warm = (id: string | null, depth: number, dir: 'next' | 'prev') => {
    if (!id || depth <= 0) {
      return;
    }
    void pictureById(id, picture.collection || undefined)
      .then((p) => {
        if (!p) {
          return;
        }
        onImage(p.uri);
        warm(p[dir], depth - 1, dir);
      })
      .catch(() => undefined);
  };
  const back = forward === 'next' ? 'prev' : 'next';
  warm(picture[forward], 2, forward);
  warm(picture[back], 1, back);
}
