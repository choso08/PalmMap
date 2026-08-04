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
 * Cálculo de percursos, um endereço por meio de transporte.
 *
 * **Porque é que não é o `router.project-osrm.org`.** Esse é o servidor de
 * demonstração do OSRM e só tem o perfil de carro instalado. Pedir-lhe um
 * percurso a pé devolvia na mesma o percurso de carro — com as ruas de sentido
 * único respeitadas, o que a pé não faz sentido nenhum, e com o tempo calculado
 * a velocidade de automóvel. Foi visto: 719 metros a pé davam "2 minutos".
 *
 * Estes são os servidores da FOSSGIS, os mesmos que o openstreetmap.org usa no
 * seu próprio painel de direções. São três instalações separadas, cada uma com
 * o seu perfil — e é por isso que o meio de transporte está no endereço e não
 * só no caminho.
 *
 * Tem de ser https:// — o Android bloqueia ligações não seguras desde a versão 9.
 *
 * As condições de utilização pedem no máximo um pedido por segundo, um
 * `User-Agent` válido e a atribuição ao OpenStreetMap e ao OSRM. Está tudo
 * cumprido: a fila em `osrm.ts`, o `USER_AGENT` aqui em cima e os créditos no
 * ecrã de definições.
 */
export const OSRM_ENDPOINTS = {
  driving: 'https://routing.openstreetmap.de/routed-car',
  walking: 'https://routing.openstreetmap.de/routed-foot',
  cycling: 'https://routing.openstreetmap.de/routed-bike',
} as const;

/**
 * O nome do perfil no caminho do pedido.
 *
 * Cada instalação só tem um perfil, por isso este nome é praticamente
 * decorativo — mas tem de bater certo com o que lá está instalado, senão o
 * servidor responde que não conhece o perfil.
 */
export const OSRM_PROFILE_PATH = {
  driving: 'driving',
  walking: 'foot',
  cycling: 'bike',
} as const;

/**
 * Intervalo mínimo entre pedidos de percurso, em milissegundos.
 * As condições de utilização da FOSSGIS pedem no máximo um por segundo.
 */
export const OSRM_MIN_INTERVAL_MS = 1000;

/**
 * Consulta de negócios e pontos de interesse.
 * É o que permite perguntar "que restaurantes há aqui à volta?".
 */
export const OVERPASS_BASE_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Horas de passagem dos transportes públicos.
 *
 * É a API aberta da Carris Metropolitana, a mesma que a aplicação oficial usa.
 * Cobre a Área Metropolitana de Lisboa e não pede chave nenhuma. Fora dessa
 * área não há equivalente aberto — ver `src/services/transit.ts`.
 */
export const CARRIS_BASE_URL = 'https://api.carrismetropolitana.pt/v2';

/**
 * Intervalo mínimo entre pedidos ao Nominatim, em milissegundos.
 * O serviço público permite no máximo 1 pedido por segundo.
 */
export const NOMINATIM_MIN_INTERVAL_MS = 1000;

/**
 * Intervalo mínimo entre pedidos à Carris Metropolitana.
 *
 * Não há limite publicado. Um segundo é ser bem-educado com um serviço que não
 * nos pede nada em troca — e chega de sobra, porque só se pede quando a pessoa
 * abre a lista ou a manda atualizar.
 */
export const CARRIS_MIN_INTERVAL_MS = 1000;

/**
 * De quanto em quanto tempo se voltam a pedir as horas de passagem, enquanto o
 * painel está aberto. Trinta segundos chega para o número de minutos acertar
 * sem se estar a pedir à toa.
 */
export const ARRIVALS_REFRESH_MS = 30000;

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

/**
 * A que distância da linha do percurso um radar ainda conta como sendo "deste
 * caminho".
 *
 * A consulta traz tudo o que está no retângulo do percurso, incluindo radares de
 * estradas paralelas e da autoestrada que passa ao lado. Avisar por causa desses
 * é pior do que não avisar: ao fim de duas vezes ninguém liga ao aviso.
 */
export const CAMERA_CORRIDOR_M = 40;

/**
 * A que distância se avisa de um radar, em metros.
 *
 * Trezentos metros a 90 km/h são doze segundos — dá para ver o velocímetro e
 * abrandar sem travar de repente.
 */
export const CAMERA_WARN_METERS = 300;

/**
 * Poupança de bateria: de quantos em quantos segundos se lê o GPS quando a
 * manobra seguinte ainda vai longe.
 *
 * A cada segundo, o GPS é a coisa que mais gasta numa viagem longa. Numa reta de
 * autoestrada, ler quatro vezes menos não muda nada do que se vê no ecrã — o que
 * falta continua a acertar e a manobra seguinte está a dez quilómetros.
 */
export const BATTERY_SAVER_INTERVAL_MS = 4000;

/**
 * A partir de que distância à manobra seguinte se pode abrandar as leituras.
 *
 * Abaixo disto volta-se ao segundo a segundo, porque é aí que a posição tem de
 * estar certa: é o que decide se o aviso de virar sai a tempo.
 */
export const BATTERY_SAVER_MIN_METERS = 1500;

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
