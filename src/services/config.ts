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
 * Quanto tempo se espera pela lista das paragens, que é a resposta mais pesada
 * de que a aplicação depende.
 *
 * **Os quinze segundos do resto não chegam aqui.** São milhares de paragens, com
 * nome, localidade, linhas e ligações a outros meios — megabytes de JSON, para
 * descarregar e ainda para interpretar, num telemóvel. Em Wi-Fi passa
 * despercebido; nos dados móveis fica mesmo em cima do limite, e aí falha umas
 * vezes sim outras não, sem nada que o distinga do serviço estar em baixo.
 *
 * Pede-se uma vez por sessão, por isso esperar um minuto não custa nada a
 * ninguém: o que a pessoa vê é o indicador a rodar mais um bocado, em vez de um
 * erro a dizer que não há transportes.
 */
export const CARRIS_STOPS_TIMEOUT_MS = 60000;

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

/**
 * Número máximo de negócios pedidos **por grupo de etiquetas**.
 *
 * **Não é por consulta, e a diferença era a avaria.** A Overpass tinha um `out`
 * só no fim de uma união de vários grupos — restaurantes e afins, depois as
 * lojas, depois o alojamento — e o limite aplicava-se ao conjunto. Ela preenche
 * a quota pela ordem dos grupos e, dentro de cada um, **por número de
 * identificação no OpenStreetMap**, que não tem nada que ver com onde as coisas
 * ficam. Numa zona com gente, os 80 lugares iam todos para o primeiro grupo,
 * escolhidos de um lado ao outro da área pedida: das lojas não vinha nenhuma, e
 * dos restaurantes vinham oitenta espalhados pelos quilómetros da consulta, a
 * maior parte fora do que se estava a ver. O ecrã ficava sem pinos **sem erro
 * nenhum** — e numa zona vazia aparecia tudo, o que fazia parecer que às vezes
 * funcionava.
 *
 * Hoje cada grupo leva o seu próprio `out`, e este número é o que cada um pode
 * trazer. Ver `searchInBounds`.
 *
 * **Quarenta e não cem, e isso é sobre o tempo que se espera.** Com três grupos,
 * cem cada um são trezentos lugares por consulta: trezentos conjuntos de
 * etiquetas a resolver do lado da Overpass, umas centenas de kilobytes a
 * descarregar e trezentos símbolos a desenhar no mapa. Num quadrado de meio
 * quilómetro, cento e vinte pinos já é mais do que cabe no ecrã sem se taparem
 * uns aos outros — o que passa disso é trabalho feito para não se ver.
 */
export const MAP_PINS_LIMIT = 40;

/**
 * A que grelha se encaixa a área dos pinos automáticos, em graus.
 *
 * **É isto que faz a cache servir para alguma coisa.** A chave da cache é a área
 * pedida, com quatro casas decimais — ou seja, ao metro. Sem grelha, arrastar o
 * dedo um bocadinho dava uma área diferente, uma chave diferente e **um pedido
 * novo à Overpass**, que é o serviço mais pesado dos três e é mantido por
 * voluntários. A cache existia e quase nunca acertava.
 *
 * Com a grelha, todas as vistas que caem no mesmo quadrado partilham o mesmo
 * pedido. Pede-se um bocado mais do que se vê, e em troca andar às voltas na
 * mesma zona deixa de pedir seja o que for.
 *
 * **O quadrado não pode ser muito maior do que o ecrã.** Tudo o que se pede a
 * mais são lugares que não se vão ver e que ainda assim ocupam lugar no limite
 * da resposta — ver `MAP_PINS_LIMIT`. 0,005° são uns 550 metros, o que acrescenta
 * no máximo um quadrado de cada lado ao que se está a ver. Esteve no dobro disto
 * e pedia-se uma área com quatro vezes a do ecrã.
 */
export const MAP_PINS_GRID_DEG = 0.005;

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
 * A partir de que velocidade se assume que se vai de carro, em metros por segundo.
 *
 * Cinco metros por segundo são 18 km/h — acima do passo de qualquer pessoa e de
 * quase qualquer bicicleta a subir. É o que liga o velocímetro fora da navegação
 * e acelera as leituras do GPS.
 */
export const DRIVING_SPEED_MS = 5;

/**
 * Abaixo de que velocidade se deixa de assumir que se vai de carro.
 *
 * **De propósito diferente do de cima**, e pela mesma razão do travão da
 * poupança de bateria: mudar de ritmo obriga a voltar a subscrever o GPS, e com
 * um único limiar isso ficava a ligar e a desligar em cada semáforo. Dois metros
 * por segundo são 7 km/h.
 */
export const DRIVING_STOP_MS = 2;

