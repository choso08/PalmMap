import { OfflineManager, TransformRequestManager } from '@maplibre/maplibre-react-native';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import { USER_AGENT } from './config';
import { glyphsTemplate, localStyleSource, type OfflineRegion } from './offlineMap';
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
 * Para voltar à nitidez máxima, pôr 19 — mas percebendo o que se está a trocar.
 */
const MAX_TILE_ZOOM = 17;

function rasterStyle(
  tiles: string[],
  attribution: string,
  maxzoom = MAX_TILE_ZOOM,
): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles,
        tileSize: 256,
        maxzoom,
        attribution,
      },
    },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
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
);

/**
 * Imagem de satélite: Sentinel-2 cloudless, da EOX.
 *
 * É um mosaico do satélite Sentinel-2, do programa Copernicus da União
 * Europeia, com as nuvens removidas. É livre, sem chaves de API, com licença
 * Creative Commons — encaixa nas regras do projeto.
 *
 * **O detalhe tem um limite.** O Sentinel-2 vê a Terra a 10 metros por pixel,
 * o que corresponde mais ou menos ao zoom 14. Vê-se a costa, a floresta, as
 * roças e os terrenos abertos; não se veem casas uma a uma. Imagem de satélite
 * ao pormenor é produto pago em todo o lado — não existe alternativa livre.
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
): StyleSpecification {
  if (satellite) {
    return SATELLITE_STYLE;
  }
  if (offline) {
    return buildVectorStyle(localStyleSource(offline), glyphsTemplate(), dark);
  }
  return dark ? DARK_STYLE : LIGHT_STYLE;
}
