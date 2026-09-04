import * as Location from 'expo-location';

import type { Coordinates } from '../types/geo';
import {
  LAST_KNOWN_MAX_AGE_MS,
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
 * Pede a permissão de localização, durante a utilização da aplicação.
 * Devolve true se a pessoa autorizou.
 */
export async function requestPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
}

/**
 * Segue a posição enquanto a navegação está a decorrer.
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

  const subscription = await Location.watchPositionAsync(
    {
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
    },
    (position) => {
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
    },
  );

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
  onChange: (coordinates: Coordinates) => void,
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
      timeInterval: 10000,
      distanceInterval: 50,
    },
    (position) => {
      const coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      record(coordinates, position.timestamp);
      onChange(coordinates);
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
