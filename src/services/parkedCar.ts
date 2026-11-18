import { t } from '../i18n';
import { cancelNotice, scheduleNotice } from './arrivalReminders';
import { savedStore } from './savedStore';
import type { Coordinates } from '../types/geo';

/**
 * Where the car was left (author's request, November 2026: "where I parked").
 *
 * Kept on the phone only. Saved by hand from the Saved screen, and by itself
 * when a car navigation arrives; forgotten when the car is driven again — on
 * reaching it while walking to it, or starting a car trip next to it.
 *
 * While it is set and the person is away from it, a car trip starts **at the
 * car**, and the walk to it is worked out and added to the trip's time
 * (`walkToCar` on `Route`).
 */
export interface ParkedCar {
  coordinates: Coordinates;
  /** When it was saved, in ms since 1970. */
  at: number;
  /** Paid parking until (ms since 1970), with a notice before it ends. */
  paidUntil?: number;
  /** The scheduled notice's id, to move or cancel it. */
  noticeId?: string;
}

/** How long before the paid time ends the notice comes. */
export const PARKING_NOTICE_LEAD_MS = 10 * 60 * 1000;

const isParked = (p: unknown): p is ParkedCar => {
  const c = (p as ParkedCar | null)?.coordinates;
  return (
    !!c &&
    typeof c.latitude === 'number' &&
    typeof c.longitude === 'number' &&
    typeof (p as ParkedCar).at === 'number'
  );
};

const store = savedStore<ParkedCar | null>('palmmap.carroEstacionado', null, (raw) =>
  isParked(raw) ? raw : null,
);

export const useParkedCar = store.useValue;
export const parkedCarNow = store.current;
export const loadParkedCar = store.load;

export function parkCar(coordinates: Coordinates): void {
  dropNotice();
  store.update(() => ({ coordinates, at: Date.now() }));
}

export function forgetParkedCar(): void {
  dropNotice();
  store.update(() => null);
}

function dropNotice(): void {
  const id = store.current()?.noticeId;
  if (id) {
    void cancelNotice(id);
  }
}

/**
 * The parking timer (author's request, November 2026): paid until `until`
 * (ms), with a notification `PARKING_NOTICE_LEAD_MS` before; `null` clears
 * it. Resolves `false` when notifications are not allowed — the time is kept
 * anyway, shown on the car.
 */
export async function setParkingPaidUntil(
  until: number | null,
  notify = true,
): Promise<boolean> {
  const car = store.current();
  if (!car) {
    return false;
  }
  dropNotice();
  store.update((now) => (now ? { coordinates: now.coordinates, at: now.at, paidUntil: until ?? undefined } : now));
  if (until === null || !notify) {
    return true;
  }
  const at = Math.max(Date.now() + 5000, until - PARKING_NOTICE_LEAD_MS);
  const d = new Date(until);
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const id = await scheduleNotice(new Date(at), t().parked.noticeTitle, t().parked.noticeBody(clock)).catch(
    () => null,
  );
  if (!id) {
    return false;
  }
  store.update((now) => (now && now.paidUntil === until ? { ...now, noticeId: id } : now));
  return true;
}
