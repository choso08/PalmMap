import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Keeps whatever closed the app, so it can be read the next time it opens.
 *
 * **This exists because of the gap `ErrorBoundary` already admitted to.** It
 * catches errors while drawing the screen and shows them — but an error inside
 * a promise, a `setTimeout` or a call coming from the native side passes it by.
 * In a compiled app those give no red screen at all: they go straight to React
 * Native's global handler, which in a release build hands them to Android as a
 * fatal error. The app disappears, and whoever was using it is left with just
 * "the app closed".
 *
 * This fixes nothing — it fixes the **report**, which is the same decision
 * already taken for the timetable errors: without a phone at hand, a message in
 * a photo saves several rounds of guessing.
 *
 * **It is stored and the app is let close.** Trying to keep alive an app whose
 * state has already blown up is like carrying on driving with a broken engine:
 * what comes next is harder to understand than what happened. The text stays
 * on the phone and appears in the settings on the next opening.
 *
 * Nothing leaves this place for anywhere: it stays in `AsyncStorage`, like
 * everything else.
 */

/** The storage key. It stays in Portuguese so reports saved by older versions are still found. */
const CRASH_KEY = 'palmmap.ultimaFalha';

export interface CrashReport {
  /** What blew up, already as text. */
  message: string;
  /** Where, if the JavaScript engine could tell. */
  stack: string | null;
  /** When, in milliseconds since 1970. */
  at: number;
  /** Where it came from: drawing the screen, or the global handler. */
  origin: 'render' | 'fatal' | 'async';
}

function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return {
      message: `${error.name}: ${error.message}`,
      // The whole stack is dozens of lines of bundled code, which on a phone
      // screen can neither be read nor photographed. The first ones are what
      // say something.
      stack: error.stack ? error.stack.split('\n').slice(0, 12).join('\n') : null,
    };
  }
  return { message: String(error), stack: null };
}

/** Writes the failure to the phone. Never throws — it is called from inside an error. */
export function recordCrash(error: unknown, origin: CrashReport['origin']): void {
  try {
    const report: CrashReport = { ...describe(error), at: Date.now(), origin };
    void AsyncStorage.setItem(CRASH_KEY, JSON.stringify(report)).catch(() => undefined);
  } catch {
    // Failing to store an error cannot itself be an error.
  }
}

/** What was stored last time, or `null` if there was none. */
export async function lastCrash(): Promise<CrashReport | null> {
  try {
    const stored = await AsyncStorage.getItem(CRASH_KEY);
    return stored ? (JSON.parse(stored) as CrashReport) : null;
  } catch {
    return null;
  }
}

/** Forgets the stored failure. It is the button on the settings screen. */
export async function forgetCrash(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CRASH_KEY);
  } catch {
    // Nothing to do.
  }
}

/**
 * Turns on failure recording. Called once, at start-up, before anything else.
 *
 * **It chains onto the existing handler instead of replacing it.** React
 * Native's is what shows the red screen in development and what hands the error
 * to Android in a release build; taking it out of the way would swap one
 * problem for another — we would stop seeing the error where it is seen today.
 */
export function installCrashHandler(): void {
  try {
    const global_ = globalThis as unknown as {
      ErrorUtils?: {
        getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
        setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => void;
      };
    };
    const utils = global_.ErrorUtils;
    if (!utils) {
      return;
    }

    const previous = utils.getGlobalHandler();
    utils.setGlobalHandler((error, isFatal) => {
      recordCrash(error, isFatal ? 'fatal' : 'async');
      previous?.(error, isFatal);
    });
  } catch {
    // Without a global handler, it falls back to `ErrorBoundary`, as before.
  }
}

/**
 * Wraps a function so that an error inside it is recorded instead of closing
 * the app.
 *
 * **It is for functions the native side calls**, and only those: position
 * tracking, which runs every second for a whole trip. An error in one of these
 * goes through none of our `try`s nor the `ErrorBoundary` — it goes straight to
 * the global handler and, in a compiled app, closes it. In the middle of a
 * road, that is the worst possible place for the app to disappear.
 *
 * What is lost is one GPS reading, and the next arrives a second later. What is
 * gained is the trip carrying on and a written record of what blew up — the
 * only way it will ever get fixed.
 *
 * **Do not use this everywhere.** Swallowing errors in normal code hides bugs;
 * here the alternative is not seeing the error, it is the app closing.
 */
export function guarded<A extends unknown[]>(
  fn: (...args: A) => void,
): (...args: A) => void {
  return (...args: A) => {
    try {
      fn(...args);
    } catch (error) {
      recordCrash(error, 'async');
      console.error('PalmMap: error in a position reading', error);
    }
  };
}
