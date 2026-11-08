import type { StyleSpecification } from '@maplibre/maplibre-react-native';

/**
 * The vector map style, for the maps downloaded to the phone.
 *
 * ## Why this has to exist
 *
 * With OpenStreetMap tiles the map came ready-made: they are images, already
 * drawn on the other side. A downloaded map carries **geometry** — this line is
 * a secondary road, this polygon is sea — and no colour at all. It is up to us
 * to say what is blue, how thick each road is and from what zoom each thing
 * appears. That is what this file does.
 *
 * ## What is in here
 *
 * The layers and the values used in the filters were not guessed: they came
 * from reading the São Tomé file itself. It is the **Protomaps Basemap
 * v4.15.1** schema, with the layers `earth`, `landcover`, `landuse`, `water`,
 * `roads`, `buildings`, `boundaries` and `places`.
 *
 * When changing map version, confirm the names still hold — if a filter stops
 * finding what it looks for, that layer disappears from the screen without any
 * error. It is the hardest fault to understand in this file.
 *
 * ## What was left out, on purpose
 *
 * - **Icons.** They would need a separate sprite sheet. Businesses already
 *   appear as our own pins, coming from Overpass.
 * - **Business names.** Same reason: they would sit on top of our pins.
 */

/** The source's name inside the style. Also used when attaching our own layers. */
export const VECTOR_SOURCE = 'protomaps';

/** There are only tiles up to this level. Above it, MapLibre scales the geometry up without blurring. */
const MAX_DATA_ZOOM = 14;

const ATTRIBUTION = '© OpenStreetMap · Protomaps';

/** The map's colours, in light and dark versions. */
interface Palette {
  land: string;
  landcover: string;
  green: string;
  sand: string;
  built: string;
  institutional: string;
  water: string;
  waterLine: string;
  building: string;
  buildingLine: string;
  highway: string;
  highwayCasing: string;
  major: string;
  majorCasing: string;
  minor: string;
  minorCasing: string;
  path: string;
  ferry: string;
  boundary: string;
  text: string;
  textMinor: string;
  halo: string;
  waterText: string;
}

const LIGHT: Palette = {
  land: '#F2E8D9',
  landcover: '#E9DCC6',
  green: '#CFDDB2',
  sand: '#F0E1C0',
  built: '#EBE1D1',
  institutional: '#E7DCCB',
  water: '#7FB2BC',
  waterLine: '#5F98A4',
  building: '#E2D5BF',
  buildingLine: '#D2C2A8',
  highway: '#F0B189',
  highwayCasing: '#CE8460',
  major: '#FDF9F2',
  majorCasing: '#DCCFB8',
  minor: '#FDF9F2',
  minorCasing: '#E4D8C3',
  path: '#B5A084',
  ferry: '#6FA5AE',
  boundary: '#A08C7E',
  text: '#1C2B33',
  textMinor: '#5F7079',
  halo: '#F2E8D9',
  waterText: '#255F6C',
};

const DARK: Palette = {
  land: '#0F1A22',
  landcover: '#13212B',
  green: '#152A21',
  sand: '#241F17',
  built: '#152430',
  institutional: '#172734',
  water: '#071119',
  waterLine: '#14323F',
  building: '#1B2A36',
  buildingLine: '#233542',
  // The motorway leans towards the coral of the rest of the app, but muted —
  // driving at night, a bright road tires the eyes.
  highway: '#5A403A',
  highwayCasing: '#33241F',
  major: '#334553',
  majorCasing: '#1D2C38',
  minor: '#283845',
  minorCasing: '#19252F',
  path: '#3A4854',
  ferry: '#2A4C58',
  boundary: '#48404E',
  text: '#EDE5D8',
  textMinor: '#8D9EA9',
  halo: '#0B1319',
  waterText: '#568C99',
};

/** The name in the local language, with the Portuguese one first if it exists. */
const NAME: unknown = ['coalesce', ['get', 'name:pt'], ['get', 'name']];

/**
 * The Internet tiles to put on top while zoomed too far out for the downloaded
 * map to serve. See `buildVectorStyle`.
 */
