import { OfflineManager, TransformRequestManager } from '@maplibre/maplibre-react-native';
import { t } from '../i18n';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import { USER_AGENT } from './config';
import { glyphsTemplate, localStyleSource, type OfflineRegion } from './offlineMap';
import type { MapType, SatelliteDetail } from '../settings';
import { buildVectorStyle, regionMinZoom } from './vectorStyle';

/**
 * Configuração dos tiles do mapa (as imagens que formam o mapa no ecrã).
 */

/**
 * Faz com que os pedidos de tiles levem o nosso User-Agent, como o OpenStreetMap
 * exige. Chamar uma vez, no arranque da aplicação.
 */
export function configureTileRequests(): void {
  TransformRequestManager.addHeader({
    id: 'user-agent',
    name: 'User-Agent',
    value: USER_AGENT,
  });

}

/**
 * Define quanto do mapa já visto se guarda no telemóvel.
 *
 * Isto é cache normal: só fica o que a pessoa chegou mesmo a ver, à medida que
 * o vê. **Não é descarregar uma área** — as regras do OpenStreetMap proíbem
 * expressamente ir buscar tiles à frente para uso offline.
 *
 * Não há forma de dizer "guarda durante um mês": a API do MapLibre só tem
 * tamanho. Na prática é o tamanho que manda no tempo — quando enche, vai
 * deitando fora o que há mais tempo não se vê. Quanto maior, mais tempo as
 * zonas por onde se passou continuam disponíveis.
 */
export function setMapCacheSize(megabytes: number): void {
  void OfflineManager.setMaximumAmbientCacheSize(megabytes * 1024 * 1024).catch(
    () => undefined,
  );

  // Com o tamanho a zero, o que já lá estava continuaria guardado. Quem desliga
  // isto quer o espaço de volta, por isso esvazia-se de caminho.
  if (megabytes === 0) {
    void OfflineManager.clearAmbientCache().catch(() => undefined);
  }
}

/** Esquece o mapa guardado. Usar quando se quer libertar espaço. */
export async function clearMapCache(): Promise<void> {
  await OfflineManager.clearAmbientCache();
}

/**
 * Último nível de zoom que se vai mesmo buscar ao servidor.
 *
 * Acima disto o MapLibre amplia os tiles deste nível em vez de pedir novos. Fica
 * um pouco menos nítido quando se aproxima muito, mas há duas vantagens grandes:
 *
 * - **Offline:** os níveis 18 e 19 passam a funcionar a partir dos tiles do 17,
 *   que já estão guardados. Sem isto, aproximar-se sem rede dava mapa em branco.
 * - **Menos pedidos:** cada nível de zoom a mais quadruplica o número de tiles.
 *   Cortar dois níveis tira cerca de dezasseis vezes o peso posto no servidor do
 *   OpenStreetMap, que é mantido por donativos.
 *
 * **Porque é que está no 18 e não mais baixo.** Ao 17 as letras dos tiles ficavam
 * enormes e moles assim que se aproximava um pouco mais: os nomes vêm desenhados
 * dentro da imagem, por isso ampliar o mapa amplia-os também. O 18 corta essa
 * ampliação a metade e é o compromisso que se aguenta a olhar.
 *
 * Isto não acontece nos mapas guardados: aí o texto é desenhado por nós, ao
 * tamanho certo, seja qual for o zoom. É mais uma razão para descarregar o país.
 */
const MAX_TILE_ZOOM = 18;

/**
 * A cor por baixo dos tiles, para quando eles não chegam.
 *
 * Sem isto, um tile que falta deixa ver o vazio, que o MapLibre desenha a preto.
 * Foi o que deu o "fica tudo preto" ao afastar sem rede. Com uma cor por baixo,
 * a falta de um tile parece um mapa por carregar em vez de uma avaria.
 */
const VAZIO_CLARO = '#EFE6D9';
const VAZIO_ESCURO = '#0B1319';

function rasterStyle(
  tiles: string[],
  attribution: string,
  maxzoom = MAX_TILE_ZOOM,
  paint?: Record<string, number>,
  fundo = VAZIO_CLARO,
): StyleSpecification {
  return {
    version: 8,
    // Os estilos de imagem também declaram os tipos de letra. Sem isto, escrever
    // o nome de um negócio por cima do mapa não desenhava nada — foi o que
    // aconteceu da primeira vez que se tentou.
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
      { id: 'fundo', type: 'background', paint: { 'background-color': fundo } },
      { id: 'base', type: 'raster', source: 'base', ...(paint ? { paint } : {}) },
    ],
  };
}

/** Os endereços dos tiles, à parte: o mapa guardado também os usa ao longe. */
const OSM_TILES = ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];
const CARTO_TILES = [
  'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
];

