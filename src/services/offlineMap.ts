import axios from 'axios';
import { t } from '../i18n';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';

import { REQUEST_TIMEOUT_MS, USER_AGENT } from './config';

/**
 * Country maps, downloaded on request and stored on the phone.
 *
 * The person picks the country in the settings and the file stays there until
 * they delete it. From then on that country works without any network, at any
 * zoom and in places they have never been — which is what the map cache cannot
 * give.
 *
 * Each country is a single file. Next to it sits a small identification file
 * with the name and the area it covers: that is what makes it possible to
 * know, without network, whether the current position is inside a downloaded
 * map.
 *
 * **This is not the same as downloading OpenStreetMap tiles.** Each file is a
 * cut-out of Protomaps' world map, which is published precisely to be used this
 * way.
 *
 * The **fonts** are the only thing that comes inside the app. They are 410 KB
 * and could not be otherwise: without them the map is drawn but has no names
 * at all, and fetching them from a server would spoil offline use.
 *
 * **Some names here are in Portuguese on purpose**: the Release tag `mapas`,
 * the manifest's fields (`regioes`, `nome`, `ficheiro`, `gerado`) and the
 * on-device folders `mapas` and `glifos`. They are already published or
 * already on installed phones, and renaming them would break every copy of the
 * app out there.
 */

const BASE_URL = 'https://github.com/choso08/PalmMap/releases/download/mapas';

/** Where the maps and the fonts the map writes with are kept. */
const MAPS = new Directory(Paths.document, 'mapas');
const GLYPHS = new Directory(Paths.document, 'glifos');

/** An available region, as it comes from the manifest or from inside the app. */
export interface OfflineRegion {
  id: string;
  /** The region's name. */
  nome: string;
  /** The map file's name. */
  ficheiro: string;
  bytes: number;
  maxzoom: number;
  /** Area covered: west, south, east, north. */
  bbox: [number, number, number, number];
  /**
   * When this file was generated, as `YYYY-MM-DD`.
   *
   * It is what tells that the map stored on the phone is already older than
   * the published one. Optional because maps generated before this existed do
   * not have it — and without it the map is treated as up to date, which is
   * the prudent choice: better to say nothing than to trigger a 325 MB download
   * by mistake.
   */
  gerado?: string;
}

interface Manifest {
  /** The regions. */
  regioes: OfflineRegion[];
}

/** Error with a readable message, so the screen can show something useful. */
export class OfflineMapError extends Error {}

// --- The fonts ---------------------------------------------------------------

/**
 * The fonts the map writes names with.
 *
 * Each file covers 256 characters. The first two blocks are enough for
 * Portuguese: the first has the alphabet and the most common accents, the
 * second the rest of the Latin characters. The folder names **have to be
 * exactly** the ones the style asks for in `text-font`.
 */
const FONTS = [
  { stack: 'Noto Sans Regular', range: '0-255', asset: require('../../assets/glyphs/Noto_Sans_Regular_0-255.pbf') },
  { stack: 'Noto Sans Regular', range: '256-511', asset: require('../../assets/glyphs/Noto_Sans_Regular_256-511.pbf') },
  { stack: 'Noto Sans Medium', range: '0-255', asset: require('../../assets/glyphs/Noto_Sans_Medium_0-255.pbf') },
  { stack: 'Noto Sans Medium', range: '256-511', asset: require('../../assets/glyphs/Noto_Sans_Medium_256-511.pbf') },
];

/**
 * Puts the fonts where the map will look for them.
 *
 * Inside the APK the files have no ordinary path MapLibre can open, so they are
 * copied once into the app's folder. It is 410 KB and only happens on the
 * first start-up — afterwards they are already there and the function does
 * nothing.
 *
 * Call at start-up. Failing here must not stop the app from opening: without
 * this the names on the offline map are lost, not the rest.
 */
export async function installBundledAssets(): Promise<void> {
  ensureFolder(MAPS);

  for (const font of FONTS) {
    const folder = new Directory(GLYPHS, font.stack);
    ensureFolder(folder);

    const file = new File(folder, `${font.range}.pbf`);
    if (!file.exists) {
      await copyAsset(font.asset, file);
    }
  }
}

