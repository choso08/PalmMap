import { OfflineManager, TransformRequestManager } from '@maplibre/maplibre-react-native';
import { t } from '../i18n';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import { USER_AGENT } from './config';
import { glyphsTemplate, localStyleSource, type OfflineRegion } from './offlineMap';
import type { MapType, SatelliteDetail } from '../settings';
import { buildVectorStyle, regionMinZoom } from './vectorStyle';

/**
 * Configuration of the map tiles (the images that make up the map on screen).
 */

/**
 * Makes tile requests carry our User-Agent, as OpenStreetMap requires. Call
 * once, at app start-up.
 */
export function configureTileRequests(): void {
  TransformRequestManager.addHeader({
    id: 'user-agent',
    name: 'User-Agent',
    value: USER_AGENT,
  });

}

/**
 * Sets how much of the map already seen is kept on the phone.
 *
 * This is ordinary caching: only what the person actually got to see is kept,
 * as they see it. **It is not downloading an area** — OpenStreetMap's rules
 * expressly forbid fetching tiles ahead of time for offline use.
 *
 * There is no way to say "keep it for a month": MapLibre's API only has size.
 * In practice size governs time — when it fills up, it discards what has gone
 * unseen the longest. The bigger it is, the longer the areas one has passed
 * through stay available.
 */
export function setMapCacheSize(megabytes: number): void {
  void OfflineManager.setMaximumAmbientCacheSize(megabytes * 1024 * 1024).catch(
    () => undefined,
  );

  // With the size at zero, what was already there would stay stored. Whoever
  // turns this off wants the space back, so it is emptied along the way.
  if (megabytes === 0) {
    void OfflineManager.clearAmbientCache().catch(() => undefined);
  }
}

/** Forgets the cached map. Use when space needs freeing. */
export async function clearMapCache(): Promise<void> {
  await OfflineManager.clearAmbientCache();
}

/**
 * The last zoom level actually fetched from the server.
 *
 * Above this MapLibre enlarges this level's tiles instead of requesting new
 * ones. It gets a little less sharp when zooming in a lot, but there are two
 * big advantages:
 *
 * - **Offline:** the higher levels work from the tiles of this one, which are
 *   already cached. Without this, zooming in without network gave a blank map.
 * - **Fewer requests:** each extra zoom level quadruples the number of tiles.
 *   Cutting two levels removes about sixteen times the load put on the
 *   OpenStreetMap server, which runs on donations.
 *
 * **Why it is at 18 and not lower.** At 17 the tiles' lettering became huge and
 * blurry as soon as one zoomed in a bit further: the names are drawn into the
 * image, so enlarging the map enlarges them too. 18 halves that enlargement and
 * is the compromise that is bearable to look at.
 *
 * This does not happen with downloaded maps: there the text is drawn by us, at
 * the right size, whatever the zoom. One more reason to download the country.
 */
const MAX_TILE_ZOOM = 18;

/**
 * The colour under the tiles, for when they do not arrive.
 *
 * Without this, a missing tile shows the void, which MapLibre draws black.
 * That is what caused the "everything goes black" when zooming out without
 * network. With a colour underneath, a missing tile looks like a map still
 * loading instead of a fault.
 */
const EMPTY_LIGHT = '#EFE6D9';
const EMPTY_DARK = '#0B1319';

function rasterStyle(
  tiles: string[],
  attribution: string,
  maxzoom = MAX_TILE_ZOOM,
  paint?: Record<string, number>,
  background = EMPTY_LIGHT,
): StyleSpecification {
  return {
    version: 8,
    // The image styles declare the fonts too. Without this, writing a
    // business's name over the map drew nothing — which is what happened the
    // first time it was tried.
    glyphs: glyphsTemplate(),
    sources: {
      base: {
        type: 'raster',
        tiles,
        tileSize: 256,
        maxzoom,
        attribution,
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': background } },
      { id: 'base', type: 'raster', source: 'base', ...(paint ? { paint } : {}) },
    ],
  };
}

/** The tile addresses, kept apart: the downloaded map also uses them when zoomed out. */
const OSM_TILES = ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];
const CARTO_TILES = [
  'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
];

/** See the note on `DARK_STYLE`: CARTO's "dark matter" needs lifting. */
const CARTO_PAINT = { 'raster-brightness-min': 0.08, 'raster-contrast': 0.18 };

