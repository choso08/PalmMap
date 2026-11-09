import { File } from 'expo-file-system';

import { installedRegions, poisFile, type OfflineRegion } from './offlineMap';
import type { Bounds, Place } from '../types/geo';
import { categoryLabel } from '../utils/categories';

/**
 * Businesses read from the country's business file, on the phone.
 *
 * ## Why
 *
 * The pins used to come only from Overpass: a request per area, a 1.2 s wait
 * after the map stopped, two seconds between requests, and a volunteer server
 * that refuses now and then ("Couldn't search for places"). With the country
 * downloaded, every named business is already on the phone — with hours, phone
 * and website — and the pins appear as fast as the map moves, with or without
 * network.
 *
 * ## How it reads
 *
 * The file is tens of megabytes for a country like Portugal, so it is never
 * read whole. It is split into grid cells (`scripts/build-pois.py` explains
 * the format); the header with the cell index is read once per region, and
 * then only the cells in view, each kept in memory for the next time.
 */

/** Tags to match: a key and its values, or any value with `null`. */
export type TagFilter = { key: string; values: string[] | null }[];

/**
 * Every business in the file. The automatic pins from the phone show all of
 * them — the author asked for as many as possible — where the Overpass pins
 * keep to a short list to keep each request light. A local read costs nothing.
 */
export const ALL_BUSINESSES: TagFilter = [
  'amenity',
  'shop',
  'tourism',
  'leisure',
  'office',
  'craft',
  'healthcare',
].map((key) => ({ key, values: null }));

interface Header {
  v: number;
  grid: number;
  gerado: string;
  count: number;
  cells: Record<string, [number, number]>;
}

/** One record: [lon, lat, name, key, value, hours?, phone?, website?, osm?, address?] */
type PoiRecord = [number, number, string, string, string, string?, string?, string?, string?, string?];

interface OpenFile {
  file: File;
  header: Header;
  /** Where the cell blocks start: after the 10-digit length and the header. */
  base: number;
}

const files = new Map<string, OpenFile | null>();
const cellCache = new Map<string, PoiRecord[]>();
const CELL_CACHE_MAX = 600;