/**
 * The fonts' address, in the format the map style expects.
 *
 * MapLibre replaces `{fontstack}` and `{range}` itself, according to the
 * characters it needs.
 */
export function glyphsTemplate(): string {
  return `${withSlash(GLYPHS.uri)}{fontstack}/{range}.pbf`;
}

// --- The downloaded maps -----------------------------------------------------

/** A region's local file, whether it exists or not. */
export function localFile(region: OfflineRegion): File {
  return new File(MAPS, region.ficheiro);
}

/** Whether the region is already on the phone. */
export function isDownloaded(region: OfflineRegion): boolean {
  return localFile(region).exists;
}

/**
 * The address MapLibre uses to read the downloaded map.
 *
 * The `pmtiles://` prefix tells it the file is a whole map in a single file,
 * instead of a tile server.
 *
 * If this ever stops working, the other way to write the same thing is
 * `pmtiles:///absolute/path`, without the `file://` in between — some
 * libraries only accept one of the two.
 */
export function localStyleSource(region: OfflineRegion): string {
  return `pmtiles://${localFile(region).uri}`;
}

/**
 * The regions actually on the phone right now.
 *
 * It reads the folder instead of asking the Internet, so it works without
 * network — which is the whole point of this.
 */
export function installedRegions(): OfflineRegion[] {
  if (!MAPS.exists) {
    return [];
  }

  const regions: OfflineRegion[] = [];
  for (const entry of MAPS.list()) {
    if (!(entry instanceof File) || !entry.uri.endsWith('.json')) {
      continue;
    }
    try {
      const region = JSON.parse(entry.textSync()) as OfflineRegion;
      if (new File(MAPS, region.ficheiro).exists) {
        regions.push(region);
      }
    } catch {
      // Broken identification file: that region is ignored instead of leaving
      // the app with no map at all.
    }
  }
  return regions;
}

/** A region only counts if it knows what area it covers. */
function hasArea(r: OfflineRegion): boolean {
  return Array.isArray(r.bbox) && r.bbox.length === 4;
}

/**
 * The downloaded region that serves what is being viewed.
 *
 * It is chosen in two steps, and the second exists for a practical reason:
 *
 * 1. **The one that covers the centre of the screen.** That is the normal case
 *    — one is inside the country.
 * 2. **Otherwise, any one that appears on screen.** When zooming the map out,
 *    the centre easily leaves a small country and falls into the sea. With only
 *    the first rule, the app dropped the downloaded map and went back to the
 *    Internet tiles — which in flight mode do not exist, and the screen went
 *    black. As long as the downloaded country is in view, it keeps drawing.
 *
 * With several in view, the one nearest the centre of the screen wins, as it is
 * the one the person is looking at.
 */
export function regionForView(
  bounds: { west: number; south: number; east: number; north: number },
  regions = installedRegions(),
): OfflineRegion | null {
  const available = regions.filter(hasArea);
  const centreLon = (bounds.west + bounds.east) / 2;
  const centreLat = (bounds.south + bounds.north) / 2;

  for (const r of available) {
    const [west, south, east, north] = r.bbox;
    if (centreLon >= west && centreLon <= east && centreLat >= south && centreLat <= north) {
      return r;
    }
  }

  let best: OfflineRegion | null = null;
  let nearest = Infinity;

  for (const r of available) {
    const [west, south, east, north] = r.bbox;
    const apart =
      east < bounds.west || west > bounds.east || north < bounds.south || south > bounds.north;
    if (apart) {
      continue;
    }

    // Distance in degrees, which is more than enough to choose between two regions.
    const dLon = (west + east) / 2 - centreLon;
    const dLat = (south + north) / 2 - centreLat;
    const distance = dLon * dLon + dLat * dLat;
    if (distance < nearest) {
      nearest = distance;
      best = r;
    }
  }

  return best;
}

