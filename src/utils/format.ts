import { t } from '../i18n';

/**
 * Functions that turn numbers into readable text.
 *
 * They read the language at the moment they are called. **The decimal
 * separator is what shows the most**: Portuguese writes 12,4 km and English
 * 12.4 km — leaving the comma on an English screen is one of those things that
 * make an app look badly translated even with everything else right.
 */

/** Puts the language's decimal separator into an already formatted number. */
function decimal(text: string): string {
  return text.replace('.', t().units.decimal);
}

/**
 * 850 -> "850 metres"; 12400 -> "12.4 kilometres". The same distance, for the
 * voice.
 *
 * **Abbreviations are not spoken.** "850 m" reads in an instant when written
 * and comes out as "eight hundred and fifty em" when the voice says it — the
 * kind of detail that makes an app sound like a badly programmed robot,
 * precisely when one is driving and only has one's ears.
 */
export function formatDistanceSpoken(meters: number): string {
  const u = t().units;

  if (meters < 1000) {
    return `${Math.round(meters)} ${u.metresSpoken}`;
  }

  const km = meters / 1000;
  const text = km < 10 ? km.toFixed(1) : Math.round(km).toString();
  return `${decimal(text)} ${u.kilometresSpoken}`;
}

/**
 * 1.3 -> "1.3×". The learnt pace, for the settings screen.
 *
 * One decimal place is enough: the difference between 1.32 and 1.35 changes no
 * decision for whoever is reading, and two digits give the number an air of
 * precision it does not have.
 */
export function formatFactor(factor: number): string {
  return `${decimal(factor.toFixed(1))}\u00d7`;
}

/** 850 -> "850 m"; 12400 -> "12.4 km" */
export function formatDistance(meters: number): string {
  const u = t().units;

  if (meters < 1000) {
    return `${Math.round(meters)} ${u.metres}`;
  }

  const km = meters / 1000;
  // Below 10 km one decimal place is shown; above that it isn't worth it.
  const text = km < 10 ? km.toFixed(1) : Math.round(km).toString();
  return `${decimal(text)} ${u.kilometres}`;
}

/** 90 -> "2 min"; 5400 -> "1 h 30 min" */
export function formatDuration(seconds: number): string {
  const u = t().units;
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} ${u.minutes}`;
  }
  if (minutes === 0) {
    return `${hours} ${u.hours}`;
  }
  return `${hours} ${u.hours} ${minutes} ${u.minutes}`;
}

/**
 * Area as text: 340 m², 1.2 ha, 4.5 km².
 *
 * The hectare sits in the middle on purpose: it is the unit land is talked
 * about in, in Portugal, and "12 000 m²" means nothing to anyone buying land.
 * In English the hectare is also used for land, so it stays in both languages.
 */
export function formatArea(squareMeters: number): string {
  const u = t().units;

  if (squareMeters < 10000) {
    return `${Math.round(squareMeters)} ${u.squareMetres}`;
  }

  if (squareMeters < 1000000) {
    const ha = squareMeters / 10000;
    return `${decimal(ha < 10 ? ha.toFixed(2) : ha.toFixed(1))} ${u.hectares}`;
  }

  const km2 = squareMeters / 1000000;
  return `${decimal(km2 < 10 ? km2.toFixed(2) : km2.toFixed(1))} ${u.squareKilometres}`;
}
