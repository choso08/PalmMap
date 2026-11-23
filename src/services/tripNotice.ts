import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * The trip under way in the notification shade, with a progress bar, as Google
 * Maps (author's request, 23 November 2026) — our own native module
 * (`TripNoticeModule.kt`), since `expo-notifications` draws no progress bar.
 *
 * Used by a transport trip and by navigation while the app is off screen. On a
 * build without the module (`available()` false) the callers keep what they
 * had: navigation its `navNotice` instruction, a transport trip nothing.
 *
 * Never asks for the permission: navigation and the transport trip ask on Start.
 */
interface PalmMapTripNotice {
  show(
    id: number,
    options: {
      channelId: string;
      channelName: string;
      title: string;
      text: string;
      max: number;
      progress: number;
      colour: string;
      chip: string;
    },
  ): boolean;
  cancel(id: number): void;
}

let native: PalmMapTripNotice | null | undefined;

function module(): PalmMapTripNotice | null {
  if (native === undefined) {
    native =
      Platform.OS === 'android'
        ? requireOptionalNativeModule<PalmMapTripNotice>('PalmMapTripNotice')
        : null;
  }
  return native;
}

/** One notification for whichever trip is under way: there is never two. */
const NOTICE_ID = 7261;
const CHANNEL = 'viagem';
/** The app's accent, as `app.json`'s notification colour. */
const ACCENT = '#0B7C74';
/** Steps of the bar: fine enough to move, coarse enough to change rarely. */
export const PROGRESS_STEPS = 100;

export function tripNoticeAvailable(): boolean {
  return module() !== null;
}

let lastShown = '';

/**
 * Shows or replaces the trip's notice. `fraction` is how much of the trip is
 * done (0–1, or null for no bar). Posting the same thing twice does nothing.
 */
export function showTripNotice(
  channelName: string,
  title: string,
  text: string,
  fraction: number | null,
  chip = '',
): boolean {
  const m = module();
  if (!m) {
    return false;
  }
  const progress =
    fraction === null ? 0 : Math.round(Math.max(0, Math.min(1, fraction)) * PROGRESS_STEPS);
  const key = `${title}|${text}|${fraction === null ? '-' : progress}|${chip}`;
  if (key === lastShown) {
    return true;
  }
  try {
    const ok = m.show(NOTICE_ID, {
      channelId: CHANNEL,
      channelName,
      title,
      text,
      max: fraction === null ? 0 : PROGRESS_STEPS,
      progress,
      colour: ACCENT,
      chip,
    });
    lastShown = ok ? key : '';
    return ok;
  } catch {
    return false;
  }
}

export function clearTripNotice(): void {
  lastShown = '';
  try {
    module()?.cancel(NOTICE_ID);
  } catch {
    // Nothing up.
  }
}