/**
 * Quanto tempo se continua "de carro" depois de a velocidade cair.
 *
 * **Sem isto, o velocímetro desaparecia em cada semáforo** e voltava ao
 * arrancar. Um velocímetro mostra zero quando se pára — não se esconde. Um minuto
 * e meio cobre com folga um semáforo, uma fila ou uma paragem para deixar
 * alguém, e continua a desligar-se pouco depois de se estacionar.
 *
 * O custo é ficar mais um minuto e meio a ler o GPS depressa depois de parar,
 * que não se nota na bateria.
 */
export const DRIVING_LINGER_MS = 90000;

/**
 * De quanto em quanto tempo se lê o GPS a andar de carro, fora da navegação.
 *
 * O seguimento normal é de dez em dez segundos, que chega de sobra para o ponto
 * azul acompanhar quem anda a pé. Para um velocímetro não chega: a 90 km/h, dez
 * segundos são duzentos e cinquenta metros, e o número mostrava a velocidade de
 * há um quarteirão. Dois segundos dão um número que se lê como velocímetro.
 *
 * **Só acontece a andar depressa e com o velocímetro ligado.** Parado ou a pé,
 * volta-se aos dez segundos.
 */
export const DRIVING_GPS_INTERVAL_MS = 2000;

/**
 * Até quantos milissegundos entre dois toques ainda contam como um toque duplo.
 *
 * Trezentos é o valor que o próprio Android usa para o duplo toque. Não convém
 * baixá-lo: quem tem menos destreza nos dedos deixa de conseguir acertar, e o
 * segundo toque passa a valer como um toque simples — que aqui faz outra coisa.
 */
export const DOUBLE_TAP_MS = 300;

/**
 * Nota sobre a velocidade, para não se voltar a mexer nela sem pensar.
 *
 * **Vai para o ecrã como o GPS a deu, sem mínimo nem arredondamento para zero.**
 * Houve aqui um limiar que mostrava zero abaixo de meio metro por segundo, para
 * o número não oscilar entre 0 e 2 km/h com o carro parado. O autor pediu o
 * contrário, e tem razão: um velocímetro que mente um bocadinho quando está
 * parado é um velocímetro em que se acredita um bocadinho menos quando anda. O
 * que o recetor mede pelo efeito de Doppler é o que se mostra.
 *
 * A única coisa que continua a não ser um número é o `null`: quando o Android
 * não sabe dizer a velocidade — num túnel, por exemplo — o velocímetro
 * desaparece em vez de dizer zero.
 */

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
 * A que velocidade se anda de bicicleta, em metros por segundo. São 12,5 km/h.
 *
 * O OSRM assume **15 km/h** para uma bicicleta (o `default_speed` do perfil
 * `bicycle.lua`, confirmado no código deles), com um teto de 21. É a velocidade
 * de quem anda de bicicleta a sério; não é a de quem vai para o trabalho, com
 * semáforos, passeios e uma mochila às costas. Daí este valor, pedido pelo autor.
 *
 * **É um piso, não uma substituição:** onde o OSRM já responde mais devagar —
 * uma subida em que se empurra a bicicleta, um caminho de escadas — fica o dele,
 * que sabe da estrada o que este número não sabe. Ver `modelSeconds`.
 */
export const CYCLING_SPEED_MS = 12.5 / 3.6;

/**
 * Quanto tempo é preciso andar antes de o ritmo medido valer alguma coisa.
 *
 * Nos primeiros metros o ritmo não mede nada: um semáforo à saída de casa dava
 * um fator de cinco e a hora de chegada saltava para o dobro. Três minutos
 * chegam para a conta deixar de ser sobre um semáforo e passar a ser sobre a
 * viagem.
 */
export const PACE_MIN_MS = 180000;

/**
 * E quantos metros, pela mesma razão vista pelo outro lado: três minutos parado
 * num nível de passagem não dizem nada sobre o resto do caminho.
 */
export const PACE_MIN_METERS = 500;

/** O máximo que o ritmo medido pode esticar o tempo estimado. */
export const PACE_MAX = 3;

/** E o mínimo que o pode encolher, fora do carro. */
export const PACE_MIN = 0.5;

/**
 * O piso do fator de carro, e é uma decisão e não um número escolhido a esmo.
 *
 * **A aplicação não promete uma hora de chegada que obrigue a exceder o limite.**
 * O OSRM já calcula o tempo à **velocidade limite vezes 0,8** onde o limite está
 * marcado no OpenStreetMap (o `speed_reduction` do `car.lua` deles), e abaixo
 * disso onde não está — 90 numa autoestrada, 55 numa estrada secundária. Ou seja,
 * o tempo dele já é o de quem anda ao limite ou um pouco abaixo, que é o que o
 * autor pediu.
 *
 * Sem este piso, quem conduz depressa ensinava a aplicação a contar com isso, e
 * a hora de chegada passava a só bater certo a passar dos limites. O ritmo medido
 * pode alargar o tempo à vontade — o que não pode é encolhê-lo.
 */