/** Ver a nota em `DARK_STYLE`: o "dark matter" do CARTO precisa de ser levantado. */
const CARTO_PAINT = { 'raster-brightness-min': 0.08, 'raster-contrast': 0.18 };

/**
 * Mapa claro: tiles do OpenStreetMap.
 *
 * Nota: usa-se `tile.openstreetmap.org` diretamente. A forma antiga com
 * subdomínios (`a.`, `b.`, `c.`) está desaconselhada pelo próprio OpenStreetMap.
 */
const LIGHT_STYLE = rasterStyle(OSM_TILES, '© OpenStreetMap');

/**
 * Mapa escuro: tiles "dark matter" do CARTO, que são feitos a partir dos dados
 * do OpenStreetMap.
 *
 * O OpenStreetMap não tem versão escura dos seus tiles, por isso é preciso outra
 * fonte. O CARTO é gratuito para uso não comercial, desde que se dê a atribuição
 * — e o documento original do projeto já o referia como opção. Continua sem
 * chaves de API e sem nada do Google.
 *
 * Os quatro endereços são o mesmo serviço: distribuir os pedidos por vários
 * subdomínios permite ao telemóvel descarregar mais tiles em paralelo.
 */
// O "dark matter" do CARTO é escuro de propósito, mas de noite ao volante os
// nomes das ruas quase não se liam. Levantar os pretos e abrir o contraste
// torna-os legíveis sem estragar o tema — não se mexe mais do que isto, senão
// deixa de ser um mapa escuro.
const DARK_STYLE = rasterStyle(
  CARTO_TILES,
  '© OpenStreetMap © CARTO',
  MAX_TILE_ZOOM,
  CARTO_PAINT,
  VAZIO_ESCURO,
);

/**
 * Imagem de satélite: Sentinel-2 cloudless, da EOX.
 *
 * É um mosaico do satélite Sentinel-2, do programa Copernicus da União
 * Europeia, com as nuvens removidas. É livre, sem chaves de API, com licença
 * Creative Commons — encaixa nas regras do projeto.
 *
 * **O detalhe tem um limite físico.** O Sentinel-2 vê a Terra a 10 metros por
 * pixel, o que corresponde mais ou menos ao zoom 14. Vê-se a costa, a floresta,
 * as roças e os terrenos abertos; não se veem casas uma a uma. Isto não é uma
 * limitação do código: é o que o satélite consegue ver, e não há nenhuma fonte
 * livre e mundial que veja melhor.
 *
 * O `maxzoom` fica no 14 de propósito: acima disso o MapLibre amplia o que já
 * tem, em vez de pedir tiles que não trazem mais informação nenhuma.
 *
 * A atribuição é exigida pela licença e tem de aparecer tal como está aqui.
 */
const SATELLITE_STYLE = rasterStyle(
  ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'],
  'Sentinel-2 cloudless por EOX IT Services GmbH (contém dados Copernicus Sentinel modificados 2024)',
  14,
);

/**
 * Ortofotos oficiais da Direção-Geral do Território, **só de Portugal**.
 *
 * O Sentinel-2 vê a 10 metros por pixel. Estas são fotografias tiradas de avião,
 * publicadas pelo Estado como dados abertos, e vêem a menos de um metro — dá
 * para distinguir casas, carros e as marcas da estrada. É a única forma de ter
 * mais detalhe sem pagar e sem chaves de API.
 *
 * **Vai por cima do Sentinel-2, não em vez dele.** Isso resolve duas coisas ao
 * mesmo tempo: fora de Portugal continua a ver-se o mundo todo, e se este
 * serviço estiver em baixo ou mudar de endereço, o que aparece é a imagem de
 * sempre em vez de um ecrã vazio.
 *
 * São imagens do satélite Pléiades-Neo de 2023, de muito alta resolução,
 * publicadas pela Direção-Geral do Território para todo o Portugal continental.
 *
 * **Atenção ao nome da camada.** Este serviço publica duas, e a diferença não é
 * cosmética:
 *
 * - `ortoSat2023-CorVerdadeira` — as cores como o olho as vê. **É esta.**
 * - `ortoSat2023-FalsaCor` — infravermelho próximo no lugar do vermelho. Serve
 *   para estudar vegetação, e **põe todo o campo e todas as árvores a vermelho
 *   vivo**. Foi o que aconteceu à primeira: pedir só `ortoSat2023` dava esta.
 *
 * O nome não pôde ser lido daqui — o ambiente de desenvolvimento não chega a
 * este servidor. Saiu da documentação da própria Direção-Geral do Território.
 */
