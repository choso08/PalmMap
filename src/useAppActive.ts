import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Whether the app is on screen.
 *
 * For timers that ask the Internet over and over — live buses (1.1 MB every
 * twenty seconds), a stop's arrivals. JavaScript timers keep running for a
 * while after the app goes to the background, and with a phone in a pocket
 * they were spending data and battery on a map nobody was looking at. Coming
 * back flips this to `true`, so the effects depending on it run again and ask
 * at once: the screen shows fresh data, not what was there when it left.
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // 'inactive' (iOS, and the moment a system dialog opens) is not leaving.
      if (state === 'active') {
        setActive(true);
      } else if (state === 'background') {
        setActive(false);
      }
    });
    return () => subscription.remove();
  }, []);

  return active;
}