/**
 * Light map: OpenStreetMap tiles.
 *
 * Note: `tile.openstreetmap.org` is used directly. The old form with
 * subdomains (`a.`, `b.`, `c.`) is discouraged by OpenStreetMap itself.
 */
const LIGHT_STYLE = rasterStyle(OSM_TILES, '© OpenStreetMap');

/**
 * Dark map: CARTO's "dark matter" tiles, which are made from OpenStreetMap
 * data.
 *
 * OpenStreetMap has no dark version of its tiles, so another source is needed.
 * CARTO is free for non-commercial use, as long as attribution is given — and
 * the project's original brief already mentioned it as an option. Still no API
 * keys and nothing from Google.
 *
 * The four addresses are the same service: spreading the requests over several
 * subdomains lets the phone download more tiles in parallel.
 */
// CARTO's "dark matter" is dark on purpose, but at night behind the wheel the
// street names were barely readable. Lifting the blacks and opening up the
// contrast makes them legible without spoiling the theme — no more than this,
// or it stops being a dark map.
const DARK_STYLE = rasterStyle(
  CARTO_TILES,
  '© OpenStreetMap © CARTO',
  MAX_TILE_ZOOM,
  CARTO_PAINT,
  EMPTY_DARK,
);

/**
 * Satellite imagery: Sentinel-2 cloudless, by EOX.
 *
 * It is a mosaic from the Sentinel-2 satellite, of the European Union's
 * Copernicus programme, with the clouds removed. It is free, with no API keys,
 * under a Creative Commons licence — it fits the project's rules.
 *
 * **The detail has a physical limit.** Sentinel-2 sees the Earth at 10 metres
 * per pixel, which corresponds roughly to zoom 14. The coast, the forest, the
 * plantations and open land can be seen; individual houses cannot. This is not
 * a limitation of the code: it is what the satellite can see, and there is no
 * free, worldwide source that sees better.
 *
 * `maxzoom` stays at 14 on purpose: above that MapLibre enlarges what it
 * already has, instead of requesting tiles that bring no more information.
 *
 * The attribution is required by the licence and has to appear exactly as it
 * is here.
 */
const SATELLITE_STYLE = rasterStyle(
  ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg'],
  'Sentinel-2 cloudless por EOX IT Services GmbH (contém dados Copernicus Sentinel modificados 2025)',
  14,
);

/**
 * Official orthophotos from Portugal's Directorate-General for the Territory
 * (DGT), **Portugal only**.
 *
 * Sentinel-2 sees at 10 metres per pixel. These are high-resolution images
 * published by the State as open data, and they see at under a metre — enough
 * to tell houses, cars and road markings apart. It is the only way to get more
 * detail without paying and without API keys.
 *
 * **It goes on top of Sentinel-2, not instead of it.** That solves two things
 * at once: outside Portugal the whole world is still visible, and if this
 * service is down or changes address, what appears is the usual imagery
 * instead of an empty screen.
 *
 * They are very-high-resolution 2023 images from the Pléiades-Neo satellite,
 * published by the DGT for the whole of mainland Portugal.
 *
 * **Mind the layer name.** This service publishes two, and the difference is
 * not cosmetic:
 *
 * - `ortoSat2023-CorVerdadeira` — true colour, as the eye sees it. **This is
 *   the one.**
 * - `ortoSat2023-FalsaCor` — near infrared in place of red. It is for studying
 *   vegetation, and **turns every field and every tree bright red**. That is
 *   what happened the first time: asking only for `ortoSat2023` gave this one.
 *
 * The name could not be read from here — the development environment cannot
 * reach this server. It came from the DGT's own documentation.
 */
const DGT_ORTOS =
  'https://ortos.dgterritorio.gov.pt/wms/ortosat2023' +
  '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
  '&LAYERS=ortoSat2023-CorVerdadeira&STYLES=' +
  '&CRS=EPSG:3857&BBOX={bbox-epsg-3857}' +
  // 512 pixels for a square drawn at 256: each tile arrives with double the
  // resolution on each side, that is four times as many pixels. On a phone
  // screen, which already has two or three dots per pixel, the difference
  // shows.
  //
  // This beats requesting one more zoom level: the same detail with a quarter
  // of the requests made to a public service.
  '&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg&TRANSPARENT=false';

/**
 * Satellite with the orthophotos' detail wherever there are any.
 *
 * The zoom ceiling of 18 is out of politeness: each extra level quadruples the
 * requests made to a public service, and at 18 what is needed can already be
 * told apart.
 */
