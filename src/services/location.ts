import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { t } from '../i18n';
import type { Coordinates } from '../types/geo';
import {
  LAST_KNOWN_MAX_AGE_MS,
  NAVIGATION_TASK,
  SERVICE_STOP_GRACE_MS,
  POSITION_FRESH_MS,
  POSITION_TIMEOUT_MS,
} from './config';

/**
 * A última posição que se aceitou, e a que horas foi medida.
 *
 * Guarda-se aqui, e não no ecrã, porque a pergunta "isto ainda serve?" é sobre a
 * leitura em si e não sobre quem a está a usar. Os dois seguimentos escrevem
 * aqui; quem quiser centrar o mapa pergunta ao `getBestPosition()`.
 *
 * **O relógio que conta é o da leitura, não o de quando ela chegou.** O Android
 * entrega às vezes uma posição da cache mal se volta a subscrever o GPS — chega
 * agora, mas é de há uma hora. Comparar com a hora de chegada dava-a como
 * fresquíssima, que é precisamente a avaria que isto evita.
 */
let lastFix: { coordinates: Coordinates; at: number } | null = null;

function record(coordinates: Coordinates, at: number) {
  lastFix = { coordinates, at };
}

/**
 * Quem está à espera das leituras da navegação, quando há navegação a decorrer.
 *
 * Tem de ser uma variável do módulo: o serviço em primeiro plano entrega as
 * posições a uma tarefa registada pelo nome, e essa tarefa é definida uma vez ao
 * carregar o ficheiro — não tem forma de chegar ao componente que pediu para
 * seguir a posição. Isto é a ponte entre as duas coisas.
 */
let navListener: ((position: Location.LocationObject) => void) | null = null;

/** A paragem do serviço, agendada e ainda por acontecer. */
let paragemAgendada: ReturnType<typeof setTimeout> | null = null;

function cancelarParagem() {
  if (paragemAgendada) {
    clearTimeout(paragemAgendada);
    paragemAgendada = null;
  }
}

/**
 * Larga a subscrição e agenda o fim do serviço.
 *
 * **Não pára já**, e é essa a razão de existir: entre duas subscrições seguidas
 * — que acontecem a cada mudança de percurso ou de ritmo do GPS — o serviço tem
 * de continuar vivo, senão o Android recusa-se a voltar a arrancá-lo com a
 * aplicação em segundo plano. Quem chegar a seguir cancela a paragem.
 *
 * Sem ouvinte, as posições que cheguem neste intervalo caem no vazio, que é o
 * que se quer.
 */
function pararServico(): void {
  navListener = null;
  cancelarParagem();
  paragemAgendada = setTimeout(() => {
    paragemAgendada = null;
    void Location.stopLocationUpdatesAsync(NAVIGATION_TASK).catch(() => undefined);
  }, SERVICE_STOP_GRACE_MS);
}

/**
 * A tarefa que recebe as posições enquanto se navega, mesmo de ecrã apagado.
 *
 * **Define-se aqui, fora de tudo, e é de propósito.** O Android entrega as
 * leituras a uma tarefa registada pelo nome; se o registo acontecesse dentro de
 * um componente, uma aplicação que voltasse do fundo da memória não teria a
 * tarefa registada e as leituras chegavam a um sítio que já não existe.
 */
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  NAVIGATION_TASK,
  async ({ data, error }) => {
    if (error || !data) {
      return;
    }
    // Vêm em lote. Só a última interessa: é onde a pessoa está agora, e as
    // anteriores já não mudam nada do que está no ecrã.
    const ultima = data.locations?.[data.locations.length - 1];
    if (ultima) {
      navListener?.(ultima);
    }
  },
);

/** Guarda uma leitura do `expo-location` e devolve só as coordenadas. */
function keep(position: Location.LocationObject): Coordinates {
  const coordinates = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
  record(coordinates, position.timestamp);
  return coordinates;
}

