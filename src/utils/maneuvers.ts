import { t } from '../i18n';
import type { OsrmManeuver } from '../types/osrm';

/**
 * Turns OSRM's manoeuvres into instructions in the app's language.
 *
 * OSRM returns the manoeuvre in two parts: `type` says what is done and
 * `modifier` says which way. This file decides **which** manoeuvre it is; **how
 * it is said** lives in each language's table, in `src/i18n`.
 *
 * That split is not tidiness: Portuguese says "Vire à esquerda **para** a Rua
 * Augusta" and English "Turn left **onto** Rua Augusta". Building the sentences
 * here from translated pieces would give one language the other's grammar.
 *
 * Reference for the possible values:
 * https://project-osrm.org/docs/v5.24.0/api/#stepmaneuver-object
 */

/**
 * Icon that illustrates the manoeuvre, from the MaterialCommunityIcons family.
 * It lets the instruction list be read at a glance.
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
 * Writes out the instruction for one step of the route.
 *
 * @param maneuver The manoeuvre exactly as OSRM returns it.
 * @param street Name of the street followed next (may be empty).
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
      // No point inventing anything: when the type is unknown, give the most
      // neutral instruction possible.
      return street ? m.continueOn(street) : m.continueStraight;
  }
}