export const PACE_MIN_DRIVING = 1;

/**
 * Quanto do ritmo desta viagem entra no que fica guardado para a próxima.
 *
 * Um terço: uma viagem estranha — um dia de chuva, uma fila que não é normal —
 * mexe no valor guardado sem o virar do avesso, e três ou quatro viagens
 * parecidas chegam para o mudar mesmo.
 */
export const PACE_LEARN_WEIGHT = 0.3;

/**
 * Nome do pedido para o ecrã não se apagar durante a navegação.
 *
 * É preciso ser sempre o mesmo para ligar e desligar: o Android conta os pedidos
 * por nome, e um que fique por levantar deixava o ecrã aceso para sempre.
 */
export const KEEP_AWAKE_TAG = 'palmmap-navegacao';

/**
 * O nome por que o Android conhece a tarefa que recebe as posições a navegar.
 *
 * **Tem de ser sempre o mesmo**, e é por ele que se liga e desliga o serviço em
 * primeiro plano. Trocá-lo entre versões deixava o serviço antigo a correr, com
 * uma notificação que a aplicação nova já não sabe desligar.
 */
export const NAVIGATION_TASK = 'palmmap-navegacao-posicao';

/**
 * Quanto tempo o serviço da navegação continua vivo depois de se largar a
 * subscrição.
 *
 * **Não é folga a mais: é o que impede a navegação de morrer no bolso.** O
 * efeito que segue a posição volta a correr sempre que o percurso, os radares ou
 * o ritmo do GPS mudam, e de cada vez larga a subscrição e faz outra. E o
 * Android **só deixa arrancar um serviço em primeiro plano com a aplicação à
 * frente** — com o ecrã bloqueado, parar e voltar a começar acabava em exceção e
 * a viagem ficava sem posição, precisamente quando só a voz é que guia.
 *
 * Dois segundos cobrem com folga uma troca de subscrição e são curtos demais
 * para alguém dar pela notificação a ficar mais um bocado.
 */
export const SERVICE_STOP_GRACE_MS = 2000;

/**
 * Quanto tempo esperar depois de a pessoa parar de escrever, antes de pesquisar.
 * O Nominatim proíbe pesquisar a cada tecla escrita, por isso este valor não deve
 * ser reduzido sem se perceber bem o que se está a fazer.
 */
export const SEARCH_DEBOUNCE_MS = 1000;

/** Tempo máximo à espera de resposta, em milissegundos. */
export const REQUEST_TIMEOUT_MS = 15000;

/**
 * De onde a aplicação sabe se há versão nova.
 *
 * É a API pública do GitHub, e **responde sem chave nenhuma** porque o
 * repositório é público — o que não é acaso: é a mesma decisão que permite os
 * mapas dos países serem descarregados de um endereço sem autenticação. Ver a
 * nota sobre o repositório ser público, no `CLAUDE.md`.
 *
 * **Não se usa o `/releases/latest`, e a razão é uma armadilha.** Esse endereço
 * devolve a Release publicada mais recentemente, **seja ela qual for** — e neste
 * repositório as Releases não são só APKs: os mapas dos países estão na etiqueta
 * `mapas` e os horários na `horarios`. Bastava gerar mapas depois de compilar
 * para o "latest" passar a ser a Release dos mapas, e a procura de versões
 * deixava de encontrar seja o que fosse. Sem erro nenhum: respondia 200, com uma
 * Release verdadeira que só não era a que interessava.
 *
 * Por isso pede-se a lista e escolhe-se a de maior número entre as `apk-*`.
 * Vinte chegam de sobra: as outras etiquetas são sempre as mesmas quatro, porque
 * cada corrida desses workflows reescreve a sua em vez de criar uma nova.
 */
export const RELEASES_API_URL =
  'https://api.github.com/repos/choso08/PalmMap/releases?per_page=20';

/**
 * Quanto tempo tem de passar entre duas procuras automáticas de versão nova.
 *
 * **Procura-se a cada arranque**, que foi o que o autor pediu: abrir a aplicação
 * é o momento em que atualizar não interrompe nada. Esteve uma vez por dia, e
 * isso queria dizer abrir a aplicação de manhã, sair versão à tarde e só dar por
 * ela no dia seguinte.
 *
 * O quarto de hora é só um travão contra o disparate. A API do GitHub dá 60
 * pedidos por hora a quem não se identifica com uma chave, contados **por
 * endereço IP** — partilhados com tudo o que esteja na mesma rede. Abrir e
 * fechar a aplicação seis vezes seguidas, que é coisa que acontece, não pode
 * valer seis pedidos.
 *
 * Procurar à mão, no botão das definições, não passa por aqui — quem carrega
 * quer saber agora.
 */
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
