/**
 * O tempo estimado: como se passa do que o OSRM respondeu para o que se mostra.
 *
 * São três camadas, e a ordem entre elas importa:
 *
 * 1. **O modelo do meio de transporte** (`modelSeconds`) — o que a aplicação
 *    assume para quem vai de carro, a pé ou de bicicleta.
 * 2. **O ritmo medido** — a que velocidade a pessoa anda mesmo, aprendido das
 *    viagens anteriores e afinado durante a que está a decorrer.
 * 3. **A correção manual das definições**, que só vale enquanto não houver ritmo
 *    medido nenhum.
 *
 * **O medido ganha ao adivinhado, e não se multiplicam.** A correção manual e o
 * ritmo medido medem exatamente a mesma coisa — o quanto a estimativa do serviço
 * fica curta por aqui. Multiplicá-los contava-a duas vezes: quem tivesse escolhido
 * 1,5× numa estrada de terra e cujo ritmo medido desse 1,6 via a hora de chegada
 * inflacionada em 2,4×.
 */

import {
  CYCLING_SPEED_MS,
  PACE_MAX,
  PACE_MIN,
  PACE_MIN_DRIVING,
  PACE_LEARN_WEIGHT,
} from '../services/config';
import type { TravelMode } from '../settings';

/**
 * Os segundos que a aplicação assume para um troço, antes de qualquer correção.
 *
 * De carro e a pé é o que o OSRM respondeu: o perfil de carro deles já calcula o
 * tempo à velocidade limite vezes 0,8 onde o limite está marcado — ver
 * `PACE_MIN_DRIVING`.
 *
 * **De bicicleta é que não.** O OSRM assume 15 km/h, que é a velocidade de quem
 * anda de bicicleta a sério. Aqui conta-se com 12,5 — mas só como piso: onde o
 * OSRM já responde mais devagar, é porque sabe da estrada alguma coisa que uma
 * velocidade média não sabe (uma subida que se empurra, um troço de escadas), e
 * nesse caso fica a dele.
 */
export function modelSeconds(
  distanceMeters: number,
  osrmSeconds: number,
  mode: TravelMode,
): number {
  if (mode !== 'cycling' || distanceMeters <= 0) {
    return osrmSeconds;
  }
  return Math.max(osrmSeconds, distanceMeters / CYCLING_SPEED_MS);
}

/**
 * Põe o ritmo medido dentro de limites que fazem sentido.
 *
 * O piso do carro é 1 de propósito: uma hora de chegada que só bata certo a
 * exceder o limite não se promete. Ver `PACE_MIN_DRIVING`.
 */
export function clampPace(raw: number, mode: TravelMode): number {
  const floor = mode === 'driving' ? PACE_MIN_DRIVING : PACE_MIN;
  if (!Number.isFinite(raw)) {
    return floor;
  }
  return Math.min(PACE_MAX, Math.max(floor, raw));
}

/**
 * Junta o ritmo desta viagem ao que já estava guardado.
 *
 * Da primeira vez fica o desta viagem inteiro — não há nada com que o misturar.
 */
export function blendPace(stored: number | null | undefined, measured: number): number {
  return stored == null ? measured : stored + (measured - stored) * PACE_LEARN_WEIGHT;
}