/**
 * The last manifest that came back whole, kept on the phone.
 *
 * Outside the `mapas` folder on purpose: every `.json` in there is read as an
 * installed region.
 */
const MANIFEST_COPY = new File(Paths.document, 'mapas-manifesto.json');

/** How long one attempt at the manifest may take. */
const MANIFEST_TIMEOUT_MS = 30000;

async function fetchManifest(): Promise<OfflineRegion[]> {
  const response = await axios.get<Manifest>(`${BASE_URL}/mapas.json`, {
    timeout: MANIFEST_TIMEOUT_MS,
    headers: { 'User-Agent': USER_AGENT },
    // **The manifest's address never changes, but its content does.** Each
    // workflow run replaces the file in the same Release, at the same
    // address; and GitHub serves these files through a content delivery
    // network that caches them. Without this, a freshly generated country
    // could fail to appear for hours — with no error, just an old list
    // looking right.
    params: { t: Date.now() },
  });
  const regions = response.data?.regioes;
  if (!Array.isArray(regions) || regions.length === 0) {
    throw new Error('empty manifest');
  }
  return regions;
}

/**
 * Fetches the list of maps available for download.
 *
 * **The list sometimes came back with only some countries**, and this is
 * where: one failed request — GitHub's download redirect is slow on mobile
 * data, and fifteen seconds was not always enough — fell back to the maps
 * already on the phone, silently. The published manifest was complete; the
 * app just showed the short list as if it were the whole one. Now it tries
 * twice with a longer wait, and if both fail it shows the last full list it
 * received, plus whatever is installed.
 */
export async function listRegions(): Promise<OfflineRegion[]> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const regions = await fetchManifest();
      try {
        MANIFEST_COPY.write(JSON.stringify(regions));
      } catch {
        // Not being able to keep a copy is no reason to hide the list.
      }
      return regions;
    } catch {
      // One more go before falling back.
    }
  }

  // Without network: the last full list, with what is installed on top (an
  // installed map may be newer than the copy).
  const byId = new Map<string, OfflineRegion>();
  try {
    if (MANIFEST_COPY.exists) {
      for (const r of JSON.parse(MANIFEST_COPY.textSync()) as OfflineRegion[]) {
        byId.set(r.id, r);
      }
    }
  } catch {
    // A damaged copy is the same as none.
  }
  for (const r of installedRegions()) {
    byId.set(r.id, r);
  }
  if (byId.size > 0) {
    return [...byId.values()];
  }
  throw new OfflineMapError(t().errors.mapListFailed);
}

/**
 * Downloads a region's map.
 *
 * It downloads to a temporary name and only gives it its final name at the
 * end: if the connection drops halfway, no incomplete file is left passing for
 * a good one.
 */
export async function downloadRegion(
  region: OfflineRegion,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  ensureFolder(MAPS);

  // The `.parcial` ("partial") suffix stays in Portuguese so leftovers from
  // older versions are still recognised and cleaned up.
  const partial = new File(MAPS, `${region.ficheiro}.parcial`);
  if (partial.exists) {
    partial.delete();
  }

  /**
   * The last whole percentage already reported.
   *
   * **The system reports every chunk it writes to disk**, and for a file of
   * hundreds of megabytes that is thousands of reports a second. Each one
   * reached the screen and redrew the whole list — the bar still moved, but the
   * phone spent its time drawing instead of downloading, and with several
   * downloads at once it was enough for the app to stop responding. It only
   * reports when the number one sees actually changes.
   */
  let lastPercent = -1;

  try {
    const downloaded = await File.downloadFileAsync(
      `${BASE_URL}/${region.ficheiro}`,
      partial,
      {
        onProgress: ({ bytesWritten, totalBytes }) => {
          // The server does not always say the size up front — then it comes as
          // -1 and the manifest's is used, the real value measured when the
          // file was generated.
          const total = totalBytes > 0 ? totalBytes : region.bytes;
          if (total <= 0) {
            return;
          }

          const fraction = Math.min(1, bytesWritten / total);
          const percent = Math.floor(fraction * 100);
          if (percent === lastPercent) {
            return;
          }
          lastPercent = percent;
          onProgress?.(fraction);
        },
      },
    );

    const destination = localFile(region);
    if (destination.exists) {
      destination.delete();
    }
    await downloaded.move(destination);
    writeMetadata(region);
  } catch (error) {
    if (partial.exists) {
      partial.delete();
    }
    // The system's message goes along. Without it there was no telling whether
    // it was the network, the disk space or the server — and for a file of
    // hundreds of megabytes it is almost always the network dropping halfway.
    const detail = error instanceof Error ? error.message : String(error);
    throw new OfflineMapError(
      t().errors.mapDownloadFailed(region.nome, detail),
    );
  }
}