export interface StyleOverlay {
  tiles: string[];
  attribution: string;
  /** Zoom from which it stops appearing and the downloaded map takes over. */
  maxzoom: number;
  paint?: Record<string, number>;
}

/**
 * Builds the complete style.
 *
 * @param pmtilesUri  Address of the downloaded file, already with the `pmtiles://` prefix.
 * @param glyphs      Template of the fonts' address, with `{fontstack}` and `{range}`.
 * @param dark        Whether the dark palette is used.
 * @param overlay     Internet tiles for the zooms where the country is not enough.
 */
export function buildVectorStyle(
  pmtilesUri: string,
  glyphs: string,
  dark: boolean,
  overlay?: StyleOverlay | null,
): StyleSpecification {
  const c = dark ? DARK : LIGHT;

  const sources: Record<string, unknown> = {
    [VECTOR_SOURCE]: {
      type: 'vector',
      url: pmtilesUri,
      maxzoom: MAX_DATA_ZOOM,
      attribution: ATTRIBUTION,
    },
  };

  const styleLayers = layers(c);

  if (overlay) {
    sources[OVERLAY_SOURCE] = {
      type: 'raster',
      tiles: overlay.tiles,
      tileSize: 256,
      maxzoom: overlay.maxzoom,
      attribution: overlay.attribution,
    };

    styleLayers.push({
      id: 'far',
      type: 'raster',
      source: OVERLAY_SOURCE,
      maxzoom: overlay.maxzoom,
      ...(overlay.paint ? { paint: overlay.paint } : {}),
    } as (typeof styleLayers)[number]);
  }

  return {
    version: 8,
    glyphs,
    sources,
    layers: styleLayers,
  } as StyleSpecification;
}

/** Name of the Internet tiles' source inside the downloaded map's style. */
const OVERLAY_SOURCE = 'far';

/**
 * From what zoom a country's map is enough to fill the screen.
 *
 * **It is what prevents blank edges.** A downloaded country does not bring the
 * world: it brings the tiles that touch its borders, at every level. When
 * zooming far out, the screen gets bigger than what the file has and the rest
 * shows up blank — exactly what was seen, with the Atlantic drawn and the rest
 * of the screen beige.
 *
 * Below this zoom it stops being worth it and the Internet tiles take over.
 * The arithmetic is simple: the smaller the country, the closer one has to be.
 */
export function regionMinZoom(bbox?: [number, number, number, number]): number {
  // An old manifest may not carry the area. Without it there is no way to know,
  // and 6 is the middle ground: it suits a country the size of Portugal.
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return 6;
  }

  const [west, south, east, north] = bbox;
  const width = Math.max(east - west, north - south, 0.05);

  // 240 = the world's 360° with a margin of one and a half times, so the
  // country is not left swimming in the middle of the screen before swapping.
  const z = Math.log2(240 / width);

  // Never below 3 (half the world is already visible there) nor above 9 (that
  // is already a city, and every country is enough).
  return Math.min(9, Math.max(3, Math.round(z)));
}

