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
 * O nome do perfil no caminho do pedido: **sempre `driving`**.
 *
 * Parece errado e não é. O OSRM ignora este segmento do endereço — o perfil
 * verdadeiro é o da instalação, escolhido pelo `routed-car`/`routed-foot`/
 * `routed-bike` do endereço base. Foi confirmado no código do próprio
 * openstreetmap.org, que manda `routed-foot/route/v1/driving/…` para os
 * percursos a pé. Usa-se a mesma forma por ser a que está provada em produção.
 */
export const OSRM_PROFILE_PATH = {
  driving: 'driving',
  walking: 'driving',
  cycling: 'driving',
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
 * Não há limite publicado. Trezentos milissegundos são pouco mais de três
 * pedidos por segundo — bem abaixo do que a aplicação oficial deles faz, e
 * suficientemente educado para um serviço que não nos pede nada em troca.
 *
 * Foi baixado de um segundo por causa do planeamento de trajetos: esse precisa
 * das horas de meia dúzia de paragens ao mesmo tempo, e a um pedido por segundo
 * eram seis segundos de espera a olhar para um indicador a rodar.
 */
export const CARRIS_MIN_INTERVAL_MS = 300;

/**
 * Até que distância se aceita ir a pé para apanhar o autocarro, em metros.
 *
 * Um quilómetro são uns doze minutos a passo normal. Mais do que isso, quem vai
 * a pé até lá já preferia ir a pé o caminho todo.
 */
export const TRANSIT_WALK_MAX_M = 1000;

/**
 * A que velocidade se anda a pé, em metros por segundo.
 *
 * 1,35 m/s são uns 4,9 km/h, o passo normal de um adulto. É o mesmo valor que o
 * perfil de peão do OSRM usa.
 */
export const WALK_SPEED_MS = 1.35;

/**
 * Quanto se acrescenta à distância em linha reta para chegar à distância real.
 *
 * Entre dois pontos de uma cidade anda-se sempre mais do que a linha reta,
 * porque há quarteirões pelo meio. Um terço a mais é a aproximação habitual — e
 * chega, porque isto só serve para ordenar opções e dizer "cinco minutos a pé".
 */
export const WALK_DETOUR = 1.3;

/**
 * De quanto em quanto tempo se voltam a pedir as horas de passagem, enquanto o
 * painel está aberto. Trinta segundos chega para o número de minutos acertar
 * sem se estar a pedir à toa.
 */
export const ARRIVALS_REFRESH_MS = 30000;

/**
 * Há quanto tempo, no máximo, um autocarro pode ter dado sinal para ainda contar
 * como estando a andar.
 *
 * **Isto é o que faz a funcionalidade valer alguma coisa.** O serviço devolve a
 * frota inteira com a última posição conhecida de cada veículo, e não só os que
 * andam. Medido de madrugada: 1550 veículos com posição, idade mediana de nove
 * horas, a pior de doze dias — quase todos parados em garagens.
 *
 * Dois minutos são generosos para uma posição que costuma vir de trinta em
 * trinta segundos, e apertados o suficiente para deixar de fora tudo o que está
 * estacionado.
 */
export const VEHICLE_MAX_AGE_S = 120;

/**
 * De quanto em quanto tempo se voltam a pedir as posições dos autocarros.
 *
 * Vinte segundos é o compromisso: mais depressa não traz posições novas, porque
 * é mais ou menos a esse ritmo que os autocarros as dão, e mais devagar dava a
 * impressão de estarem a saltar em vez de andarem.
 */
export const VEHICLES_REFRESH_MS = 20000;

/**
 * Zoom mínimo para se mostrarem os autocarros a andar.
 *
 * **A razão principal é o peso, não o ecrã.** A resposta é a frota toda —
 * 1,1 MB, sem forma de pedir menos, porque não há filtro por área nem por linha.
 * É o pedido mais pesado desta aplicação, e não deve estar a repetir-se quando
 * se está a olhar para o país inteiro.
 */
export const VEHICLES_MIN_ZOOM = 12;

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
export const MAP_PINS_MIN_ZOOM = 15;

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
 * A partir de que idade uma posição deixa de servir para centrar o mapa.
 *
 * Fora da navegação o GPS é lido de dez em dez segundos, e só quando a pessoa se
 * mexe — parada, pode passar muito mais tempo sem leitura nenhuma, e isso é
 * normal. **Com a aplicação em segundo plano, o Android corta as leituras de
 * vez**, e é aí que isto conta: quem andou com a aplicação fechada volta com uma
 * posição do sítio onde estava antes. Passado este tempo, vai-se buscar uma nova
 * em vez de se acreditar na que está guardada.
 */
export const POSITION_FRESH_MS = 20000;

/**
 * Quanto tempo se espera por uma posição nova antes de desistir dela.
 *
 * Sem rede, o GPS pode levar minutos a dar a primeira posição — esperar por ela
 * de botão carregado era deixar a aplicação a parecer encravada. Ao fim disto
 * usa-se o que houver.
 */
export const POSITION_TIMEOUT_MS = 4000;

/**
 * Que idade máxima pode ter a última posição conhecida para servir no arranque.
 *
 * O atalho existe para haver logo alguma coisa no ecrã enquanto o GPS acorda, e
 * isso continua a valer. Mas sem limite nenhum ele servia uma posição de ontem:
 * quem usou a aplicação em casa e a abre no trabalho via o mapa a abrir em casa,
 * com toda a confiança.
 */
export const LAST_KNOWN_MAX_AGE_MS = 120000;

/**
 * Até quantos milissegundos entre dois toques ainda contam como um toque duplo.
 *
 * Trezentos é o valor que o próprio Android usa para o duplo toque. Não convém
 * baixá-lo: quem tem menos destreza nos dedos deixa de conseguir acertar, e o
 * segundo toque passa a valer como um toque simples — que aqui faz outra coisa.
 */
export const DOUBLE_TAP_MS = 300;

/**
 * Abaixo de que velocidade se mostra zero, em metros por segundo.
 *
 * O GPS nunca diz exatamente zero: parado num semáforo, a velocidade oscila umas
 * décimas por causa do ruído do sinal. Sem este mínimo, o velocímetro andava a
 * saltar entre 0 e 2 km/h com o carro imóvel — que é o género de pormenor que faz
 * duvidar do resto do número.
 *
 * Meio metro por segundo é 1,8 km/h: fica abaixo do passo de uma pessoa, por isso
 * não esconde nada de quem vai a pé.
 */
export const SPEED_ZERO_MS = 0.5;

/**
 * Quanto se pode passar do limite antes de o velocímetro ficar vermelho, em km/h.
 *
 * Não é permissividade: é a margem do próprio velocímetro. A velocidade do GPS
 * tem alguns km/h de incerteza, e um aviso que acende exatamente no limite
 * acendia-se sozinho a velocidade constante — e um aviso que se acende sem razão
 * deixa de ser lido.
 */
export const SPEED_OVER_LIMIT_KMH = 5;

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
