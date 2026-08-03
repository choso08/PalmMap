/**
 * Configuração partilhada por todos os serviços externos.
 *
 * Este é o "único sítio" a que o CLAUDE.md se refere: endereços base, User-Agent
 * e intervalo mínimo entre pedidos ficam todos aqui. Se for preciso mudar alguma
 * destas regras, muda-se aqui e não espalhado pelo código.
 */

/**
 * O Nominatim exige um User-Agent que identifique quem está a fazer os pedidos.
 * Pedidos anónimos são recusados. Se este projeto mudar de dono ou de endereço,
 * atualizar esta linha.
 */
export const USER_AGENT = 'PalmMap/1.0 (projeto pessoal; https://github.com/choso08/PalmMap)';

/** Pesquisa de moradas. */
export const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

/**
 * Cálculo de percursos.
 * Tem de ser https:// — o Android bloqueia ligações não seguras desde a versão 9.
 */
export const OSRM_BASE_URL = 'https://router.project-osrm.org';

/**
 * Consulta de negócios e pontos de interesse.
 * É o que permite perguntar "que restaurantes há aqui à volta?".
 */
export const OVERPASS_BASE_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Intervalo mínimo entre pedidos ao Nominatim, em milissegundos.
 * O serviço público permite no máximo 1 pedido por segundo.
 */
export const NOMINATIM_MIN_INTERVAL_MS = 1000;

/**
 * Intervalo mínimo entre pedidos à Overpass.
 * É um serviço partilhado e pesado de correr — convém ser generoso aqui.
 */
export const OVERPASS_MIN_INTERVAL_MS = 2000;

/**
 * Tempo de espera depois de o mapa parar de se mexer, antes de ir buscar os
 * negócios que estão à vista. Evita um pedido por cada arrastar do dedo.
 */
export const MAP_PINS_DEBOUNCE_MS = 1200;

/**
 * Nível de zoom a partir do qual se mostram negócios no mapa.
 * Mais afastado do que isto, a área é enorme e o pedido seria pesadíssimo
 * para devolver pinos que nem se distinguiriam no ecrã.
 */
export const MAP_PINS_MIN_ZOOM = 14;

/** Número máximo de negócios pedidos de cada vez. */
export const MAP_PINS_LIMIT = 80;

/** Raio, em metros, das pesquisas por categoria ("restaurantes perto de mim"). */
export const CATEGORY_SEARCH_RADIUS_M = 1500;

/**
 * Zoom mínimo para os botões de categoria funcionarem.
 *
 * Mais afastado do que isto, a área visível é de dezenas de quilómetros: a
 * consulta seria pesadíssima e devolveria milhares de resultados que nem se
 * distinguiriam no ecrã. Abaixo deste zoom mostra-se um aviso a pedir para
 * aproximar, em vez de fazer o pedido.
 */
export const CATEGORY_MIN_ZOOM = 12;

/** Distância a que se considera que a pessoa saiu do percurso, em metros. */
export const OFF_ROUTE_METERS = 60;

/**
 * Quantas leituras seguidas fora do percurso antes de recalcular.
 *
 * Durante a navegação lê-se uma vez por segundo, por isso isto são oito
 * segundos seguidos a andar longe da linha. Já foi três, e recalculava sozinho
 * a meio de uma viagem: três segundos de mau sinal — um túnel curto, um viaduto,
 * uma rua estreita entre prédios — chegavam.
 *
 * A precisão que o GPS declara também conta, em `App.tsx`: uma leitura que se
 * assume imprecisa não serve para afirmar que se saiu do caminho.
 */
export const OFF_ROUTE_STRIKES = 8;

/** Distância ao destino a partir da qual se considera que se chegou. */
export const ARRIVAL_METERS = 35;

/** Distâncias a que se anuncia a próxima manobra, em metros. */
export const ANNOUNCE_AT_METERS = [400, 80];

/**
 * Nome do pedido para o ecrã não se apagar durante a navegação.
 *
 * É preciso ser sempre o mesmo para ligar e desligar: o Android conta os pedidos
 * por nome, e um que fique por levantar deixava o ecrã aceso para sempre.
 */
export const KEEP_AWAKE_TAG = 'palmmap-navegacao';

/**
 * Quanto tempo esperar depois de a pessoa parar de escrever, antes de pesquisar.
 * O Nominatim proíbe pesquisar a cada tecla escrita, por isso este valor não deve
 * ser reduzido sem se perceber bem o que se está a fazer.
 */
export const SEARCH_DEBOUNCE_MS = 1000;

/** Tempo máximo à espera de resposta, em milissegundos. */
export const REQUEST_TIMEOUT_MS = 15000;
