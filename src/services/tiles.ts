import { OfflineManager, TransformRequestManager } from '@maplibre/maplibre-react-native';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import { USER_AGENT } from './config';
import { glyphsTemplate, localStyleSource, type OfflineRegion } from './offlineMap';
import type { SatelliteDetail } from '../settings';
import { buildVectorStyle } from './vectorStyle';

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

function rasterStyle(
  tiles: string[],
  attribution: string,
  maxzoom = MAX_TILE_ZOOM,
  paint?: Record<string, number>,
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
    layers: [{ id: 'base', type: 'raster', source: 'base', ...(paint ? { paint } : {}) }],
  };
}

/**
 * Mapa claro: tiles do OpenStreetMap.
 *
 * Nota: usa-se `tile.openstreetmap.org` diretamente. A forma antiga com
 * subdomínios (`a.`, `b.`, `c.`) está desaconselhada pelo próprio OpenStreetMap.
 */
const LIGHT_STYLE = rasterStyle(
  ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  '© OpenStreetMap',
);

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
const DARK_STYLE = rasterStyle(
  [
    'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  ],
  '© OpenStreetMap © CARTO',
  MAX_TILE_ZOOM,
  // O "dark matter" do CARTO é escuro de propósito, mas de noite ao volante os
  // nomes das ruas quase não se liam. Levantar os pretos e abrir o contraste
  // torna-os legíveis sem estragar o tema — não se mexe mais do que isto, senão
  // deixa de ser um mapa escuro.
  { 'raster-brightness-min': 0.08, 'raster-contrast': 0.18 },
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
 * **Por confirmar:** não foi possível contactar este serviço a partir do
 * ambiente de desenvolvimento, onde o acesso à Internet é limitado. Se o detalhe
 * não aparecer em Portugal, o mais provável é o nome da camada (`LAYERS`) estar
 * errado. Confirma-se abrindo no navegador o endereço com
 * `REQUEST=GetCapabilities` e lendo os nomes que ele devolve.
 */
const DGT_ORTOS =
  'https://ortos.dgterritorio.gov.pt/wms/ortosat2023' +
  '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
  '&LAYERS=ortoSat2023&STYLES=' +
  '&CRS=EPSG:3857&BBOX={bbox-epsg-3857}' +
  '&WIDTH=256&HEIGHT=256&FORMAT=image/jpeg&TRANSPARENT=false';

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
      attribution:
        'Sentinel-2 cloudless por EOX IT Services GmbH (contém dados Copernicus Sentinel modificados 2024)',
    },
    ortos: {
      type: 'raster',
      tiles: [DGT_ORTOS],
      tileSize: 256,
      maxzoom: 18,
      attribution: 'Ortofotos © Direção-Geral do Território',
    },
  },
  layers: [
    { id: 'base', type: 'raster', source: 'base' },
    // Só se pede a partir do 12: mais longe do que isso o Sentinel-2 chega, e
    // não vale a pena incomodar o serviço das ortofotos.
    { id: 'ortos', type: 'raster', source: 'ortos', minzoom: 12 },
  ],
};

/**
 * Devolve o estilo do mapa conforme o tipo escolhido e o tema do telemóvel.
 *
 * O `offline` é o mapa guardado que cobre a zona onde a pessoa está, se houver
 * algum. Quando há, ganha aos tiles da Internet: é mais rápido, não gasta dados
 * e continua a funcionar sem rede. A imagem de satélite é a única coisa que não
 * tem substituto guardado, por isso essa escolha manda sempre.
 */
export function mapStyleFor(
  dark: boolean,
  satellite: boolean,
  offline?: OfflineRegion | null,
  satelliteDetail: SatelliteDetail = 'normal',
): StyleSpecification {
  if (satellite) {
    return satelliteDetail === 'alta' ? SATELLITE_DETAILED_STYLE : SATELLITE_STYLE;
  }
  if (offline) {
    return buildVectorStyle(localStyleSource(offline), glyphsTemplate(), dark);
  }
  return dark ? DARK_STYLE : LIGHT_STYLE;
}
