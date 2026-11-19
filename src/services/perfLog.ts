/**
 * A small performance log, kept in memory only, shown in Settings → About
 * (author, 19 November 2026: the recent searches "always" took ~5 s to show,
 * and nothing in the code explained it — so the phone is asked).
 *
 * - `mark(label)` notes a moment ("search: focus", "search: list shown").
 * - `timed(label, fn)` runs `fn` and notes how long it took, when over
 *   `SLOW_MS`.
 * - A watchdog ticks every `TICK_MS`; when a tick comes late by more than
 *   `STALL_MS`, the JavaScript thread was blocked that long, and the stall is
 *   noted with the last mark before it — what was running, or about to.
 *
 * Nothing is stored or sent; it is gone when the app closes.
 */

export interface PerfEntry {
  at: number;
  label: string;
  ms?: number;
}

const MAX = 40;
const TICK_MS = 100;
const STALL_MS = 300;
const SLOW_MS = 30;

const entries: PerfEntry[] = [];
let lastMark = '';
const listeners = new Set<() => void>();

function push(entry: PerfEntry) {
  entries.push(entry);
  if (entries.length > MAX) {
    entries.splice(0, entries.length - MAX);
  }
  listeners.forEach((l) => l());
}

export function mark(label: string): void {
  lastMark = label;
  push({ at: Date.now(), label });
}

export function timed<T>(label: string, fn: () => T): T {
  const start = Date.now();
  lastMark = label;
  try {
    return fn();
  } finally {
    const ms = Date.now() - start;
    if (ms >= SLOW_MS) {
      push({ at: start, label, ms });
    }
  }
}

/** Notes something that took `ms`, measured by the caller. */
export function note(label: string, ms: number): void {
  if (ms >= SLOW_MS) {
    push({ at: Date.now() - ms, label, ms });
  }
}

/** Since a mark: "search: list shown" 4900 ms after "search: focus". */
export function since(label: string, from: string): void {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].label === from) {
      push({ at: Date.now(), label, ms: Date.now() - entries[i].at });
      return;
    }
  }
  push({ at: Date.now(), label });
}

export function perfEntries(): PerfEntry[] {
  return [...entries];
}

export function watchPerf(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let expected = Date.now() + TICK_MS;
setInterval(() => {
  const now = Date.now();
  const late = now - expected;
  // Minutes late is the app having been in the background, not a stall.
  if (late > STALL_MS && late < 30_000) {
    push({ at: expected, label: `blocked (after: ${lastMark || '—'})`, ms: late });
  }
  expected = now + TICK_MS;
}, TICK_MS);
