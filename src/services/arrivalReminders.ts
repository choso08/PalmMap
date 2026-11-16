import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { t } from '../i18n';

/**
 * "Your bus reaches your stop in 5 minutes" (author's request, November 2026,
 * from the Moovit list): a local notification, scheduled on the phone — there
 * is no server of ours to push anything.
 *
 * It is scheduled for the estimate known when the bell is tapped, and moved
 * every time the stop's panel refreshes its arrivals (`updateReminders`) — so
 * it follows the real bus while the panel is open, and the last estimate
 * otherwise. Android may deliver it a little late when the phone sleeps and
 * exact alarms are not allowed (`expo-notifications` falls back by itself).
 */
const LEAD_S = 5 * 60;
const CHANNEL = 'chegadas';

// Shown also with the app open: the person may be looking at the map.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface Reminder {
  /** The notification's id, to move or cancel it. */
  id: string;
  /** When it was set to fire (seconds since 1970); past it, it is not moved. */
  at: number;
  unix: number;
  line: string;
  stopName: string;
  destination: string;
}

/** By `reminderKey`: one bus at one stop. Only for this session. */
const reminders = new Map<string, Reminder>();
const listeners = new Set<() => void>();

/** One bus at one stop: the stop, its pattern and its timetable time there. */
export function reminderKey(
  stopId: string,
  a: { patternId: string | null; scheduledText: string | null; line: string; time: string },
): string {
  return `${stopId}|${a.patternId ?? a.line}|${a.scheduledText ?? a.time}`;
}

let channelReady = false;
async function ready(): Promise<boolean> {
  // The channel first: on Android 13+ the system shows no permission prompt
  // until the app has a notification channel.
  if (!channelReady && Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: t().transit.reminderChannel,
      importance: Notifications.AndroidImportance.HIGH,
    });
    channelReady = true;
  }
  const current = await Notifications.getPermissionsAsync();
  // Asked only here, after a tap on the bell: never at start-up.
  if (!current.granted && current.canAskAgain) {
    return (await Notifications.requestPermissionsAsync()).granted;
  }
  return current.granted;
}

/** When a reminder fires: five minutes before, or a few seconds from now. */
function firesAt(unix: number): number {
  return Math.max(Date.now() / 1000 + 5, unix - LEAD_S);
}

/** Keys with a schedule or cancel still on its way — a second tap waits for it. */
const busy = new Set<string>();

/** Reminders whose bus has gone are dropped, so their bell goes dark. */
function prune(): void {
  const now = Date.now() / 1000;
  let changed = false;
  for (const [key, r] of reminders) {
    if (r.unix + 60 < now) {
      reminders.delete(key);
      changed = true;
    }
  }
  if (changed) {
    listeners.forEach((l) => l());
  }
}

async function schedule(r: Omit<Reminder, 'id' | 'at'>): Promise<string> {
  const at = firesAt(r.unix);
  const minutes = Math.max(0, Math.round((r.unix - at) / 60));
  return Notifications.scheduleNotificationAsync({
    content: {
      title: t().transit.reminderTitle(r.line, minutes),
      body: t().transit.reminderBody(r.stopName, r.destination),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(at * 1000),
      channelId: CHANNEL,
    },
  });
}

/**
 * Sets or clears the reminder for one bus. Returns false when notifications
 * are not allowed.
 */
export async function toggleReminder(
  key: string,
  bus: { unix: number; line: string; destination: string },
  stopName: string,
): Promise<boolean> {
  // A second tap while the first is on its way does nothing: two would
  // schedule two notifications and lose one's id.
  if (busy.has(key)) {
    return true;
  }
  busy.add(key);
  try {
    const old = reminders.get(key);
    if (old) {
      reminders.delete(key);
      listeners.forEach((l) => l());
      await Notifications.cancelScheduledNotificationAsync(old.id).catch(() => undefined);
      return true;
    }
    if (!(await ready())) {
      return false;
    }
    const data = { unix: bus.unix, line: bus.line, stopName, destination: bus.destination };
    const at = firesAt(bus.unix);
    const id = await schedule(data);
    reminders.set(key, { id, at, ...data });
    listeners.forEach((l) => l());
    return true;
  } finally {
    busy.delete(key);
  }
}

/** A refresh of a stop's arrivals: each reminded bus moves to its new estimate. */
export function updateReminders(
  stopId: string,
  arrivals: {
    patternId: string | null;
    scheduledText: string | null;
    line: string;
    time: string;
    unix: number;
  }[],
): void {
  prune();
  const now = Date.now() / 1000;
  for (const a of arrivals) {
    const key = reminderKey(stopId, a);
    const r = reminders.get(key);
    // Only a change of a minute or more is worth rescheduling; one already
    // delivered is never sent again; one being moved is left to finish.
    if (!r || busy.has(key) || r.at <= now || Math.abs(r.unix - a.unix) < 60) {
      continue;
    }
    busy.add(key);
    const moved = { ...r, unix: a.unix };
    void Notifications.cancelScheduledNotificationAsync(r.id)
      .catch(() => undefined)
      .then(() => schedule(moved))
      .then((id) => {
        if (reminders.has(key)) {
          reminders.set(key, { ...moved, id, at: firesAt(moved.unix) });
        } else {
          // Cleared meanwhile.
          void Notifications.cancelScheduledNotificationAsync(id);
        }
      })
      .catch(() => undefined)
      .finally(() => busy.delete(key));
  }
}

/** The keys with a reminder, kept up to date for the bells. */
export function useReminderKeys(): Set<string> {
  const [keys, setKeys] = useState(() => new Set(reminders.keys()));
  useEffect(() => {
    const update = () => setKeys(new Set(reminders.keys()));
    listeners.add(update);
    prune();
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return keys;
}
