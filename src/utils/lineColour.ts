/**
 * A line's colour for its badge and the trip's timeline, as Maps paints each
 * line in its own colour. The stored timetables carry no colours (their
 * `routes` are only names), so the well-known ones are written here: Metro de
 * Lisboa's four lines by their short name. Every other line takes its mode's
 * colour. A Carris Metropolitana bus uses its pattern's own colour when known
 * (`RideLeg.colour`), and this otherwise.
 */

/** Metro de Lisboa, by `route_short_name` (Am, Az, Vd, Vm) or long name. */
const METRO_LISBOA: Record<string, string> = {
  am: '#F2B705',
  amarela: '#F2B705',
  az: '#4E84C4',
  azul: '#4E84C4',
  vd: '#00A99D',
  verde: '#00A99D',
  vm: '#E8364F',
  vermelha: '#E8364F',
};

const BY_KIND: Record<string, string> = {
  train: '#3D5A80',
  subway: '#455A64',
  light_rail: '#00897B',
  boat: '#0277BD',
};

/** The line's colour; `busColour` (the theme's vehicle colour) for buses. */
export function lineColour(kind: string, line: string, busColour: string): string {
  if (kind === 'subway') {
    const metro = METRO_LISBOA[line.trim().toLowerCase()];
    if (metro) {
      return metro;
    }
  }
  return BY_KIND[kind] ?? busColour;
}

/** White or near-black, whichever reads on that colour. */
export function textOn(colour: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour);
  if (!m) {
    return '#FFFFFF';
  }
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? '#1F1F1F' : '#FFFFFF';
}
