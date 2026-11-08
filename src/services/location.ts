import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { t } from '../i18n';
import type { Coordinates } from '../types/geo';
import {
  LAST_KNOWN_MAX_AGE_MS,
  NAVIGATION_TASK,
  SERVICE_STOP_GRACE_MS,
  POSITION_FRESH_MS,
  POSITION_TIMEOUT_MS,
} from './config';

/**
 * The last position accepted, and when it was measured.
 *
 * It is kept here, not on the screen, because the question "is this still good
 * enough?" is about the reading itself and not about who is using it. Both
 * trackers write here; anyone who wants to centre the map asks
 * `getBestPosition()`.
 *
 * **The clock that counts is the reading's, not when it arrived.** Android
 * sometimes hands over a cached position as soon as the GPS is re-subscribed —
 * it arrives now, but is from an hour ago. Comparing against the arrival time
 * made it look brand new, which is precisely the fault this avoids.
 */
let lastFix: { coordinates: Coordinates; at: number } | null = null;

function record(coordinates: Coordinates, at: number) {
  lastFix = { coordinates, at };
}

/**
 * Who is waiting for the navigation readings, when navigation is running.
 *
 * It has to be a module variable: the foreground service delivers the
 * positions to a task registered by name, and that task is defined once when
 * the file loads — it has no way of reaching the component that asked to follow
 * the position. This is the bridge between the two.
 */
let navListener: ((position: Location.LocationObject) => void) | null = null;

/** The service's stop, scheduled and still to happen. */
let scheduledStop: ReturnType<typeof setTimeout> | null = null;

function cancelStop() {
  if (scheduledStop) {
    clearTimeout(scheduledStop);
    scheduledStop = null;
  }
}

/**
 * Drops the subscription and schedules the end of the service.
 *
 * **It does not stop straight away**, and that is the reason it exists:
 * between two consecutive subscriptions — which happen at every change of route
 * or GPS pace — the service has to stay alive, or Android refuses to start it
 * again with the app in the background. Whoever comes next cancels the stop.
 *
 * With no listener, positions arriving in this interval fall into the void,
 * which is what is wanted.
 */
function stopService(): void {
  navListener = null;
  cancelStop();
  scheduledStop = setTimeout(() => {
    scheduledStop = null;
    void Location.stopLocationUpdatesAsync(NAVIGATION_TASK).catch(() => undefined);
  }, SERVICE_STOP_GRACE_MS);
}

/**
 * The task that receives positions while navigating, even with the screen off.
 *
 * **It is defined here, outside everything, on purpose.** Android delivers the
 * readings to a task registered by name; if the registration happened inside a
 * component, an app coming back from deep in memory would not have the task
 * registered and the readings would arrive somewhere that no longer exists.
 */
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  NAVIGATION_TASK,
  async ({ data, error }) => {
    if (error || !data) {
      return;
    }
    // They come in batches. Only the last matters: it is where the person is
    // now, and the earlier ones no longer change anything on screen.
    const latest = data.locations?.[data.locations.length - 1];
    if (latest) {
      navListener?.(latest);
    }
  },
);

/**
 * At start-up, drops the navigation task left over from last time.
 *
 * **`expo-task-manager` saves the registered tasks and registers them again by
 * itself on the next start-up** — it is in their `TaskService.java`'s
 * `restoreTasks()`, read rather than assumed. That is for tasks meant to last;
 * ours is not: it only makes sense while a trip is running.
 *
 * If the app is closed in the middle of navigating — by Android, by a crash, or
 * by someone swiping it away — the task stays registered. On the next start-up
 * it subscribes to the GPS again with nobody listening, draining battery, and
 * with the foreground service trying to start at a moment Android may not
 * allow it.
 *
 * Dropping it here breaks nothing: whoever navigates asks for it again
 * afterwards, and at start-up there is never any navigation running.
 */
void (async () => {
  try {
    if (await TaskManager.isTaskRegisteredAsync(NAVIGATION_TASK)) {
      await Location.stopLocationUpdatesAsync(NAVIGATION_TASK);
    }
  } catch {
    // There was nothing to drop, or it could not be done. Neither is a reason
    // for the app not to open.
  }
})();

/** Records an `expo-location` reading and returns just the coordinates. */
function keep(position: Location.LocationObject): Coordinates {
  const coordinates = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
  record(coordinates, position.timestamp);
  return coordinates;
}

