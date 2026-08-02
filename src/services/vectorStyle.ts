import type { StyleSpecification } from '@maplibre/maplibre-react-native';

/**
 * O estilo do mapa vetorial, para os mapas guardados no telemóvel.
 *
 * ## Porque é que isto tem de existir
 *
 * Com os tiles do OpenStreetMap o mapa vinha pronto: são imagens, já desenhadas
 * do outro lado. Um mapa guardado traz **geometria** — esta linha é uma estrada
 * secundária, este polígono é mar — e não traz cor nenhuma. Somos nós que temos
 * de dizer o que é azul, que espessura tem cada estrada e a partir de que zoom
 * aparece cada coisa. É isso que este ficheiro faz.
 *
 * ## O que está aqui dentro
 *
 * As camadas e os valores usados nos filtros não foram adivinhados: saíram da
 * leitura do próprio ficheiro de São Tomé. É o esquema **Protomaps Basemap
 * v4.15.1**, com as camadas `earth`, `landcover`, `landuse`, `water`, `roads`,
 * `buildings`, `boundaries` e `places`.
 *
 * Ao mudar de versão do mapa, confirmar que os nomes se mantêm — se um filtro
 * deixar de encontrar o que procura, essa camada desaparece do ecrã sem dar
 * erro nenhum. É a avaria mais difícil de perceber neste ficheiro.
 *
 * ## O que ficou de fora, de propósito
 *
 * - **Ícones.** Precisariam de uma folha de imagens à parte. Os negócios já
 *   aparecem como pinos nossos, vindos da Overpass.
 * - **Nomes dos negócios.** Mesma razão: ficariam por cima dos nossos pinos.
 */

/** Nome da fonte dentro do estilo. Usado também ao ligar as camadas nossas. */
export const VECTOR_SOURCE = 'protomaps';

/** Só há tiles até este nível. Acima, o MapLibre amplia a geometria sem borrar. */
const MAX_DATA_ZOOM = 14;

const ATTRIBUTION = '© OpenStreetMap · Protomaps';

/** As cores do mapa, em versão clara e escura. */
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
  land: '#f6f4f0',
  landcover: '#eceadf',
  green: '#d3e6c4',
  sand: '#f2e7c8',
  built: '#eeece7',
  institutional: '#e8e6e0',
  water: '#a8cbe8',
  waterLine: '#8fb9dc',
  building: '#e2ded7',
  buildingLine: '#d3cec5',
  highway: '#f9c97f',
  highwayCasing: '#e0a44b',
  major: '#ffffff',
  majorCasing: '#d8d2c8',
  minor: '#ffffff',
  minorCasing: '#e4dfd6',
  path: '#bda98a',
  ferry: '#7fa8cc',
  boundary: '#a294b0',
  text: '#33302c',
  textMinor: '#6b6560',
  halo: '#f6f4f0',
  waterText: '#4d7ba6',
};

const DARK: Palette = {
  land: '#141a26',
  landcover: '#18202e',
  green: '#1a2a20',
  sand: '#262316',
  built: '#1a2130',
  institutional: '#1c2432',
  water: '#0d1521',
  waterLine: '#1b3049',
  building: '#1f2735',
  buildingLine: '#2a3140',
  highway: '#4a5670',
  highwayCasing: '#2b3345',
  major: '#39435a',
  majorCasing: '#232b3a',
  minor: '#2c3445',
  minorCasing: '#1e2532',
  path: '#3d4455',
  ferry: '#2f4a63',
  boundary: '#4a4157',
  text: '#d5dae3',
  textMinor: '#8f97a5',
  halo: '#0f141d',
  waterText: '#5b7fa8',
};

/** O nome no idioma local, com o português à frente se existir. */
const NAME: unknown = ['coalesce', ['get', 'name:pt'], ['get', 'name']];

/**
 * Monta o estilo completo.
 *
 * @param pmtilesUri  Endereço do ficheiro guardado, já com o prefixo `pmtiles://`.
 * @param glyphs      Modelo do endereço dos tipos de letra, com `{fontstack}` e `{range}`.
 * @param dark        Se se usa a paleta escura.
 */
export function buildVectorStyle(
  pmtilesUri: string,
  glyphs: string,
  dark: boolean,
): StyleSpecification {
  const c = dark ? DARK : LIGHT;

  return {
    version: 8,
    glyphs,
    sources: {
      [VECTOR_SOURCE]: {
        type: 'vector',
        url: pmtilesUri,
        maxzoom: MAX_DATA_ZOOM,
        attribution: ATTRIBUTION,
      },
    },
    layers: layers(c),
  } as StyleSpecification;
}

