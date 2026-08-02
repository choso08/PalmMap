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

function rasterStyle(tiles: string[], attribution: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles,
        tileSize: 256,
        maxzoom: 19,
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