/**
 * Desiste de uma leitura ao fim de `POSITION_TIMEOUT_MS` e devolve `null`.
 *
 * O `getCurrentPositionAsync` **não tem prazo nenhum**: sem sinal, fica à espera
 * indefinidamente. Dentro de casa ou sem rede isso são minutos, e nada que
 * dependa dele pode ficar preso à espera — nem o arranque, nem o botão.
 */
function comPrazo(leitura: Promise<Coordinates | null>): Promise<Coordinates | null> {
  return Promise.race([
    leitura,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), POSITION_TIMEOUT_MS)),
  ]);
}

/**
 * O pedido de permissão que está a decorrer, se houver algum.
 *
 * **No Android não pode haver dois ao mesmo tempo.** O segundo pedido feito com
 * o primeiro ainda aberto rebenta do lado nativo — e uma exceção nativa numa
 * aplicação compilada fecha-a sem mais explicação. Isto acontecia mais do que
 * parece: ao arrancar, o seguimento da posição e a leitura inicial pedem os dois
 * quase ao mesmo tempo. Quem chegar a seguir espera pela resposta do primeiro em
 * vez de abrir outro.
 */
let pedidoEmCurso: Promise<boolean> | null = null;

/**
 * Garante a permissão de localização, durante a utilização da aplicação.
 * Devolve true se a pessoa autorizou.
 *
 * **Pergunta antes de pedir.** Uma vez concedida, nunca mais se abre o diálogo:
 * as vezes seguintes ficam-se por uma consulta, que não tira o foco à aplicação
 * nem pode chocar com outro pedido. Pedir sem necessidade é a diferença entre um
 * arranque calmo e três diálogos a disputarem o mesmo ecrã.
 */
export async function requestPermission(): Promise<boolean> {
  try {
    const atual = await Location.getForegroundPermissionsAsync();
    if (atual.status === Location.PermissionStatus.GRANTED) {
      return true;
    }
    // Recusada de vez: insistir não abre diálogo nenhum e só dá trabalho.
    if (!atual.canAskAgain) {
      return false;
    }
  } catch {
    // Sem resposta à consulta, tenta-se pedir na mesma — é o que havia antes.
  }

  if (!pedidoEmCurso) {
    pedidoEmCurso = Location.requestForegroundPermissionsAsync()
      .then(({ status }) => status === Location.PermissionStatus.GRANTED)
      .catch(() => false)
      .finally(() => {
        pedidoEmCurso = null;
      });
  }

  return pedidoEmCurso;
}

/**
 * Segue a posição enquanto a navegação está a decorrer.
 *
 * **Corre num serviço em primeiro plano**, com notificação permanente, e é isso
 * que faz a navegação continuar com o telemóvel no bolso ou o ecrã apagado. Sem
 * serviço, o Android corta as leituras de GPS assim que a aplicação sai da
 * frente — e a voz calava-se a meio da viagem, precisamente na situação em que
 * ela é tudo o que guia. A notificação é exigida pelo Android e não se pode
 * esconder; é a mesma que qualquer aplicação de navegação mostra.
 *
 * Se o serviço não arrancar — há fabricantes com regras próprias — volta-se à
 * subscrição normal, que funciona com a aplicação à frente. Navegar de ecrã
 * aceso é melhor do que não navegar.
 *
 * Devolve uma função para parar de seguir — é obrigatório chamá-la ao sair da
 * navegação, senão o GPS fica ligado a gastar bateria.
 */
