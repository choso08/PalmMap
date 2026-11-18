import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { t } from '../i18n';

/**
 * Turn-by-turn in the notification shade while the app is not on screen
 * (author's request, November 2026: "it should give directions by
 * notification even in the background"), as Maps does.
 *
 * Two notifications, each replaced in place by its identifier:
 *
 * - **the instruction**, on a quiet channel: the next manoeuvre and how far,
 *   updated as the distance changes — readable on the lock screen, never a
 *   sound;
 * - **the approach**, on a loud channel, once per manoeuvre when it is close:
 *   a heads-up and a buzz for a phone in a pocket with the sound off, where the
 *   voice does not reach. Removed when the manoeuvre is passed.
 *
 * The foreground service's own notification (`expo-location`) cannot be
 * changed once started — restarting it in the background is what Android
 * refuses — hence ours beside it.
 *
 * Never asks for the permission: it is asked on Start (`prepareNavNotices`).
 */
const QUIET = 'navegacao';
const LOUD = 'navegacao-aviso';
const INSTRUCTION_ID = 'palmmap-nav-instrucao';
const APPROACH_ID = 'palmmap-nav-aviso';

let channelsReady = false;

async function channels(): Promise<void> {
  if (channelsReady || Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(QUIET, {
    name: t().navigation.noticeChannel,
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    vibrationPattern: null,
    enableVibrate: false,
  });
  await Notifications.setNotificationChannelAsync(LOUD, {
    name: t().navigation.alertChannel,
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 120, 250],
  });
  channelsReady = true;
}

/** On Start (a tap): the channels, then the permission, asked once. */
export async function prepareNavNotices(): Promise<void> {
  try {
    await channels();
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted && current.canAskAgain) {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    // Without notifications the trip goes on, on screen and by voice.
  }
}

async function allowed(): Promise<boolean> {
  try {
    await channels();
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** The quiet one: replaced in place. */
export async function showInstruction(title: string, body: string): Promise<void> {
  if (!(await allowed())) {
    return;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: INSTRUCTION_ID,
    content: { title, body, sticky: true, autoDismiss: false },
    trigger: { channelId: QUIET },
  }).catch(() => undefined);
}

/** The loud one, for a manoeuvre close ahead. */
export async function alertManeuver(title: string, body: string): Promise<void> {
  if (!(await allowed())) {
    return;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: APPROACH_ID,
    content: { title, body },
    trigger: { channelId: LOUD },
  }).catch(() => undefined);
}

export function clearApproach(): void {
  void Notifications.dismissNotificationAsync(APPROACH_ID).catch(() => undefined);
}

/** Back on screen, or the trip over: both go. */
export function clearNavNotices(): void {
  void Notifications.dismissNotificationAsync(INSTRUCTION_ID).catch(() => undefined);
  clearApproach();
}
