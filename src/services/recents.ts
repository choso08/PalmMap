import AsyncStorage from '@react-native-async-storage/async-storage';

import { isSamePlace } from './favourites';
import type { Place } from '../types/geo';

/**
 * Os últimos sítios para onde se traçou percurso.
 *
 * Guardados no telemóvel, tal como os favoritos, por isso continuam lá sem
 * Internet. A diferença entre os dois é quem os põe na lista: os favoritos são
 * uma escolha da pessoa, isto acontece sozinho.
 *
 * **Só entra aqui um destino escolhido de propósito.** Um pino largado no mapa
 * por engano, ou um negócio que se abriu para ver o horário e se fechou logo a
 * seguir, não conta — senão a lista enchia-se de coisas que ninguém quis.
 */

const STORAGE_KEY = 'palmmap.recents';

/** Quantos se guardam. Mais do que isto ninguém percorre. */
const LIMIT = 12;

export async function loadRecents(): Promise<Place[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Place[]) : [];
  } catch {
    return [];
  }
}

/**
 * Põe um sítio à cabeça da lista.
 *
 * Se já lá estava, sobe em vez de aparecer duas vezes — a comparação é pela
 * posição e não pelo identificador, porque o mesmo sítio pode chegar pela
 * pesquisa ou por um pino do mapa com identificadores diferentes.
 */
export async function rememberRecent(place: Place): Promise<Place[]> {
  const atuais = await loadRecents();
  const seguinte = [place, ...atuais.filter((p) => !isSamePlace(p, place))].slice(0, LIMIT);

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seguinte));
  } catch {
    // Guardar é secundário: a lista continua a valer nesta sessão.
  }

  return seguinte;
}

/** Esquece tudo. Fica nas definições, para quem não queira este histórico. */
export async function clearRecents(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sem nada guardado, não há nada a apagar.
  }
}