function layers(c: Palette): StyleSpecification['layers'] {
  const source = VECTOR_SOURCE;

  /** Cuts the repetition: every layer always points at the same source. */
  const l = (spec: Record<string, unknown>) => ({ source, ...spec });

  return [
    { id: 'background', type: 'background', paint: { 'background-color': c.land } },

    // --- Land and land cover -------------------------------------------

    l({
      id: 'earth',
      type: 'fill',
      'source-layer': 'earth',
      filter: ['==', ['get', 'kind'], 'earth'],
      paint: { 'fill-color': c.land },
    }),

    // Only exists up to zoom 7 and keeps the map from being empty when far out.
    l({
      id: 'landcover',
      type: 'fill',
      'source-layer': 'landcover',
      maxzoom: 8,
      paint: {
        'fill-color': [
          'match',
          ['get', 'kind'],
          ['forest', 'grassland', 'scrub'],
          c.green,
          ['barren', 'glacier'],
          c.landcover,
          c.landcover,
        ],
        'fill-opacity': 0.7,
      },
    }),

    l({
      id: 'landuse-green',
      type: 'fill',
      'source-layer': 'landuse',
      filter: [
        'in',
        ['get', 'kind'],
        [
          'literal',
          [
            'park',
            'forest',
            'wood',
            'grass',
            'grassland',
            'scrub',
            'nature_reserve',
            'national_park',
            'pitch',
            'golf_course',
            'cemetery',
            'allotments',
            'village_green',
            'wetland',
          ],
        ],
      ],
      paint: { 'fill-color': c.green },
    }),

    l({
      id: 'landuse-sand',
      type: 'fill',
      'source-layer': 'landuse',
      filter: ['in', ['get', 'kind'], ['literal', ['beach', 'sand', 'bare_rock']]],
      paint: { 'fill-color': c.sand },
    }),

    l({
      id: 'landuse-built',
      type: 'fill',
      'source-layer': 'landuse',
      minzoom: 10,
      filter: ['in', ['get', 'kind'], ['literal', ['residential', 'commercial', 'retail']]],
      paint: { 'fill-color': c.built },
    }),

    l({
      id: 'landuse-institutional',
      type: 'fill',
      'source-layer': 'landuse',
      minzoom: 11,
      filter: [
        'in',
        ['get', 'kind'],
        [
          'literal',
          ['school', 'hospital', 'university', 'industrial', 'military', 'aerodrome', 'pier'],
        ],
      ],
      paint: { 'fill-color': c.institutional },
    }),

    // --- Water ------------------------------------------------------------

    l({
      id: 'water',
      type: 'fill',
      'source-layer': 'water',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': c.water },
    }),

    // Streams and narrow rivers come as lines, not polygons.
    l({
      id: 'water-line',
      type: 'line',
      'source-layer': 'water',
      minzoom: 11,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': c.waterLine,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11,
          0.5,
          14,
          ['match', ['get', 'kind'], 'stream', 1, 2.5],
          18,
          ['match', ['get', 'kind'], 'stream', 3, 8],
        ],
      },
    }),

    // --- Buildings --------------------------------------------------------

    l({
      id: 'buildings',
      type: 'fill',
      'source-layer': 'buildings',
      minzoom: 13,
      paint: {
        'fill-color': c.building,
        'fill-outline-color': c.buildingLine,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 1],
      },
    }),

    // --- Roads ------------------------------------------------------------
    //
    // Each road takes two layers: the casing first, and the fill on top. That
    // is what makes junctions look like junctions, instead of lines cut by one
    // another. That is why all the casings come first.

    ...ROAD_CLASSES.map((r) =>
      l({
        id: `road-casing-${r.id}`,
        type: 'line',
        'source-layer': 'roads',
        minzoom: r.minzoom,
        filter: r.filter,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c[r.casing],
          'line-width': widthExpression(r.widths, 2),
        },
      }),
    ),

    ...ROAD_CLASSES.map((r) =>
      l({
        id: `road-${r.id}`,
        type: 'line',
        'source-layer': 'roads',
        minzoom: r.minzoom,
        filter: r.filter,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c[r.colour],
          'line-width': widthExpression(r.widths, 0),
        },
      }),
    ),

    // Footpaths are dashed, so they are not mistaken for roads.
    l({
      id: 'paths',
      type: 'line',
      'source-layer': 'roads',
      minzoom: 13,
      filter: ['==', ['get', 'kind'], 'path'],
      paint: {
        'line-color': c.path,
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.6, 18, 2.5],
        'line-dasharray': [2, 2],
      },
    }),

    l({
      id: 'ferries',
      type: 'line',
      'source-layer': 'roads',
      minzoom: 8,
      filter: ['==', ['get', 'kind'], 'ferry'],
      paint: {
        'line-color': c.ferry,
        'line-width': 1.2,
        'line-dasharray': [4, 3],
      },
    }),

    // --- Boundaries -------------------------------------------------------

    l({
      id: 'boundaries',
      type: 'line',
      'source-layer': 'boundaries',
      filter: ['in', ['get', 'kind'], ['literal', ['country', 'region']]],
      paint: {
        'line-color': c.boundary,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 10, 1.6],
        'line-dasharray': [3, 2],
      },
    }),

    // --- Names ------------------------------------------------------------

    l({
      id: 'names-roads',
      type: 'symbol',
      'source-layer': 'roads',
      minzoom: 13,
      filter: ['all', ['has', 'name'], ['!=', ['get', 'kind'], 'path']],
      layout: {
        'symbol-placement': 'line',
        'text-field': NAME,
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 18, 13],
        'text-max-angle': 30,
      },
      paint: {
        'text-color': c.textMinor,
        'text-halo-color': c.halo,
        'text-halo-width': 1.3,
      },
    }),

    l({
      id: 'names-water',
      type: 'symbol',
      'source-layer': 'water',
      minzoom: 10,
      filter: ['has', 'name'],
      layout: {
        'text-field': NAME,
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 16, 14],
      },
      paint: {
        'text-color': c.waterText,
        'text-halo-color': c.halo,
        'text-halo-width': 1,
      },
    }),

    // Small localities only appear when there is room for them.
    l({
      id: 'names-places',
      type: 'symbol',
      'source-layer': 'places',
      filter: ['==', ['get', 'kind'], 'locality'],
      layout: {
        'text-field': NAME,
        'text-font': ['Noto Sans Medium'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          6,
          ['match', ['get', 'kind_detail'], 'city', 13, 10],
          12,
          ['match', ['get', 'kind_detail'], ['city', 'town'], 16, 12],
          16,
          ['match', ['get', 'kind_detail'], ['city', 'town'], 20, 15],
        ],
        'text-anchor': 'center',
        'text-max-width': 8,
      },
      // `min_zoom` comes from the map itself and already carries the order of importance.
      minzoom: 5,
      paint: {
        'text-color': c.text,
        'text-halo-color': c.halo,
        'text-halo-width': 1.6,
      },
    }),

    l({
      id: 'names-countries',
      type: 'symbol',
      'source-layer': 'places',
      maxzoom: 8,
      filter: ['==', ['get', 'kind'], 'country'],
      layout: {
        'text-field': NAME,
        'text-font': ['Noto Sans Medium'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 7, 16],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.1,
        'text-max-width': 7,
      },
      paint: {
        'text-color': c.textMinor,
        'text-halo-color': c.halo,
        'text-halo-width': 1.6,
      },
    }),
  ] as StyleSpecification['layers'];
}

