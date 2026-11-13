import * as Network from 'expo-network';
import { useEffect, useState } from 'react';

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
 * - the stored country map draws (`MapView` has its own copy of this, older);
 * - transport plans from the stored timetables only, Carris Metropolitana's
 *   included, and a stop shows its timetable instead of live times;
 * - live buses stop being asked for;
 * - a place's doors come from the country's file (`localDoorsNear`).
 */

let online = true;
const listeners = new Set<(online: boolean) => void>();

function apply(state: Network.NetworkState) {
  const next = state.isInternetReachable ?? state.isConnected ?? true;
  if (next !== online) {
    online = next;
    listeners.forEach((l) => l(online));
  }
}

void Network.getNetworkStateAsync()
  .then(apply)
  .catch(() => undefined);
Network.addNetworkStateListener(apply);

/** The last known state, synchronous — for services. */
export function isOnline(): boolean {
  return online;
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