const SATELLITE_DETAILED_STYLE: StyleSpecification = {
  version: 8,
  glyphs: glyphsTemplate(),
  sources: {
    base: {
      type: 'raster',
      tiles: [
        'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg',
      ],
      tileSize: 256,
      maxzoom: 14,
      attribution: t().attributions.sentinel,
    },
    ortos: {
      type: 'raster',
      tiles: [DGT_ORTOS],
      tileSize: 256,
      maxzoom: 18,
      // **Mainland Portugal only.** Without this MapLibre requested these images
      // all over the world, and since the service answers with opaque JPEG —
      // no transparency — what came back was a background rectangle over the
      // satellite imagery, instead of nothing.
      bounds: [-9.6, 36.9, -6.1, 42.2],
      attribution: t().attributions.orthophotos,
    },
  },
  layers: [
    // The same colour underneath that `rasterStyle` puts in: a missing tile
    // showed the void, which MapLibre draws black.
    { id: 'background', type: 'background', paint: { 'background-color': EMPTY_LIGHT } },
    { id: 'base', type: 'raster', source: 'base' },
    // Only requested from 12: further out Sentinel-2 is enough, and it is not
    // worth bothering the orthophoto service.
    //
    // **They fade in over a whole zoom level.** They used to appear all at
    // once, at full opacity, the instant zoom 12 was passed — and under them
    // was Sentinel-2, which sees at ten metres per pixel against under a metre
    // for these. The jump in sharpness was huge and looked like a map fault,
    // when it is just the swap between two very different sources.
    //
    // Spreading the swap over a level solves it without costing **a single
    // extra request**: `minzoom` stays at 12, what changes is the opacity with
    // which what was already being requested is drawn.
    {
      id: 'ortos',
      type: 'raster',
      source: 'ortos',
      minzoom: 12,
      paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13, 1] },
    },
  ],
};

/**
 * The public transport network: ÖPNVKarte.
 *
 * It draws the **routes** of buses, trains, metros, trams and ferries, each
 * line in its own colour, plus the stops and stations. It is made from
 * OpenStreetMap data and is one of openstreetmap.org's official layers.
 *
 * It is a complete map, not a layer on top: it brings its own base, faded on
 * purpose, so the routes stand out. That is why it comes in as a map type and
 * not as a toggle.
 *
 * No API keys, open licence — it fits the project's rules. **The attribution
 * is required by the licence** and has to appear exactly as it is here.
 *
 * An honest caveat: it shows where the lines run, not when they run. Real
 * timetables would need GTFS data from each operator, which does not exist in
 * one place nor openly everywhere.
 */
const TRANSIT_STYLE = rasterStyle(
  ['https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png'],
  'Mapa memomaps.de CC-BY-SA · dados © OpenStreetMap',
  // ÖPNVKarte does not draw above 18. Asking for more would be asking for what isn't there.
  18,
);

/**
 * Returns the map style for the chosen type and the phone's theme.
 *
 * `offline` is the downloaded map covering the area the person is in, if there
 * is one. When there is, it beats the Internet tiles: it is faster, uses no
 * data and keeps working without network.
 *
 * **Satellite and transport always win**, because they are the only two with
 * no downloaded substitute: one is imagery, the other carries information the
 * vector map does not have. Choosing one of them is choosing to need network.
 */
export function mapStyleFor(
  dark: boolean,
  mapType: MapType,
  offline?: OfflineRegion | null,
  satelliteDetail: SatelliteDetail = 'normal',
): StyleSpecification {
  if (mapType === 'satellite') {
    return satelliteDetail === 'alta' ? SATELLITE_DETAILED_STYLE : SATELLITE_STYLE;
  }
  if (mapType === 'transit') {
    return TRANSIT_STYLE;
  }
  if (offline) {
    // When zooming far out, the downloaded country stops filling the screen
    // and the rest was left blank. Below that zoom the Internet tiles are shown
    // over the downloaded map — when there is no network they do not appear,
    // and what remains in view is the country again, which is the best one can
    // do without network.
    return buildVectorStyle(localStyleSource(offline), glyphsTemplate(), dark, {
      tiles: dark ? CARTO_TILES : OSM_TILES,
      attribution: dark ? '© OpenStreetMap © CARTO' : '© OpenStreetMap',
      maxzoom: regionMinZoom(offline.bbox),
      ...(dark ? { paint: CARTO_PAINT } : {}),
    });
  }
  return dark ? DARK_STYLE : LIGHT_STYLE;
}