/** A road class: the filter, the colours and the width by zoom. */
interface RoadClass {
  id: string;
  minzoom: number;
  filter: unknown;
  colour: keyof Palette;
  casing: keyof Palette;
  /** Width at three reference zooms: far, medium and close. */
  widths: [number, number, number];
}

const ROAD_CLASSES: RoadClass[] = [
  {
    id: 'minor',
    minzoom: 12,
    filter: ['in', ['get', 'kind'], ['literal', ['minor_road', 'other']]],
    colour: 'minor',
    casing: 'minorCasing',
    widths: [0.5, 2, 12],
  },
  {
    id: 'medium',
    minzoom: 9,
    filter: ['==', ['get', 'kind'], 'medium_road'],
    colour: 'major',
    casing: 'majorCasing',
    widths: [0.8, 3, 15],
  },
  {
    id: 'major',
    minzoom: 6,
    filter: ['==', ['get', 'kind'], 'major_road'],
    colour: 'major',
    casing: 'majorCasing',
    widths: [1, 4, 18],
  },
  {
    id: 'highway',
    minzoom: 4,
    filter: ['in', ['get', 'kind'], ['literal', ['highway', 'aeroway']]],
    colour: 'highway',
    casing: 'highwayCasing',
    widths: [1.2, 5, 22],
  },
];

/**
 * A road's width along the zoom.
 *
 * `extra` is how much wider the casing is than the fill. It grows with the
 * zoom, or it would disappear when the roads get thick.
 */
function widthExpression(widths: [number, number, number], extra: number): unknown {
  const [far, medium, near] = widths;
  return [
    'interpolate',
    ['exponential', 1.5],
    ['zoom'],
    6,
    far + extra * 0.3,
    12,
    medium + extra * 0.6,
    18,
    near + extra,
  ];
}
