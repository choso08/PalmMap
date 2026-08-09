import { t } from '../i18n';

/**
 * Funções para transformar números em texto legível.
 *
 * Lêem a língua no momento em que são chamadas. **O separador decimal é o que
 * mais se nota**: em português escreve-se 12,4 km e em inglês 12.4 km — deixar
 * a vírgula num ecrã inglês é daquelas coisas que fazem uma aplicação parecer
 * mal traduzida mesmo com tudo o resto certo.
 */

/** Põe o separador decimal da língua num número já formatado. */
function decimal(text: string): string {
  return text.replace('.', t().units.decimal);
}

/** 850 -> "850 m"; 12400 -> "12,4 km" */
export function formatDistance(meters: number): string {
  const u = t().units;

  if (meters < 1000) {
    return `${Math.round(meters)} ${u.metres}`;
  }

  const km = meters / 1000;
  // Abaixo de 10 km mostra-se uma casa decimal; acima disso não vale a pena.
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
 * Área em texto: 340 m², 1,2 ha, 4,5 km².
 *
 * O hectare entra de propósito no meio: é a unidade em que se fala de terrenos
 * em Portugal, e "12 000 m²" não diz nada a ninguém que compre terra. Em inglês
 * o hectare também se usa para terreno, por isso fica nas duas línguas.
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
