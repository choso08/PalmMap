/**
 * Sunset, worked out on the phone — no service (the sunrise equation as the
 * open-source `suncalc` writes it: solar transit, declination, the hour angle
 * at -0.833°, the sun's edge with refraction). Within a minute or two, plenty
 * for "the sun sets before you arrive".
 */
const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;

const toJulian = (d: Date) => d.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS);

/** Sunset on the day of `day` at that place; `null` in polar day or night. */
export function sunsetOn(day: Date, latitude: number, longitude: number): Date | null {
  const lw = -longitude * RAD;
  const phi = latitude * RAD;
  const d = toJulian(day) - J2000;
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = RAD * (357.5291 + 0.98560028 * ds);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(RAD * 23.4397) * Math.sin(L));
  const cosW =
    (Math.sin(-0.833 * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosW < -1 || cosW > 1) {
    return null;
  }
  const w = Math.acos(cosW);
  const a = 0.0009 + (w + lw) / (2 * Math.PI) + n;
  return fromJulian(J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L));
}
