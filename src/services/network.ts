import * as Network from 'expo-network';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Whether the phone can reach the Internet right now, for the whole app — as
 * Maps does, which notices going offline and back by itself and changes what
 * it uses (author's request, November 2026).
 *
 * **`isInternetReachable`, not `isConnected`**: a Wi-Fi with a login page is
 * connected and reaches nothing. While Android has not said yet, it counts as
 * online: everything already falls back by itself when a request fails, and
 * starting "offline" would hide live data for nothing.
 *
 * What changes offline:
 * - the stored country map draws (`MapView`, through `useInternetReachable`);
 * - transport plans from the stored timetables only, Carris Metropolitana's
 *   included, and a stop shows its timetable instead of live times;
 * - live buses stop being asked for;
 * - a place's doors come from the country's file (`localDoorsNear`).
 */

let online = true;
/** Whether Android has answered at least once (`MapView` waits for it). */
let known = false;
const listeners = new Set<(online: boolean) => void>();

function apply(state: Network.NetworkState) {
  const next = state.isInternetReachable ?? state.isConnected ?? true;
  // "Offline" heard in the background is not believed: Android stops checking
  // there, and the app asks again on coming back (below).
  if (!next && known && AppState.currentState !== 'active') {
    return;
  }
  const first = !known;
  known = true;
  if (next !== online || first) {
    online = next;
    listeners.forEach((l) => l(online));
  }
}

/** Asks Android again, instead of trusting the last event. */
export function recheckNetwork(): void {
  void Network.getNetworkStateAsync()
    .then(apply)
    .catch(() => undefined);
}

recheckNetwork();
Network.addNetworkStateListener(apply);

/*
 * **Asked again on coming back to the app, and every few seconds while
 * offline** (author's report, 17 November: after switching apps it said
 * "offline" and never came back). In the background Android stops checking
 * the connection and can report it unreachable; the event saying it is back
 * may never arrive, and `isInternetReachable` can stay stuck. A fresh answer
 * on returning, and a poll while offline, unstick it.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    recheckNetwork();
  }
});
const OFFLINE_RECHECK_MS = 10000;
setInterval(() => {
  if (!online && AppState.currentState === 'active') {
    recheckNetwork();
  }
}, OFFLINE_RECHECK_MS);

/** The last known state, synchronous — for services. */
export function isOnline(): boolean {
  return online;
}

/**
 * Like `useOnline`, but `null` until Android has answered once — for the map,
 * which must not switch to the stored country at start-up on a guess.
 */
export function useInternetReachable(): boolean | null {
  const [value, setValue] = useState<boolean | null>(known ? online : null);
  useEffect(() => {
    const update = (next: boolean) => setValue(next);
    listeners.add(update);
    if (known) {
      setValue(online);
    }
    return () => {
      listeners.delete(update);
    };
  }, []);
  return value;
}

/** The same, as a hook: the screen redraws when it changes. */
export function useOnline(): boolean {
  const [value, setValue] = useState(online);
  useEffect(() => {
    setValue(online);
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
