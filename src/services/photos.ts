import axios from 'axios';

import { PANORAMAX_URL, PHOTO_NEARBY_M, PHOTO_WIDTH, USER_AGENT } from './config';
import type { Coordinates, PlaceDetails } from '../types/geo';
import type { PanoramaxSearchResponse, WikidataEntityResponse } from '../types/photos';
import { distanceMeters } from '../utils/geometry';

/**
 * Photos for a place's card, as Google shows — from open sources only.
 *
 * Google has photos of nearly every shop because millions of people upload
 * them. The open equivalent is what OpenStreetMap links to, so a photo appears
 * only where someone made that link:
 *
 * - `image`: an address (often a Commons page),
 * - `wikimedia_commons`: `File:Name.jpg`,
 * - `wikidata`: the item's image (P18) — landmarks, museums, stations,
 * - `panoramax`: a street-level picture id.
 *
 * When none of those exist, the street-level pictures Panoramax has **right
 * there** (within `PHOTO_NEARBY_M`) show the front of the place instead, and
 * say so (`street`). Both services were read with a probe (`sondar: photos`):
 * no key, real images.
 */

export interface PlacePhoto {
  /** The image itself, small enough for a card. */
  uri: string;
  /** Where it came from, for the credit under the strip. */
  source: 'commons' | 'panoramax' | 'web';
  /** A street-level picture near the place, not one of the place itself. */
  street?: boolean;
}

const client = axios.create({
  timeout: 10000,
  headers: { 'User-Agent': USER_AGENT },
});

/** The headers each `Image` must send: Wikimedia asks every client to name itself. */
export const PHOTO_HEADERS = { 'User-Agent': USER_AGENT };

/** A Commons file name → a thumbnail of it, through Commons' own redirect. */
function commonsThumb(file: string): string {
  const name = file.replace(/^(File|Ficheiro|Image):/i, '').trim().replace(/ /g, '_');
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${PHOTO_WIDTH}`;
}

function panoramaxThumb(id: string): string {
  return `${PANORAMAX_URL}/pictures/${encodeURIComponent(id)}/thumb.jpg`;
}

/** One `image` value → something an `Image` can show, or null. */
function fromImageTag(value: string): PlacePhoto | null {
  const v = value.trim();
  // A Commons page (`…/wiki/File:X.jpg`) is a page, not an image.
  const commons = /commons\.wikimedia\.org\/wiki\/(File:[^?#]+)/i.exec(v);
  if (commons) {
    return { uri: commonsThumb(decodeURIComponent(commons[1])), source: 'commons' };
  }
  if (/^File:/i.test(v)) {
    return { uri: commonsThumb(v), source: 'commons' };
  }
  if (/^https:\/\/\S+\.(jpe?g|png|webp)(\?\S*)?$/i.test(v)) {
    return { uri: v, source: 'web' };
  }
  // Anything else (a Flickr page, a Mapillary link…) needs reading a page or a
  // key: left out rather than shown broken.
  return null;
}

async function wikidataPhotos(id: string): Promise<PlacePhoto[]> {
  const q = id.trim();
  if (!/^Q\d+$/.test(q)) {
    return [];
  }
  const { data } = await client.get<WikidataEntityResponse>(
    `https://www.wikidata.org/wiki/Special:EntityData/${q}.json`,
  );
  return (data.entities?.[q]?.claims?.P18 ?? [])
    .map((c) => c.mainsnak?.datavalue?.value)
    .filter((f): f is string => typeof f === 'string')
    .slice(0, 3)
    .map((f) => ({ uri: commonsThumb(f), source: 'commons' as const }));
}

/** Street-level pictures within a few metres of the place, nearest first. */
async function streetPhotos(at: Coordinates): Promise<PlacePhoto[]> {
  // About 40 m each way: the search takes a box, the distance is checked after.
  const dLat = 0.00036;
  const dLon = dLat / Math.cos((at.latitude * Math.PI) / 180);
  const bbox = [at.longitude - dLon, at.latitude - dLat, at.longitude + dLon, at.latitude + dLat]
    .map((n) => n.toFixed(6))
    .join(',');
  const { data } = await client.get<PanoramaxSearchResponse>(
    `${PANORAMAX_URL}/search?bbox=${bbox}&limit=20`,
  );
  return (data.features ?? [])
    .map((f) => {
      const [lon, lat] = f.geometry?.coordinates ?? [];
      const d =
        typeof lat === 'number' && typeof lon === 'number'
          ? distanceMeters(at, { latitude: lat, longitude: lon })
          : Infinity;
      return { f, d };
    })
    .filter(({ f, d }) => f.id && d <= PHOTO_NEARBY_M)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map(({ f }) => ({
      uri: f.assets?.thumb?.href ?? panoramaxThumb(f.id as string),
      source: 'panoramax' as const,
      street: true,
    }));
}

/**
 * The photos for a place: what OpenStreetMap links to first, the street
 * around it only when there is none. Failures are silent — a card without
 * photos is the normal case, not an error.
 */
export async function placePhotos(
  details: PlaceDetails | undefined,
  at: Coordinates,
): Promise<PlacePhoto[]> {
  const tags = details?.photoTags ?? {};
  const found: PlacePhoto[] = [];

  for (const value of (tags.image ?? '').split(';')) {
    const photo = value.trim() ? fromImageTag(value) : null;
    if (photo) {
      found.push(photo);
    }
  }
  if (tags.commons && /^File:/i.test(tags.commons.trim())) {
    found.push({ uri: commonsThumb(tags.commons), source: 'commons' });
  }
  if (tags.panoramax) {
    for (const id of tags.panoramax.split(';')) {
      if (id.trim()) {
        found.push({ uri: panoramaxThumb(id.trim()), source: 'panoramax' });
      }
    }
  }
  if (tags.wikidata) {
    found.push(...(await wikidataPhotos(tags.wikidata).catch(() => [])));
  }

  const unique = [...new Map(found.map((p) => [p.uri, p])).values()].slice(0, 6);
  if (unique.length > 0) {
    return unique;
  }
  return streetPhotos(at).catch(() => []);
}