export async function watchPosition(
  onChange: (
    coordinates: Coordinates,
    accuracyMeters: number,
    /**
     * Velocidade em metros por segundo, ou `null` quando o GPS não a soube dizer.
     *
     * **Vem do próprio recetor de GPS**, calculada pelo desvio de frequência do
     * sinal dos satélites — não da diferença entre duas posições. A distinção é
     * toda: com leituras a um segundo e cinco metros de incerteza em cada uma,
     * dividir a distância pelo tempo dava um erro de quase vinte km/h a cada
     * leitura. O efeito de Doppler mede a velocidade diretamente e erra pouco.
     *
     * Por isso não há aqui conta nenhuma de recurso. Quando o telemóvel não diz a
     * velocidade, fica `null` e o velocímetro desaparece — mostrar um número
     * inventado a quem está a conduzir é pior do que não mostrar nada.
     */
    speedMs: number | null,
  ) => void,
  /**
   * De quantos em quantos milissegundos se lê a posição.
   *
   * Um segundo é o normal. A poupança de bateria sobe este valor quando a
   * manobra seguinte ainda vai longe — ver `BATTERY_SAVER_INTERVAL_MS`.
   */
  timeIntervalMs = 1000,
): Promise<() => void> {
  const granted = await requestPermission();
  if (!granted) {
    return () => undefined;
  }

  const entregar = (position: Location.LocationObject) => {
    record(
      { latitude: position.coords.latitude, longitude: position.coords.longitude },
      position.timestamp,
    );
    onChange(
      {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
      // O Android diz a que raio de confiança corresponde esta leitura. Sem
      // isso, uma leitura má é indistinguível de ter mesmo saído do percurso.
      position.coords.accuracy ?? 0,
      // O Android manda -1 quando não tem velocidade para dar, e há telemóveis
      // que mandam null. Os dois querem dizer o mesmo: não sei.
      typeof position.coords.speed === 'number' && position.coords.speed >= 0
        ? position.coords.speed
        : null,
    );
  };

  const opcoes = {
    // Mesmo a poupar, a precisão mantém-se: o que muda é de quanto em quanto
    // tempo se lê, não a qualidade da leitura. Baixar a precisão punha o
    // Android a responder pelas antenas, e aí a posição deixava de servir
    // para navegar.
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: timeIntervalMs,
    // Zero de propósito: com um mínimo de metros, o Android cala-se enquanto a
    // pessoa está parada — e então o painel fica preso no que dizia. Parado
    // num semáforo, o tempo que falta tem de continuar a acertar.
    distanceInterval: 0,
  };

  // --- O caminho normal: serviço em primeiro plano -------------------------
  //
  // **É isto que faz a navegação continuar de ecrã apagado.** Sem serviço, o
  // Android corta as leituras de GPS assim que a aplicação sai da frente — e a
  // voz calava-se a meio da viagem, precisamente quando o telemóvel está no
  // bolso ou noutra aplicação e a voz é tudo o que resta.
  //
  // A contrapartida é a notificação permanente, que o Android exige e não deixa
  // esconder. É o mesmo que qualquer aplicação de navegação mostra.
  //
  // **O serviço não se pára entre subscrições, e essa é a parte mais delicada
  // disto.** O efeito da navegação volta a correr sempre que o percurso, os
  // radares ou o ritmo do GPS mudam, e cada vez que corre larga a subscrição
  // anterior e faz outra. Ora o Android **só deixa arrancar um serviço em
  // primeiro plano com a aplicação à frente**, e o `expo-location` sabe-o: com a
  // aplicação no fundo, o `maybeStartForegroundService` deles **desiste e
  // escreve um aviso no registo** — não lança exceção nenhuma e este `await`
  // resolve-se como se tivesse corrido bem. Ou seja, parar e voltar a começar
  // com o telemóvel no bolso deixava a navegação sem serviço **em silêncio**,
  // que é exatamente quando isto serve para alguma coisa. Por isso a paragem
  // fica agendada por uns segundos e é cancelada se entretanto chegar outra
  // subscrição — ver `SERVICE_STOP_GRACE_MS`. (Lido em
  // `taskConsumers/LocationTaskConsumer.kt`, e não assumido.)
  cancelarParagem();
  const jaCorria = await Location.hasStartedLocationUpdatesAsync(NAVIGATION_TASK).catch(
    () => false,
  );

  try {
    navListener = entregar;
    await Location.startLocationUpdatesAsync(NAVIGATION_TASK, {
      ...opcoes,
      foregroundService: {
        notificationTitle: t().navigation.serviceTitle,
        notificationBody: t().navigation.serviceBody,
        // Se a aplicação for mesmo fechada, o serviço vai com ela. Uma
        // notificação que sobrevive à aplicação é do género de coisa que
        // ninguém consegue desligar sem ir às definições do Android.
        killServiceOnDestroy: true,
      },
    });

    return pararServico;
  } catch {
    if (jaCorria) {
      // Já havia serviço a andar e só não se conseguiu mudar-lhe as opções. O
      // ouvinte já é o novo, por isso as posições continuam a chegar a quem as
      // espera. Perde-se a mudança de ritmo do GPS, que é infinitamente menos
      // do que perder a navegação.
      return pararServico;
    }

    // --- O recuo, se o serviço nunca chegou a arrancar --------------------
    //
    // Não se sabe de antemão o que pode correr mal num telemóvel concreto — uma
    // autorização recusada, um fabricante com regras próprias. Melhor navegar
    // com o ecrã aceso do que não navegar: volta-se à subscrição de sempre, que
    // funciona com a aplicação à frente.
    navListener = null;
  }

  const subscription = await Location.watchPositionAsync(opcoes, entregar);

  return () => subscription.remove();
}

/**
 * Segue a posição fora da navegação, devagar.
 *
 * Serve para o ponto azul acompanhar a pessoa enquanto a aplicação está aberta,
 * como faz o Maps, em vez de ficar preso onde estava ao arrancar. É de propósito
 * muito menos frequente do que o da navegação — de dez em dez segundos, ou a
 * cada cinquenta metros — para não gastar bateria à toa.
 *
 * **Num avião é isto que faz o mapa andar.** Sem rede não há percurso nem
 * pesquisa, mas o GPS continua a dar a posição, e com um país descarregado o
 * mapa desenha-se à volta dela.
 *
 * Devolve uma função para parar de seguir. Chamar sempre ao sair.
 */
export async function watchPositionIdle(
  onChange: (coordinates: Coordinates, speedMs: number | null) => void,
  /**
   * De quantos em quantos milissegundos se lê a posição.
   *
   * Dez segundos é o normal e chega de sobra para o ponto azul acompanhar quem
   * anda a pé. A andar de carro sobe-se o ritmo, para o velocímetro mostrar a
   * velocidade de agora e não a de há um quarteirão — ver `DRIVING_GPS_INTERVAL_MS`.
   */
  timeIntervalMs = 10000,
  /**
   * De quantos em quantos metros se lê a posição. **Zero a andar de carro.**
   *
   * Com um mínimo de metros, o Android cala-se enquanto a pessoa está parada — e
   * aí o velocímetro ficava preso no último número que teve. Quem trava dos 90
   * para zero não anda os cinquenta metros que destrancariam a leitura seguinte,
   * e o ecrã continuava a dizer 90 com o carro imóvel. É a mesma armadilha que a
   * navegação já evita da mesma maneira.
   */
  distanceIntervalMs = 50,
): Promise<() => void> {
  const granted = await requestPermission();
  if (!granted) {
    return () => undefined;
  }

  const subscription = await Location.watchPositionAsync(
    {
      // `High` obriga a usar os satélites. Com `Balanced`, o Android responde a
      // partir das redes Wi-Fi e das antenas de telemóvel à volta — que é rápido
      // em terra e completamente inútil a dez mil metros.
      accuracy: Location.Accuracy.High,
      timeInterval: timeIntervalMs,
      distanceInterval: distanceIntervalMs,
    },
    (position) => {
      const coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      record(coordinates, position.timestamp);
      onChange(
        coordinates,
        // O Android manda -1 quando não tem velocidade para dar, e há telemóveis
        // que mandam null. Os dois querem dizer o mesmo: não sei.
        typeof position.coords.speed === 'number' && position.coords.speed >= 0
          ? position.coords.speed
          : null,
      );
    },
  );

  return () => subscription.remove();
}

/**
 * Uma posição em que se pode confiar para centrar o mapa.
 *
 * Se a última leitura ainda é recente, devolve-se essa — sem esperar por nada,
 * que é o caso normal e o que faz o botão parecer instantâneo. Se já tem idade,
 * vai-se buscar uma nova.
 *
 * **É isto que resolve o mapa ir parar a um sítio onde já se esteve.** Com a
 * aplicação em segundo plano o Android deixa de entregar leituras: quem andou
 * entretanto volta com a posição de onde estava, e o mapa levava-o para lá com
 * toda a confiança. A posição guardada não estava errada — estava velha, e nada
 * no código distinguia as duas coisas.
 *
 * Nunca fica à espera para sempre: ao fim de `POSITION_TIMEOUT_MS` devolve-se o
 * que houver, mesmo que velho. Um mapa no sítio de antes é mau; um botão que não
 * responde é pior, e sem rede o GPS chega a levar minutos a acordar.
 */
export async function getBestPosition(): Promise<Coordinates | null> {
  if (lastFix && Date.now() - lastFix.at < POSITION_FRESH_MS) {
    return lastFix.coordinates;
  }

  const fresca = await comPrazo(getFreshPosition());

  return fresca ?? lastFix?.coordinates ?? null;
}

/**
 * Vai buscar uma posição nova ao GPS, sem passar pela última conhecida.
 *
 * É o que se usa quando a aplicação volta ao ecrã. Aqui o atalho da última
 * conhecida seria contraproducente: é precisamente essa que se desconfia que
 * esteja velha.
 *
 * **Aqui só se pergunta se há permissão — nunca se pede.** Pedir abre um diálogo
 * do sistema, e um diálogo tira o foco à aplicação: o Android dá-a por saída e
 * por reentrada, o que volta a disparar quem está à escuta dessas mudanças e
 * pede outra vez. Quem pede é o arranque, uma vez; daqui em diante só se
 * consulta.
 */
export async function getFreshPosition(): Promise<Coordinates | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) {
      return null;
    }

    const position = await Location.getCurrentPositionAsync({
      // Ver a nota em `watchPositionIdle`: `Balanced` depende da rede.
      accuracy: Location.Accuracy.High,
    });

    const coordinates = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    record(coordinates, position.timestamp);
    return coordinates;
  } catch {
    return null;
  }
}