const DGT_ORTOS =
  'https://ortos.dgterritorio.gov.pt/wms/ortosat2023' +
  '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
  '&LAYERS=ortoSat2023-CorVerdadeira&STYLES=' +
  '&CRS=EPSG:3857&BBOX={bbox-epsg-3857}' +
  // 512 pixéis para um quadrado que se desenha a 256: cada tile chega com o
  // dobro da resolução em cada lado, ou seja quatro vezes mais pixéis. Num ecrã
  // de telemóvel, que já é de dois ou três pontos por pixel, a diferença vê-se.
  //
  // Isto é melhor do que pedir mais um nível de zoom: dá o mesmo detalhe com um
  // quarto dos pedidos feitos a um serviço público.
  '&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg&TRANSPARENT=false';

/**
 * Satélite com o detalhe das ortofotos onde as houver.
 *
 * O teto de zoom 18 é por educação: cada nível a mais quadruplica os pedidos
 * feitos a um serviço público, e ao 18 já se distingue o que é preciso.
 */
const SATELLITE_DETAILED_STYLE: StyleSpecification = {
  version: 8,
  glyphs: glyphsTemplate(),
  sources: {
    base: {
      type: 'raster',
      tiles: [
        'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg',
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
      // **Só Portugal continental.** Sem isto o MapLibre pedia estas imagens em
      // todo o mundo, e como o serviço responde em JPEG opaco — sem
      // transparência — o que voltava era um retângulo de fundo por cima da
      // imagem de satélite, em vez de nada.
      bounds: [-9.6, 36.9, -6.1, 42.2],
      attribution: t().attributions.orthophotos,
    },
  },
  layers: [
    // A mesma cor por baixo que o `rasterStyle` põe: um tile em falta deixava
    // ver o vazio, que o MapLibre desenha a preto.
    { id: 'fundo', type: 'background', paint: { 'background-color': VAZIO_CLARO } },
    { id: 'base', type: 'raster', source: 'base' },
    // Só se pede a partir do 12: mais longe do que isso o Sentinel-2 chega, e
    // não vale a pena incomodar o serviço das ortofotos.
    { id: 'ortos', type: 'raster', source: 'ortos', minzoom: 12 },
  ],
};

/**
 * A rede de transportes públicos: a ÖPNVKarte.
 *
 * Desenha os **percursos** dos autocarros, comboios, metros, elétricos e barcos,
 * cada linha com a sua cor, mais as paragens e as estações. É feita a partir dos
 * dados do OpenStreetMap e é uma das camadas oficiais do openstreetmap.org.
 *
 * É um mapa completo, e não uma camada por cima: traz a sua própria base, mais
 * apagada de propósito, para os percursos se destacarem. É por isso que entra
 * como um tipo de mapa e não como um interruptor.
 *
 * Sem chaves de API, com licença aberta — encaixa nas regras do projeto. **A
 * atribuição é exigida pela licença** e tem de aparecer tal como está aqui.
 *
 * Uma ressalva honesta: mostra por onde as linhas passam, não a que horas
 * passam. Horários a sério obrigariam a dados GTFS de cada operador, que não
 * existem num sítio só nem de forma aberta em todo o lado.
 */
const TRANSIT_STYLE = rasterStyle(
  ['https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png'],
  'Mapa memomaps.de CC-BY-SA · dados © OpenStreetMap',
  // A ÖPNVKarte não desenha acima do 18. Pedir mais era pedir o que não há.
  18,
);

/**
 * Devolve o estilo do mapa conforme o tipo escolhido e o tema do telemóvel.
 *
 * O `offline` é o mapa guardado que cobre a zona onde a pessoa está, se houver
 * algum. Quando há, ganha aos tiles da Internet: é mais rápido, não gasta dados
 * e continua a funcionar sem rede.
 *
 * **O satélite e os transportes mandam sempre**, porque são os dois únicos que
 * não têm substituto guardado: um é fotografia, o outro traz informação que o
 * mapa vetorial não tem. Escolher um deles é escolher precisar de rede.
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
    // Ao afastar muito, o país guardado deixa de encher o ecrã e o resto ficava
    // liso. Por baixo desse zoom mostram-se os tiles da Internet por cima do
    // mapa guardado — quando não há rede não aparecem, e o que fica à vista é o
    // país outra vez, que é o melhor que se consegue sem rede.
    return buildVectorStyle(localStyleSource(offline), glyphsTemplate(), dark, {
      tiles: dark ? CARTO_TILES : OSM_TILES,
      attribution: dark ? '© OpenStreetMap © CARTO' : '© OpenStreetMap',
      maxzoom: regionMinZoom(offline.bbox),
      ...(dark ? { paint: CARTO_PAINT } : {}),
    });
  }
  return dark ? DARK_STYLE : LIGHT_STYLE;
}
