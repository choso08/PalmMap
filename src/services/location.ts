import * as Location from 'expo-location';

import type { Coordinates } from '../types/geo';

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
  onChange: (coordinates: Coordinates, accuracyMeters: number) => void,
): Promise<() => void> {
  const granted = await requestPermission();
  if (!granted) {
    return () => undefined;
  }

  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      // Zero de propósito: com um mínimo de metros, o Android cala-se enquanto a
      // pessoa está parada — e então o painel fica preso no que dizia. Parado
      // num semáforo, o tempo que falta tem de continuar a acertar.
      distanceInterval: 0,
    },
    (position) => {
      onChange(
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
        // O Android diz a que raio de confiança corresponde esta leitura. Sem
        // isso, uma leitura má é indistinguível de ter mesmo saído do percurso.
        position.coords.accuracy ?? 0,
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
      onChange({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    },
  );

  return () => subscription.remove();
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

    const conhecida = await Location.getLastKnownPositionAsync();
    if (conhecida) {
      return {
        latitude: conhecida.coords.latitude,
        longitude: conhecida.coords.longitude,
      };
    }

    const position = await Location.getCurrentPositionAsync({
      // Ver a nota em `watchPositionIdle`: `Balanced` depende da rede.
      accuracy: Location.Accuracy.High,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    return null;
  }
}