/**
 * Gives up on a reading after `POSITION_TIMEOUT_MS` and returns `null`.
 *
 * `getCurrentPositionAsync` **has no deadline at all**: without signal, it
 * waits indefinitely. Indoors or without network that is minutes, and nothing
 * that depends on it can be left stuck waiting — neither the start-up nor the
 * button.
 */
function withTimeout(reading: Promise<Coordinates | null>): Promise<Coordinates | null> {
  return Promise.race([
    reading,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), POSITION_TIMEOUT_MS)),
  ]);
}

/**
 * The permission request in progress, if there is one.
 *
 * **On Android there cannot be two at once.** A second request made while the
 * first is still open blows up on the native side — and a native exception in a
 * compiled app closes it with no further explanation. This happened more than
 * it seems: at start-up, position tracking and the initial reading both ask at
 * almost the same time. Whoever comes second waits for the first one's answer
 * instead of opening another.
 */
let pendingRequest: Promise<boolean> | null = null;

/**
 * Makes sure there is location permission, while the app is in use.
 * Returns true if the person allowed it.
 *
 * **It checks before asking.** Once granted, the dialog is never opened again:
 * the following times stop at a check, which does not take focus away from the
 * app nor can clash with another request. Asking needlessly is the difference
 * between a calm start-up and three dialogs fighting over the same screen.
 */
export async function requestPermission(): Promise<boolean> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === Location.PermissionStatus.GRANTED) {
      return true;
    }
    // Permanently refused: insisting opens no dialog and only causes work.
    if (!current.canAskAgain) {
      return false;
    }
  } catch {
    // With no answer to the check, ask anyway — which is what used to happen.
  }

  if (!pendingRequest) {
    pendingRequest = Location.requestForegroundPermissionsAsync()
      .then(({ status }) => status === Location.PermissionStatus.GRANTED)
      .catch(() => false)
      .finally(() => {
        pendingRequest = null;
      });
  }

  return pendingRequest;
}

/**
 * Follows the position while navigation is running.
 *
 * **It runs in a foreground service**, with a permanent notification, and that
 * is what keeps navigation going with the phone in a pocket or the screen off.
 * Without a service, Android cuts off the GPS readings as soon as the app
 * leaves the foreground — and the voice went quiet halfway through the trip,
 * precisely when it is all that is guiding. The notification is required by
 * Android and cannot be hidden; it is the same one any navigation app shows.
 *
 * If the service does not start — some manufacturers have their own rules — it
 * falls back to the normal subscription, which works with the app in front.
 * Navigating with the screen on beats not navigating.
 *
 * Returns a function to stop following — it must be called when leaving
 * navigation, or the GPS stays on draining battery.
 */
