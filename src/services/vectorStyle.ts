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
  // A autoestrada puxa ao coral do resto da aplicação, mas apagado — a conduzir
  // de noite, uma estrada acesa cansa a vista.
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

/** O nome no idioma local, com o português à frente se existir. */
const NAME: unknown = ['coalesce', ['get', 'name:pt'], ['get', 'name']];

/**
 * Os tiles da Internet a pôr por cima enquanto se está afastado de mais para o
 * mapa guardado servir. Ver `buildVectorStyle`.
 */
export interface StyleOverlay {
  tiles: string[];
  attribution: string;
  /** Zoom a partir do qual deixa de aparecer e o mapa guardado toma conta. */
  maxzoom: number;
  paint?: Record<string, number>;
}

/**
 * Monta o estilo completo.
 *
 * @param pmtilesUri  Endereço do ficheiro guardado, já com o prefixo `pmtiles://`.
 * @param glyphs      Modelo do endereço dos tipos de letra, com `{fontstack}` e `{range}`.
 * @param dark        Se se usa a paleta escura.
 * @param overlay     Tiles da Internet para os zooms em que o país não chega.
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

  const camadas = layers(c);

  if (overlay) {
    sources[OVERLAY_SOURCE] = {
      type: 'raster',
      tiles: overlay.tiles,
      tileSize: 256,
      maxzoom: overlay.maxzoom,
      attribution: overlay.attribution,
    };

    camadas.push({
      id: 'longe',
      type: 'raster',
      source: OVERLAY_SOURCE,
      maxzoom: overlay.maxzoom,
      ...(overlay.paint ? { paint: overlay.paint } : {}),
    } as (typeof camadas)[number]);
  }

  return {
    version: 8,
    glyphs,
    sources,
    layers: camadas,
  } as StyleSpecification;
}

/** Nome da fonte dos tiles da Internet dentro do estilo do mapa guardado. */
const OVERLAY_SOURCE = 'longe';

/**
 * A partir de que zoom é que o mapa de um país chega para encher o ecrã.
 *
 * **É o que impede as bordas em branco.** Um país guardado não traz o mundo:
 * traz os tiles que tocam nas fronteiras dele, a todos os níveis. Ao afastar
 * muito, o ecrã fica maior do que aquilo que o ficheiro tem e o resto aparece
 * liso — foi exatamente o que se viu, com o Atlântico desenhado e o resto do
 * ecrã em bege.
 *
 * Abaixo deste zoom deixa-se de valer a pena e passa-se aos tiles da Internet.
 * A conta é simples: quanto menor é o país, mais perto é preciso estar.
 */
export function regionMinZoom(bbox?: [number, number, number, number]): number {
  // Um manifesto antigo pode não trazer a área. Sem ela não há como saber, e o
  // 6 é o meio-termo: serve para um país do tamanho de Portugal.
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return 6;
  }

  const [oeste, sul, este, norte] = bbox;
  const largura = Math.max(este - oeste, norte - sul, 0.05);

  // 240 = os 360° do mundo com uma folga de uma vez e meia, para o país não
  // ficar a nadar no meio do ecrã antes de se trocar.
  const z = Math.log2(240 / largura);

  // Nunca abaixo de 3 (aí já se vê meio mundo) nem acima de 9 (aí já é uma
  // cidade, e todos os países chegam).
  return Math.min(9, Math.max(3, Math.round(z)));
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
