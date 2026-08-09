import { t } from '../i18n';
import type { OsrmManeuver } from '../types/osrm';

/**
 * Traduz as manobras do OSRM para instruções na língua da aplicação.
 *
 * O OSRM devolve a manobra em duas partes: `type` diz o que se faz e
 * `modifier` diz para que lado. Aqui decide-se **que** manobra é; **como se
 * diz** está na tabela de cada língua, em `src/i18n`.
 *
 * Essa separação não é arrumação: em português diz-se "Vire à esquerda **para**
 * a Rua Augusta" e em inglês "Turn left **onto** Rua Augusta". Montar as frases
 * aqui a partir de pedaços traduzidos dava uma das línguas com a gramática da
 * outra.
 *
 * Referência dos valores possíveis:
 * https://project-osrm.org/docs/v5.24.0/api/#stepmaneuver-object
 */

/**
 * Ícone que ilustra a manobra, da família MaterialCommunityIcons.
 * Serve para a lista de instruções se ler de relance.
 */
export function maneuverIcon(type: string, modifier?: string): string {
  if (type === 'arrive') {
    return 'flag-checkered';
  }
  if (type === 'depart') {
    return 'map-marker';
  }
  if (type === 'roundabout' || type === 'rotary' || type === 'roundabout turn') {
    return 'rotate-right';
  }
  if (modifier === 'uturn') {
    return 'arrow-u-left-top';
  }

  switch (modifier) {
    case 'left':
    case 'sharp left':
      return 'arrow-left';
    case 'right':
    case 'sharp right':
      return 'arrow-right';
    case 'slight left':
      return 'arrow-top-left';
    case 'slight right':
      return 'arrow-top-right';
    default:
      return 'arrow-up';
  }
}

/**
 * Escreve a instrução de um passo do percurso.
 *
 * @param maneuver A manobra tal como o OSRM a devolve.
 * @param street Nome da rua onde se segue a seguir (pode ser vazio).
 */
export function describeManeuver(maneuver: OsrmManeuver, street: string): string {
  const m = t().maneuvers;
  const { type, modifier, exit } = maneuver;
  const direction = modifier ? m.directions[modifier] : undefined;
  const side = modifier ? m.sides[modifier] : undefined;
  const onto = (text: string) => m.onto(text, street);

  switch (type) {
    case 'depart':
      return street ? m.departOn(street) : m.depart;

    case 'arrive':
      return side ? m.arriveSide(side) : m.arrive;

    case 'turn':
      if (modifier === 'uturn') {
        return m.uturn;
      }
      if (modifier === 'straight') {
        return onto(m.straightOn);
      }
      return onto(direction ? m.turn(direction) : m.turnPlain);

    case 'new name':
      return street ? m.continueOn(street) : m.continueStraight;

    case 'continue':
      if (modifier === 'uturn') {
        return m.uturn;
      }
      return direction && modifier !== 'straight'
        ? onto(m.continueTowards(direction))
        : onto(m.continueStraight);

    case 'merge':
      return onto(side ? m.mergeSide(side) : m.merge);

    case 'on ramp':
      return onto(side ? m.onRampSide(side) : m.onRamp);

    case 'off ramp':
      return onto(side ? m.offRampSide(side) : m.offRamp);

    case 'fork':
      return onto(side ? m.forkSide(side) : m.fork);

    case 'end of road':
      return onto(direction ? m.endOfRoadTurn(direction) : m.endOfRoad);

    case 'roundabout':
    case 'rotary':
      return onto(exit ? m.roundaboutExit(exit) : m.roundabout);

    case 'roundabout turn':
      return direction ? onto(m.roundaboutTurn(direction)) : m.roundabout;

    case 'exit roundabout':
    case 'exit rotary':
      return onto(m.exitRoundabout);

    default:
      // Não vale a pena inventar: quando o tipo é desconhecido, dá-se a
      // indicação mais neutra possível.
      return street ? m.continueOn(street) : m.continueStraight;
  }
}
