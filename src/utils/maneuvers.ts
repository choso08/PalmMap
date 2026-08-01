import type { OsrmManeuver } from '../types/osrm';

/**
 * Traduz as manobras do OSRM para instruções em português.
 *
 * O OSRM devolve a manobra em duas partes: `type` diz o que se faz e
 * `modifier` diz para que lado. Aqui juntam-se as duas coisas numa frase.
 *
 * Referência dos valores possíveis:
 * https://project-osrm.org/docs/v5.24.0/api/#stepmaneuver-object
 */

/** "left" -> "à esquerda" */
const DIRECTIONS: Record<string, string> = {
  left: 'à esquerda',
  right: 'à direita',
  'slight left': 'ligeiramente à esquerda',
  'slight right': 'ligeiramente à direita',
  'sharp left': 'acentuadamente à esquerda',
  'sharp right': 'acentuadamente à direita',
  straight: 'em frente',
  uturn: 'inversão de marcha',
};

/** "left" -> "esquerda", para as frases onde o "à" não encaixa. */
const SIDES: Record<string, string> = {
  left: 'esquerda',
  right: 'direita',
  'slight left': 'esquerda',
  'slight right': 'direita',
  'sharp left': 'esquerda',
  'sharp right': 'direita',
};

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

/** Junta " para a Rua Augusta" quando se sabe o nome da rua. */
function withStreet(text: string, street: string): string {
  return street ? `${text} para ${street}` : text;
}

/**
 * Escreve a instrução de um passo do percurso.
 *
 * @param maneuver A manobra tal como o OSRM a devolve.
 * @param street Nome da rua onde se segue a seguir (pode ser vazio).
 */
export function describeManeuver(maneuver: OsrmManeuver, street: string): string {
  const { type, modifier, exit } = maneuver;
  const direction = modifier ? DIRECTIONS[modifier] : undefined;
  const side = modifier ? SIDES[modifier] : undefined;

  switch (type) {
    case 'depart':
      return street ? `Siga por ${street}` : 'Comece a viagem';

    case 'arrive':
      if (side) {
        return `Chegou ao destino, à sua ${side}`;
      }
      return 'Chegou ao destino';

    case 'turn':
      if (modifier === 'uturn') {
        return 'Inverta o sentido de marcha';
      }
      if (modifier === 'straight') {
        return withStreet('Siga em frente', street);
      }
      return direction ? withStreet(`Vire ${direction}`, street) : withStreet('Vire', street);

    case 'new name':
      return street ? `Continue por ${street}` : 'Continue em frente';

    case 'continue':
      if (modifier === 'uturn') {
        return 'Inverta o sentido de marcha';
      }
      return direction && modifier !== 'straight'
        ? withStreet(`Continue ${direction}`, street)
        : withStreet('Continue em frente', street);

    case 'merge':
      return side
        ? withStreet(`Junte-se ao trânsito pela ${side}`, street)
        : withStreet('Junte-se ao trânsito', street);

    case 'on ramp':
      return side ? withStreet(`Entre no acesso à ${side}`, street) : withStreet('Entre no acesso', street);

    case 'off ramp':
      return side ? withStreet(`Saia pela ${side}`, street) : withStreet('Saia', street);

    case 'fork':
      return side
        ? withStreet(`Na bifurcação, mantenha-se pela ${side}`, street)
        : withStreet('Na bifurcação, siga', street);

    case 'end of road':
      return direction
        ? withStreet(`No fim da estrada, vire ${direction}`, street)
        : withStreet('No fim da estrada, siga', street);

    case 'roundabout':
    case 'rotary':
      if (exit) {
        return withStreet(`Na rotunda, saia na ${exit}.ª saída`, street);
      }
      return withStreet('Na rotunda, siga', street);

    case 'roundabout turn':
      return direction ? withStreet(`Na rotunda, vire ${direction}`, street) : 'Na rotunda, siga';

    case 'exit roundabout':
    case 'exit rotary':
      return withStreet('Saia da rotunda', street);

    default:
      // Não vale a pena inventar: quando o tipo é desconhecido, dá-se a
      // indicação mais neutra possível.
      return street ? `Continue por ${street}` : 'Continue em frente';
  }
}