/**
 * Devolve a posição atual, ou null se não houver permissão ou o GPS falhar.
 *
 * Devolver null em vez de rebentar é intencional: sem localização a aplicação
 * ainda serve para ver o mapa e pesquisar moradas.
 *
 * **Sem rede, a primeira posição demora.** O telemóvel costuma pedir à Internet
 * uma ajuda com a lista de satélites à vista; sem ela tem de a ouvir do próprio
 * sinal, o que leva de trinta segundos a dois minutos com o céu à vista. Por
 * isso devolve-se primeiro a última posição conhecida, para haver logo alguma
 * coisa no ecrã, e o seguimento contínuo trata de a corrigir quando o GPS
 * apanhar sinal.
 */
export async function getCurrentPosition(): Promise<Coordinates | null> {
  try {
    const granted = await requestPermission();
    if (!granted) {
      return null;
    }

    // O `maxAge` impede o atalho de servir uma posição de ontem: o atalho existe
    // para adiantar o arranque, não para adivinhar.
    const conhecida = await Location.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
    });
    if (conhecida) {
      return keep(conhecida);
    }

    // **Com prazo, sempre.** Sem rede o GPS leva de trinta segundos a dois
    // minutos a dar a primeira posição, e sem este limite o arranque ficava à
    // espera disso — de mapa parado e sem ponto azul. Foi assim que a aplicação
    // passou a demorar a abrir.
    const fresca = await comPrazo(getFreshPosition());
    if (fresca) {
      return fresca;
    }

    // Nem recente nem nova a tempo: fica a última conhecida, seja de quando for.
    // Um ponto no sítio de ontem é pouco, mas é mais do que um mapa sem ponto
    // nenhum — e o botão de centrar já não acredita nela, que era o problema.
    const antiga = await Location.getLastKnownPositionAsync();
    return antiga ? keep(antiga) : null;
  } catch {
    return null;
  }
}
