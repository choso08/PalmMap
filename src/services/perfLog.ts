/**
 * A small performance log, kept in memory only, shown in Settings → About
 * (author, 19 November 2026: the recent searches "always" took ~5 s to show,
 * and nothing in the code explained it — so the phone is asked).
 *
 * - `mark(label)` notes a moment ("search: focus", "search: list shown").
 * - `timed(label, fn)` runs `fn` and notes how long it took, when over
 *   `SLOW_MS`.
 * - A watchdog ticks every `TICK_MS`; when a tick comes late by more than
 *   `STALL_MS`, the JavaScript thread was blocked that long. The stall is
 *   noted with the `timed` spans that ran inside it ("in: …"), or else the
 *   last mark and how long before the stall it was ("after: … 3 s before") —
 *   a mark minutes old says nothing about the stall, and once misled.
 *
 * Nothing is stored or sent; it is gone when the app closes.
 */

import { AppState } from 'react-native';

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
let lastMarkAt = 0;
/** The latest `timed` spans, slow or not, to name what ran in a stall. */
const spans: { label: string; start: number; end: number }[] = [];
const SPANS_MAX = 60;
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
  lastMarkAt = Date.now();
  push({ at: lastMarkAt, label });
}

export function timed<T>(label: string, fn: () => T): T {
  const start = Date.now();
  try {
    return fn();
  } finally {
    const end = Date.now();
    const ms = end - start;
    spans.push({ label, start, end });
    if (spans.length > SPANS_MAX) {
      spans.splice(0, spans.length - SPANS_MAX);
    }
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
/**
 * Off screen (or behind a system screen: the voice recogniser, a permission
 * dialog, a picker), Android pauses the JavaScript timers — not the thread.
 * The first tick back came late by the whole pause and read as a stall that
 * never happened (code review, 19 November 2026). While paused nothing is
 * measured, and the clock starts again on coming back.
 */
let paused = AppState.currentState !== 'active';
setInterval(() => {
  const now = Date.now();
  if (paused) {
    expected = now + TICK_MS;
    return;
  }
  const late = now - expected;
  // Minutes late is the app having been in the background, not a stall.
  if (late > STALL_MS && late < 30_000) {
    const inside = spans.filter((x) => x.end >= expected && x.end - x.start >= SLOW_MS);
    const before = Math.max(0, Math.round((expected - lastMarkAt) / 1000));
    const label = inside.length
      ? `blocked (in: ${inside.map((x) => `${x.label} ${x.end - x.start} ms`).join(', ')})`
      : `blocked (after: ${lastMark || '—'}, ${before} s before)`;
    push({ at: expected, label, ms: late });
  }
  expected = now + TICK_MS;
}, TICK_MS);

// Coming back to the app wakes many effects at once (buses, arrivals, the
// network check, learning); marked so a stall right after it is named.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    paused = false;
    expected = Date.now() + TICK_MS;
  } else {
    paused = true;
  }
  if (state === 'active' || state === 'background') {
    mark(`app: ${state}`);
  }
});
