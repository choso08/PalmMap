import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import { t } from '../i18n';
import { downloadedUpdate, installUpdate, type UpdateInfo } from './update';

/**
 * "PalmMap 7.0.49 is downloaded — Install" (author's request, November 2026):
 * a notification when an update the person started has finished downloading,
 * with an Install button on it.
 *
 * It matters most when the app went to the background during the download:
 * Android does not let an app in the background open the installer, so the
 * download used to end in silence and the installer never came. A tap on the
 * notification (or its button) brings the app to the front and opens the
 * installer with the file already on the phone — nothing is downloaded again.
 *
 * Nothing here asks the Internet. The notification permission is asked when
 * the download starts, which the person did by tapping; never at start-up.
 */
const CHANNEL = 'atualizacoes';
const CATEGORY = 'atualizacao';
const ACTION_INSTALL = 'instalar';

interface NoticeData {
  kind: 'palmmap-update';
  info: UpdateInfo;
}

let prepared: Promise<boolean> | null = null;

/** The channel, the Install button and the permission. Once per session. */
export function prepareUpdateNotice(): Promise<boolean> {
  prepared ??= (async () => {
    try {
      if (Platform.OS === 'android') {
        // The channel first: on Android 13+ no permission prompt shows
        // without one.
        await Notifications.setNotificationChannelAsync(CHANNEL, {
          name: t().updateNotice.channel,
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      await Notifications.setNotificationCategoryAsync(CATEGORY, [
        {
          identifier: ACTION_INSTALL,
          buttonTitle: t().updateNotice.install,
          options: { opensAppToForeground: true },
        },
      ]);
      const current = await Notifications.getPermissionsAsync();
      if (!current.granted && current.canAskAgain) {
        return (await Notifications.requestPermissionsAsync()).granted;
      }
      return current.granted;
    } catch {
      prepared = null;
      return false;
    }
  })();
  return prepared;
}

/** Tells the person the file is on the phone. A failure here changes nothing. */
export async function notifyUpdateReady(info: UpdateInfo): Promise<void> {
  try {
    if (!(await prepareUpdateNotice())) {
      return;
    }
    const data: NoticeData = { kind: 'palmmap-update', info };
    await Notifications.scheduleNotificationAsync({
      identifier: `atualizacao-${info.build}`,
      content: {
        title: t().updateNotice.title(info.version),
        body: t().updateNotice.body,
        categoryIdentifier: CATEGORY,
        data: data as unknown as Record<string, unknown>,
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
    });
  } catch {
    // The download is done either way; the Settings button still installs.
  }
}

function noticeInfo(response: Notifications.NotificationResponse): UpdateInfo | null {
  const data = response.notification.request.content.data as Partial<NoticeData> | undefined;
  const info = data?.kind === 'palmmap-update' ? data.info : undefined;
  return info && typeof info.build === 'number' ? info : null;
}

/** Opens the installer once the app is really in front (Android requires it). */
function whenActive(run: () => void): void {
  if (AppState.currentState === 'active') {
    run();
    return;
  }
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      subscription.remove();
      run();
    }
  });
}

async function handle(response: Notifications.NotificationResponse): Promise<void> {
  const info = noticeInfo(response);
  if (!info) {
    return;
  }
  const action = response.actionIdentifier;
  if (action !== ACTION_INSTALL && action !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
    return;
  }
  void Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(
    () => undefined,
  );
  // Gone (the cache was cleared) or already installed: nothing to open.
  const file = downloadedUpdate(info);
  if (!file) {
    return;
  }
  whenActive(() => {
    void installUpdate(file, info).catch(() => undefined);
  });
}

/**
 * Listens for taps on the notice, including the one that started the app.
 * Called once, at start-up; returns the unsubscribe.
 */
export function listenForUpdateNotice(): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    void handle(response);
  });
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) {
        void handle(response);
        void Notifications.clearLastNotificationResponseAsync?.().catch(() => undefined);
      }
    })
    .catch(() => undefined);
  return () => subscription.remove();
}
