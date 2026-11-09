/**
 * Reads OpenStreetMap's `opening_hours` and says whether a place is open now.
 *
 * The full syntax is a small language (public holidays, months, week numbers,
 * sunrise…). This reads the part that covers almost every shop and café:
 *
 *   `Mo-Fr 09:00-19:00; Sa 09:00-13:00`   `24/7`   `Mo-Su 12:00-15:00,19:00-23:00`
 *   `Fr-Sa 22:00-04:00` (past midnight)   `Su off`   `09:00-18:00` (every day)
 *
 * Later rules replace earlier ones for the days they name, as in the spec.
 * **Anything it does not understand makes it give up** (`null`), and the card
 * then shows the text as written — a wrong "Open" sends someone to a closed
 * door, which is worse than no status at all. Rules only about public or
 * school holidays (`PH off`) are skipped: they say nothing about today in the
 * normal case.
 */

/** Opening ranges per weekday, Monday = 0, in minutes from midnight. `end` may pass 1440. */
export type WeeklyHours = [number, number][][];

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function parseDays(selector: string): number[] | null {
  const days = new Set<number>();
  for (const part of selector.split(',')) {
    const m = part.trim().match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
    if (!m) {
      return null;
    }
    const from = DAYS.indexOf(m[1]);
    const to = m[2] ? DAYS.indexOf(m[2]) : from;
    // `Fr-Mo` wraps round the week.
    for (let d = from; ; d = (d + 1) % 7) {
      days.add(d);
      if (d === to) {
        break;
      }
    }
  }
  return [...days];
}

function parseTimes(text: string): [number, number][] | null {
  const ranges: [number, number][] = [];
  for (const part of text.split(',')) {
    const m = part.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
    if (!m) {
      return null;
    }
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);
    if (start > 1440 || end > 48 * 60) {
      return null;
    }
    if (end <= start) {
      end += 1440;
    }
    ranges.push([start, end]);
  }
  return ranges;
}

export function parseOpeningHours(raw: string | undefined): WeeklyHours | null {
  if (!raw) {
    return null;
  }
  const text = raw.trim();
  if (text === '24/7') {
    return DAYS.map(() => [[0, 1440]]);
  }
  const week: WeeklyHours = DAYS.map(() => []);
  let understood = 0;
  for (const piece of text.split(/;|\|\|/)) {
    const rule = piece.trim();
    if (!rule) {
      continue;
    }
    if (/^(PH|SH)\b/.test(rule)) {
      continue;
    }
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?(?:\s*,\s*PH)?\s*(.*)$/);
    if (!m) {
      return null;
    }
    const days = m[1] ? parseDays(m[1].replace(/\s+/g, '')) : DAYS.map((_, i) => i);
    const rest = m[2].trim();
    if (!days) {
      return null;
    }
    let ranges: [number, number][];
    if (/^(off|closed)$/i.test(rest)) {
      ranges = [];
    } else if (rest === '24/7' || rest === '00:00-24:00') {
      ranges = [[0, 1440]];
    } else {
      const parsed = parseTimes(rest);
      if (!parsed) {
        return null;
      }
      ranges = parsed;
    }
    for (const d of days) {
      week[d] = ranges;
    }
    understood++;
  }
  return understood > 0 ? week : null;
}

export type OpenStatus =
  | { kind: 'always' }
  | { kind: 'open'; closesAt: number; closesSoon: boolean }
  | { kind: 'closed'; opensAt: number; inDays: number; weekday: number }
  | { kind: 'closedForGood' };

/** Monday = 0 for a JavaScript date. */
export function weekdayOf(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function openStatus(week: WeeklyHours, now: Date): OpenStatus {
  if (week.every((day) => day.length === 1 && day[0][0] === 0 && day[0][1] >= 1440)) {
    return { kind: 'always' };
  }
  const today = weekdayOf(now);
  const t = now.getHours() * 60 + now.getMinutes();
  const yesterday = (today + 6) % 7;

  // Open now — today, or still inside last night's range that ran past midnight.
  const current =
    week[today].find(([s, e]) => s <= t && t < e) ??
    week[yesterday]
      .filter(([, e]) => e > 1440)
      .map(([s, e]) => [s - 1440, e - 1440] as [number, number])
      .find(([s, e]) => s <= t && t < e);
  if (current) {
    // A range ending at midnight that the next day picks up straight away is
    // not "closing at midnight".
    let end = current[1];
    if (end === 1440 && week[(today + 1) % 7].some(([s]) => s === 0)) {
      const next = week[(today + 1) % 7].find(([s]) => s === 0)!;
      end = 1440 + next[1];
    }
    return { kind: 'open', closesAt: end % 1440, closesSoon: end - t <= 60 };
  }

  for (let offset = 0; offset < 8; offset++) {
    const day = (today + offset) % 7;
    const starts = week[day]
      .map(([s]) => s)
      .filter((s) => offset > 0 || s > t)
      .sort((a, b) => a - b);
    if (starts.length > 0) {
      return { kind: 'closed', opensAt: starts[0], inDays: offset, weekday: day };
    }
  }
  return { kind: 'closedForGood' };
}

/** `9:00`, `19:30` — minutes from midnight as clock time. */
export function clock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