export async function watchPosition(
  onChange: (
    coordinates: Coordinates,
    accuracyMeters: number,
    /**
     * Speed in metres per second, or `null` when the GPS could not tell.
     *
     * **It comes from the GPS receiver itself**, computed from the frequency
     * shift of the satellites' signal — not from the difference between two
     * positions. That distinction is everything: with readings one second
     * apart and five metres of uncertainty in each, dividing distance by time
     * gave an error of nearly twenty km/h on every reading. The Doppler effect
     * measures speed directly and errs little.
     *
     * So there is no fallback arithmetic here. When the phone does not give the
     * speed, it stays `null` and the speedometer disappears — showing an
     * invented number to someone driving is worse than showing nothing.
     */
    speedMs: number | null,
  ) => void,
  /**
   * How often, in milliseconds, the position is read.
   *
   * One second is normal. The battery saver raises this value when the next
   * manoeuvre is still far away — see `BATTERY_SAVER_INTERVAL_MS`.
   */
  timeIntervalMs = 1000,
): Promise<() => void> {
  const granted = await requestPermission();
  if (!granted) {
    return () => undefined;
  }

  const deliver = (position: Location.LocationObject) => {
    record(
      { latitude: position.coords.latitude, longitude: position.coords.longitude },
      position.timestamp,
    );
    onChange(
      {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
      // Android says what confidence radius this reading corresponds to.
      // Without it, a bad reading is indistinguishable from really having left
      // the route.
      position.coords.accuracy ?? 0,
      // Android sends -1 when it has no speed to give, and some phones send
      // null. Both mean the same: don't know.
      typeof position.coords.speed === 'number' && position.coords.speed >= 0
        ? position.coords.speed
        : null,
    );
  };

  const options = {
    // Even when saving battery, the accuracy stays: what changes is how often
    // it is read, not the quality of the reading. Lowering the accuracy made
    // Android answer from the cell towers, and then the position was no longer
    // good enough to navigate.
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: timeIntervalMs,
    // Zero on purpose: with a minimum distance, Android goes quiet while the
    // person is standing still — and then the panel is stuck on what it said.
    // Stopped at a traffic light, the remaining time has to stay right.
    distanceInterval: 0,
  };

  // --- The normal path: a foreground service ------------------------------
  //
  // **This is what keeps navigation going with the screen off.** Without a
  // service, Android cuts off the GPS readings as soon as the app leaves the
  // foreground — and the voice went quiet halfway through the trip, precisely
  // when the phone is in a pocket or in another app and the voice is all that
  // is left.
  //
  // The price is the permanent notification, which Android requires and does
  // not let be hidden. It is the same any navigation app shows.
  //
  // **The service is not stopped between subscriptions, and that is the most
  // delicate part of this.** The navigation effect runs again whenever the
  // route, the speed cameras or the GPS pace change, and each time it drops
  // the previous subscription and makes another. And Android **only lets a
  // foreground service start with the app in front**, and `expo-location`
  // knows it: with the app in the background, their
  // `maybeStartForegroundService` **gives up and writes a warning to the log**
  // — it throws no exception and this `await` resolves as if it had worked.
  // That is, stopping and starting again with the phone in a pocket left
  // navigation without a service **silently**, exactly when this is useful.
  // So the stop is scheduled for a few seconds and cancelled if another
  // subscription arrives in the meantime — see `SERVICE_STOP_GRACE_MS`. (Read
  // in `taskConsumers/LocationTaskConsumer.kt`, not assumed.)
  cancelStop();
  const wasRunning = await Location.hasStartedLocationUpdatesAsync(NAVIGATION_TASK).catch(
    () => false,
  );

  try {
    navListener = deliver;
    await Location.startLocationUpdatesAsync(NAVIGATION_TASK, {
      ...options,
      foregroundService: {
        notificationTitle: t().navigation.serviceTitle,
        notificationBody: t().navigation.serviceBody,
        // If the app is really closed, the service goes with it. A notification
        // that outlives the app is the kind of thing nobody can turn off
        // without going into Android's settings.
        killServiceOnDestroy: true,
      },
    });

    return stopService;
  } catch {
    if (wasRunning) {
      // A service was already running and only its options could not be
      // changed. The listener is already the new one, so positions keep
      // reaching whoever expects them. The GPS pace change is lost, which is
      // infinitely less than losing navigation.
      return stopService;
    }

    // --- The fallback, if the service never started ------------------------
    //
    // It is not known in advance what can go wrong on a particular phone — a
    // refused permission, a manufacturer with its own rules. Better to navigate
    // with the screen on than not to navigate: fall back to the usual
    // subscription, which works with the app in front.
    navListener = null;
  }

  const subscription = await Location.watchPositionAsync(options, deliver);

  return () => subscription.remove();
}

/**
 * Follows the position outside navigation, slowly.
 *
 * It lets the blue dot follow the person while the app is open, as Maps does,
 * instead of staying stuck where it was at start-up. It is deliberately much
 * less frequent than navigation's — every ten seconds, or every fifty metres —
 * so as not to drain battery for nothing.
 *
 * **On a plane this is what makes the map move.** Without network there is no
 * route nor search, but the GPS keeps giving the position, and with a
 * downloaded country the map is drawn around it.
 *
 * Returns a function to stop following. Always call it on leaving.
 */
export async function watchPositionIdle(
  onChange: (coordinates: Coordinates, speedMs: number | null) => void,
  /**
   * How often, in milliseconds, the position is read.
   *
   * Ten seconds is normal and more than enough for the blue dot to follow
   * someone on foot. When driving the pace goes up, so the speedometer shows
   * the speed of now and not that of a block ago — see
   * `DRIVING_GPS_INTERVAL_MS`.
   */
  timeIntervalMs = 10000,
  /**
   * Every how many metres the position is read. **Zero when driving.**
   *
   * With a minimum distance, Android goes quiet while the person is standing
   * still — and then the speedometer was stuck on its last number. Someone
   * braking from 90 to zero does not travel the fifty metres that would unlock
   * the next reading, and the screen kept saying 90 with the car motionless.
   * It is the same trap navigation already avoids in the same way.
   */
  distanceIntervalMs = 50,
): Promise<() => void> {
  const granted = await requestPermission();
  if (!granted) {
    return () => undefined;
  }

  const subscription = await Location.watchPositionAsync(
    {
      // `High` forces the use of the satellites. With `Balanced`, Android
      // answers from the Wi-Fi networks and cell towers around — which is fast
      // on the ground and completely useless at ten thousand metres.
      accuracy: Location.Accuracy.High,
      timeInterval: timeIntervalMs,
      distanceInterval: distanceIntervalMs,
    },
    (position) => {
      const coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      record(coordinates, position.timestamp);
      onChange(
        coordinates,
        // Android sends -1 when it has no speed to give, and some phones send
        // null. Both mean the same: don't know.
        typeof position.coords.speed === 'number' && position.coords.speed >= 0
          ? position.coords.speed
          : null,
      );
    },
  );

  return () => subscription.remove();
}

/**
 * A position that can be trusted to centre the map on.
 *
 * If the last reading is still recent, that one is returned — without waiting
 * for anything, which is the normal case and what makes the button feel
 * instant. If it has aged, a new one is fetched.
 *
 * **This is what fixes the map going to a place one has already been.** With
 * the app in the background Android stops delivering readings: someone who
 * moved in the meantime comes back with the position of where they were, and
 * the map took them there with complete confidence. The stored position was not
 * wrong — it was old, and nothing in the code told the two apart.
 *
 * It never waits forever: after `POSITION_TIMEOUT_MS` it returns whatever there
 * is, even if old. A map at the old spot is bad; a button that does not respond
 * is worse, and without network the GPS can take minutes to wake up.
 */
export async function getBestPosition(): Promise<Coordinates | null> {
  if (lastFix && Date.now() - lastFix.at < POSITION_FRESH_MS) {
    return lastFix.coordinates;
  }

  const fresh = await withTimeout(getFreshPosition());

  return fresh ?? lastFix?.coordinates ?? null;
}

/**
 * Fetches a new position from the GPS, skipping the last known one.
 *
 * It is what is used when the app comes back to the screen. Here the
 * last-known shortcut would backfire: it is precisely the one suspected of
 * being old.
 *
 * **Here permission is only checked — never requested.** Requesting opens a
 * system dialog, and a dialog takes focus away from the app: Android counts it
 * as leaving and coming back, which triggers again whoever is listening for
 * those changes and asks again. Asking is the start-up's job, once; from then
 * on it is only checked.
 */
export async function getFreshPosition(): Promise<Coordinates | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) {
      return null;
    }

    const position = await Location.getCurrentPositionAsync({
      // See the note in `watchPositionIdle`: `Balanced` depends on the network.
      accuracy: Location.Accuracy.High,
    });

    const coordinates = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    record(coordinates, position.timestamp);
    return coordinates;
  } catch {
    return null;
  }
}

