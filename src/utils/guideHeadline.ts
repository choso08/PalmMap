import { t } from '../i18n';
import type { GuideProgress, TransitGuide } from '../services/transitGuide';
import { formatDistance, formatDuration } from './format';

/** "16:15", for a time in seconds since 1970. */
export function clock(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The step one is on, in words: the trip panel's banner, the trip's
 * notification and the "back to the trip" pill all say the same thing.
 * `t()` is read when called, so the language is always the current one.
 */
export function guideHeadline(
  guide: TransitGuide | null,
  progress: GuideProgress,
  arrived: boolean,
  now: number,
): { title: string; detail: string } {
  const g = t().guide;
  if (!guide) {
    return { title: g.preparing, detail: '' };
  }
  const step = guide.legs[progress.leg];
  if (arrived || !step) {
    return { title: g.arrived, detail: '' };
  }
  if (step.type === 'walk') {
    return {
      title: step.toName ? g.walkTo(step.toName) : g.walkToDestination,
      detail: `${formatDistance(step.meters)} · ${formatDuration(step.seconds)}`,
    };
  }
  if (progress.stop === 0) {
    const wait = step.departsAt - now;
    return {
      title: g.board(step.line, step.headsign),
      detail:
        wait > 60
          ? g.leavesAt(clock(step.departsAt), formatDuration(wait))
          : g.leavingNow(clock(step.departsAt)),
    };
  }
  const last = step.stops[step.stops.length - 1];
  const left = step.stops.length - 1 - progress.stop;
  return {
    title: left <= 1 ? g.getOffNext(last.name) : g.getOffAt(last.name),
    detail: g.stopsLeft(left, clock(step.arrivesAt)),
  };
}

/**
 * How much of the trip is done, 0–1, for the notification's bar: the time the
 * timetable gives for where one is (between the two stops of a ride, or along
 * a walk) against the whole trip, from leaving to reaching the door. Never
 * ahead of the step one is on, and never back past it, whatever the clock says.
 */
export function guideFraction(guide: TransitGuide, progress: GuideProgress, now: number): number {
  const start = guide.trip.leaveAt;
  const end = guide.trip.reachAt;
  if (end <= start) {
    return 0;
  }
  if (progress.leg >= guide.legs.length) {
    return 1;
  }
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  // Each leg's planned start and end, from the rides around it.
  const legs = guide.legs;
  const spanOf = (k: number): [number, number] => {
    const leg = legs[k];
    if (leg.type === 'ride') {
      return [leg.departsAt, leg.arrivesAt];
    }
    let from = start;
    for (let j = k - 1; j >= 0; j -= 1) {
      const before = legs[j];
      if (before.type === 'ride') {
        from = before.arrivesAt;
        break;
      }
    }
    let to = end;
    for (let j = k + 1; j < legs.length; j += 1) {
      const after = legs[j];
      if (after.type === 'ride') {
        to = after.departsAt;
        break;
      }
    }
    return [from, Math.max(from, to)];
  };
  const leg = legs[progress.leg];
  let at: number;
  if (leg.type === 'ride') {
    const here = leg.stops[progress.stop]?.unix ?? leg.departsAt;
    const next = leg.stops[progress.stop + 1]?.unix ?? leg.arrivesAt;
    at = clamp(now, here, Math.max(here, next));
  } else {
    const [from, to] = spanOf(progress.leg);
    at = clamp(now, from, to);
  }
  return clamp((at - start) / (end - start), 0, 1);
}
