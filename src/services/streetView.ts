import axios from 'axios';

import { PANORAMAX_URL, STREET_VIEW_TAP_M, USER_AGENT } from './config';
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
  timeout: 10000,
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
  return best?.p ?? null;
}

/**
 * One picture by id — the next or previous of a sequence, or a place's
 * `panoramax` tag. The item address when the sequence is known (it carries
 * the prev/next links), the search by id otherwise.
 */
export async function pictureById(id: string, collection?: string): Promise<StreetPicture | null> {
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
    : pictureById(first.id, first.collection);
}
