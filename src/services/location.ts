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
  onChange: (coordinates: Coordinates) => void,
): Promise<() => void> {
  const granted = await requestPermission();
  if (!granted) {
    return () => undefined;
  }

  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      // Uma leitura por segundo, ou a cada 5 metros percorridos.
      timeInterval: 1000,
      distanceInterval: 5,
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
 */
export async function getCurrentPosition(): Promise<Coordinates | null> {
  try {
    const granted = await requestPermission();
    if (!granted) {
      return null;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    return null;
  }
}