/**
 * Returns the current position, or null if there is no permission or the GPS
 * fails.
 *
 * Returning null instead of blowing up is intentional: without location the
 * app is still good for viewing the map and searching addresses.
 *
 * **Without network, the first position takes a while.** The phone usually asks
 * the Internet for help with the list of satellites in view; without it, it has
 * to hear it from the signal itself, which takes from thirty seconds to two
 * minutes with the sky in view. So the last known position is returned first,
 * so there is something on screen straight away, and continuous tracking
 * corrects it when the GPS gets a signal.
 */
export async function getCurrentPosition(): Promise<Coordinates | null> {
  try {
    const granted = await requestPermission();
    if (!granted) {
      return null;
    }

    // `maxAge` stops the shortcut from serving a position from yesterday: the
    // shortcut exists to speed up start-up, not to guess.
    const known = await Location.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
    });
    if (known) {
      return keep(known);
    }

    // **Always with a deadline.** Without network the GPS takes from thirty
    // seconds to two minutes to give the first position, and without this
    // limit the start-up waited for it — with the map frozen and no blue dot.
    // That is how the app came to be slow to open.
    const fresh = await withTimeout(getFreshPosition());
    if (fresh) {
      return fresh;
    }

    // Neither recent nor fresh in time: keep the last known one, from whenever.
    // A dot at yesterday's spot is little, but more than a map with no dot at
    // all — and the centre button no longer trusts it, which was the problem.
    const old = await Location.getLastKnownPositionAsync();
    return old ? keep(old) : null;
  } catch {
    return null;
  }
}
