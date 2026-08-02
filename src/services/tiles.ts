import { OfflineManager, TransformRequestManager } from '@maplibre/maplibre-react-native';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import { USER_AGENT } from './config';

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

function rasterStyle(tiles: string[], attribution: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles,
        tileSize: 256,
        maxzoom: MAX_TILE_ZOOM,
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

/** Devolve o estilo do mapa conforme o tema do telemóvel. */
export function mapStyleFor(dark: boolean): StyleSpecification {
  return dark ? DARK_STYLE : LIGHT_STYLE;
}