/** Decodes UTF-8 without depending on `TextDecoder`, which Hermes may not have. */
function utf8(bytes: Uint8Array): string {
  const Decoder = (globalThis as { TextDecoder?: new () => { decode(b: Uint8Array): string } })
    .TextDecoder;
  if (Decoder) {
    return new Decoder().decode(bytes);
  }
  let out = '';
  let i = 0;
  const chunk: number[] = [];
  const flush = () => {
    out += String.fromCharCode(...chunk);
    chunk.length = 0;
  };
  while (i < bytes.length) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) {
      cp = b;
    } else if (b < 0xe0) {
      cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if (b < 0xf0) {
      cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else {
      cp =
        ((b & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      chunk.push(cp);
    }
    if (chunk.length > 4096) {
      flush();
    }
  }
  flush();
  return out;
}

function readRange(file: File, offset: number, length: number): Uint8Array {
  const handle = file.open();
  try {
    handle.offset = offset;
    return handle.readBytes(length);
  } finally {
    handle.close();
  }
}

function openRegion(region: OfflineRegion): OpenFile | null {
  const key = `${region.id}|${region.negociosGerado ?? ''}`;
  if (files.has(key)) {
    return files.get(key) ?? null;
  }
  let opened: OpenFile | null = null;
  try {
    const file = poisFile(region);
    if (file.exists) {
      const length = Number(utf8(readRange(file, 0, 10)));
      const header = JSON.parse(utf8(readRange(file, 10, length))) as Header;
      if (header.v === 1 && header.grid > 0) {
        opened = { file, header, base: 10 + length };
      }
    }
  } catch {
    // A damaged file is the same as none: the pins fall back to Overpass.
    opened = null;
  }
  files.set(key, opened);
  return opened;
}

/** The installed region with a business file that covers the centre of the view. */
export function poisRegionFor(bounds: Bounds): OfflineRegion | null {
  const lon = (bounds.west + bounds.east) / 2;
  const lat = (bounds.south + bounds.north) / 2;
  for (const r of installedRegions()) {
    const [west, south, east, north] = r.bbox ?? [0, 0, 0, 0];
    if (lon >= west && lon <= east && lat >= south && lat <= north && poisFile(r).exists) {
      return r;
    }
  }
  return null;
}

function readCell(region: OfflineRegion, opened: OpenFile, cell: string): PoiRecord[] {
  const cacheKey = `${region.id}|${cell}`;
  const cached = cellCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const where = opened.header.cells[cell];
  let records: PoiRecord[] = [];
  if (where) {
    try {
      records = JSON.parse(utf8(readRange(opened.file, opened.base + where[0], where[1])));
    } catch {
      records = [];
    }
  }
  if (cellCache.size >= CELL_CACHE_MAX) {
    const oldest = cellCache.keys().next().value;
    if (oldest !== undefined) {
      cellCache.delete(oldest);
    }
  }
  cellCache.set(cacheKey, records);
  return records;
}

function matches(record: PoiRecord, filter: TagFilter): boolean {
  return filter.some((f) => f.key === record[3] && (f.values === null || f.values.includes(record[4])));
}

/** OpenStreetMap ids carry their type (`n`, `w`, `r`); `Place.id` is a number. */
function numericId(osm: string | undefined, fallback: number): number {
  const m = /^([nwr])(\d+)$/.exec(osm ?? '');
  if (!m) {
    return -fallback;
  }
  const n = Number(m[2]);
  return m[1] === 'n' ? n : m[1] === 'w' ? 1e13 + n : 2e13 + n;
}

function toPlace(r: PoiRecord, index: number): Place {
  return {
    id: numericId(r[8], index + 1),
    name: r[2],
    address: r[9] ?? '',
    coordinates: { latitude: r[1], longitude: r[0] },
    category: categoryLabel({ [r[3]]: r[4] }),
    kindKey: r[3],
    kindValue: r[4],
    details: {
      phone: r[6] || undefined,
      website: r[7] || undefined,
      openingHours: r[5] || undefined,
    },
  };
}

/**
 * The businesses in view, from the phone. `null` when no downloaded country
 * with a business file covers the view — then the caller asks Overpass.
 *
 * Synchronous on purpose: it is a few small reads from a local file, and an
 * answer in the same frame is the whole point.
 */
export function localPlacesInBounds(
  bounds: Bounds,
  filter: TagFilter,
  limit = 300,
): Place[] | null {
  const region = poisRegionFor(bounds);
  if (!region) {
    return null;
  }
  const opened = openRegion(region);
  if (!opened) {
    return null;
  }

  const g = opened.header.grid;
  const x0 = Math.floor(bounds.west / g);
  const x1 = Math.floor(bounds.east / g);
  const y0 = Math.floor(bounds.south / g);
  const y1 = Math.floor(bounds.north / g);
  // A view that would touch hundreds of cells is too far out for pins anyway.
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) {
    return [];
  }

  const centreLon = (bounds.west + bounds.east) / 2;
  const centreLat = (bounds.south + bounds.north) / 2;
  const found: { place: Place; d: number }[] = [];
  let index = 0;
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      for (const r of readCell(region, opened, `${x},${y}`)) {
        index += 1;
        const [lon, lat] = r;
        if (lon < bounds.west || lon > bounds.east || lat < bounds.south || lat > bounds.north) {
          continue;
        }
        if (!matches(r, filter)) {
          continue;
        }
        const dx = lon - centreLon;
        const dy = lat - centreLat;
        found.push({ place: toPlace(r, index), d: dx * dx + dy * dy });
      }
    }
  }
  // The nearest the centre first, when there are more than fit on screen.
  return found
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((f) => f.place);
}
