/**
 * Funções para transformar números em texto legível.
 */

/** 850 -> "850 m"; 12400 -> "12,4 km" */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  const km = meters / 1000;
  // Abaixo de 10 km mostra-se uma casa decimal; acima disso não vale a pena.
  const text = km < 10 ? km.toFixed(1) : Math.round(km).toString();
  return `${text.replace('.', ',')} km`;
}

/** 90 -> "2 min"; 5400 -> "1 h 30 min" */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }
  if (minutes === 0) {
    return `${hours} h`;
  }
  return `${hours} h ${minutes} min`;
}