function layers(c: Palette): StyleSpecification['layers'] {
  const source = VECTOR_SOURCE;

  /** Encurta a repetição: cada camada aponta sempre para a mesma fonte. */
  const l = (spec: Record<string, unknown>) => ({ source, ...spec });

  return [
    { id: 'fundo', type: 'background', paint: { 'background-color': c.land } },

    // --- Terra e ocupação do solo ---------------------------------------

    l({
      id: 'terra',
      type: 'fill',
      'source-layer': 'earth',
      filter: ['==', ['get', 'kind'], 'earth'],
      paint: { 'fill-color': c.land },
    }),

    // Só existe até ao zoom 7 e serve para o mapa não ficar vazio ao longe.
    l({
      id: 'ocupacao',
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
      id: 'uso-verde',
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
      id: 'uso-areia',
      type: 'fill',
      'source-layer': 'landuse',
      filter: ['in', ['get', 'kind'], ['literal', ['beach', 'sand', 'bare_rock']]],
      paint: { 'fill-color': c.sand },
    }),

    l({
      id: 'uso-construido',
      type: 'fill',
      'source-layer': 'landuse',
      minzoom: 10,
      filter: ['in', ['get', 'kind'], ['literal', ['residential', 'commercial', 'retail']]],
      paint: { 'fill-color': c.built },
    }),

    l({
      id: 'uso-equipamentos',
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

    // --- Água -------------------------------------------------------------

    l({
      id: 'agua',
      type: 'fill',
      'source-layer': 'water',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': c.water },
    }),

    // Ribeiras e rios estreitos vêm como linha, não como polígono.
    l({
      id: 'agua-linha',
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

    // --- Edifícios --------------------------------------------------------

    l({
      id: 'edificios',
      type: 'fill',
      'source-layer': 'buildings',
      minzoom: 13,
      paint: {
        'fill-color': c.building,
        'fill-outline-color': c.buildingLine,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 1],
      },
    }),

    // --- Estradas ---------------------------------------------------------
    //
    // Cada estrada leva duas camadas: o contorno primeiro, e o enchimento por
    // cima. É isso que faz os cruzamentos parecerem cruzamentos, em vez de
    // linhas cortadas umas pelas outras. Por isso os contornos vêm todos antes.

    ...ROAD_CLASSES.map((r) =>
      l({
        id: `estrada-contorno-${r.id}`,
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
        id: `estrada-${r.id}`,
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

    // Os caminhos a pé levam tracejado, para não se confundirem com estradas.
    l({
      id: 'caminhos',
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

    // --- Fronteiras -------------------------------------------------------

    l({
      id: 'fronteiras',
      type: 'line',
      'source-layer': 'boundaries',
      filter: ['in', ['get', 'kind'], ['literal', ['country', 'region']]],
      paint: {
        'line-color': c.boundary,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 10, 1.6],
        'line-dasharray': [3, 2],
      },
    }),

    // --- Nomes ------------------------------------------------------------

    l({
      id: 'nomes-estradas',
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
      id: 'nomes-agua',
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

    // As localidades pequenas só aparecem quando há espaço para elas.
    l({
      id: 'nomes-lugares',
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
      // `min_zoom` vem do próprio mapa e já traz a ordem de importância feita.
      minzoom: 5,
      paint: {
        'text-color': c.text,
        'text-halo-color': c.halo,
        'text-halo-width': 1.6,
      },
    }),

    l({
      id: 'nomes-paises',
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

/** Uma classe de estrada: o filtro, as cores e a espessura por zoom. */
interface RoadClass {
  id: string;
  minzoom: number;
  filter: unknown;
  colour: keyof Palette;
  casing: keyof Palette;
  /** Espessura em três zooms de referência: afastado, médio e aproximado. */
  widths: [number, number, number];
}

const ROAD_CLASSES: RoadClass[] = [
  {
    id: 'menor',
    minzoom: 12,
    filter: ['in', ['get', 'kind'], ['literal', ['minor_road', 'other']]],
    colour: 'minor',
    casing: 'minorCasing',
    widths: [0.5, 2, 12],
  },
  {
    id: 'media',
    minzoom: 9,
    filter: ['==', ['get', 'kind'], 'medium_road'],
    colour: 'major',
    casing: 'majorCasing',
    widths: [0.8, 3, 15],
  },
  {
    id: 'principal',
    minzoom: 6,
    filter: ['==', ['get', 'kind'], 'major_road'],
    colour: 'major',
    casing: 'majorCasing',
    widths: [1, 4, 18],
  },
  {
    id: 'autoestrada',
    minzoom: 4,
    filter: ['in', ['get', 'kind'], ['literal', ['highway', 'aeroway']]],
    colour: 'highway',
    casing: 'highwayCasing',
    widths: [1.2, 5, 22],
  },
];

/**
 * A espessura de uma estrada ao longo do zoom.
 *
 * O `extra` é o que o contorno tem a mais do que o enchimento. Cresce com o
 * zoom, senão desapareceria quando as estradas ficam grossas.
 */
function widthExpression(widths: [number, number, number], extra: number): unknown {
  const [longe, medio, perto] = widths;
  return [
    'interpolate',
    ['exponential', 1.5],
    ['zoom'],
    6,
    longe + extra * 0.3,
    12,
    medio + extra * 0.6,
    18,
    perto + extra,
  ];
}