/**
 * The downloaded regions that already have a newer version published.
 *
 * Compares the date of the file on the phone with the manifest's. Without a
 * date on either side, **nothing is concluded**: a map generated before this
 * existed carries no date, and treating it as old would trigger a 325 MB
 * download by mistake.
 */
export function outdatedRegions(published: OfflineRegion[]): OfflineRegion[] {
  const stored = new Map(installedRegions().map((r) => [r.id, r]));

  return published.filter((fresh) => {
    const old = stored.get(fresh.id);
    return Boolean(old?.gerado && fresh.gerado && fresh.gerado > old.gerado);
  });
}

/**
 * Refreshes on its own the downloaded maps that already have a newer version.
 *
 * **Only over Wi-Fi, and that is a decision, not an oversight.** A country is
 * hundreds of megabytes — mainland Portugal is 325 MB. Downloading that on its
 * own over someone's mobile data would spend their allowance without asking,
 * and nobody thanks an app that does that. Over Wi-Fi it costs nobody anything
 * and it is exactly what is wanted: the map keeps itself up to date without
 * anyone having to think about it.
 *
 * Away from Wi-Fi nothing is downloaded — but the maps screen **marks them as
 * outdated**, so anyone who wants to can do it by hand.
 *
 * Returns how many it refreshed. Failing is no reason to tell anyone anything:
 * whoever did not ask for this does not need to know it went wrong, and next
 * time it tries again.
 */
export async function refreshOutdatedOnWifi(): Promise<number> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (state.type !== Network.NetworkStateType.WIFI || !state.isInternetReachable) {
      return 0;
    }

    const toRefresh = outdatedRegions(await listRegions());
    let done = 0;
    for (const region of toRefresh) {
      try {
        await downloadRegion(region);
        done += 1;
      } catch {
        // One country failing cannot stop the others from being refreshed.
      }
    }
    return done;
  } catch {
    return 0;
  }
}

/** Deletes a region's downloaded map. */
export function removeRegion(region: OfflineRegion): void {
  const file = localFile(region);
  if (file.exists) {
    file.delete();
  }

  const identification = metadataFile(region);
  if (identification.exists) {
    identification.delete();
  }
}

/** How much the downloaded maps take up, in total. */
export function usedBytes(): number {
  if (!MAPS.exists) {
    return 0;
  }

  return MAPS.list().reduce((total, entry) => {
    return entry instanceof File ? total + (entry.size ?? 0) : total;
  }, 0);
}

// --- Helpers -----------------------------------------------------------------

function ensureFolder(folder: Directory): void {
  if (!folder.exists) {
    folder.create({ intermediates: true });
  }
}

function withSlash(uri: string): string {
  return uri.endsWith('/') ? uri : `${uri}/`;
}

function metadataFile(region: OfflineRegion): File {
  return new File(MAPS, `${region.id}.json`);
}

function writeMetadata(region: OfflineRegion): void {
  metadataFile(region).write(JSON.stringify(region));
}

/** Copies a file that came inside the app to a usable place. */
async function copyAsset(module: number, destination: File): Promise<void> {
  const [asset] = await Asset.loadAsync(module);
  if (!asset?.localUri) {
    throw new OfflineMapError(t().errors.bundledAssetFailed);
  }
  await new File(asset.localUri).copy(destination);
}
