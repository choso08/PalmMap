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
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  // Asked only here, after a tap on the bell: never at start-up.
  if (!granted && current.canAskAgain) {
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }
  if (granted && !channelReady && Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: t().transit.reminderChannel,
      importance: Notifications.AndroidImportance.HIGH,
    });
    channelReady = true;
  }
  return granted;
}

async function schedule(r: Omit<Reminder, 'id'>): Promise<string> {
  const now = Date.now() / 1000;
  const minutes = Math.max(0, Math.round((r.unix - Math.max(now, r.unix - LEAD_S)) / 60));
  return Notifications.scheduleNotificationAsync({
    content: {
      title: t().transit.reminderTitle(r.line, minutes),
      body: t().transit.reminderBody(r.stopName, r.destination),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Math.max(now + 5, r.unix - LEAD_S) * 1000),
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
  const id = await schedule(data);
  reminders.set(key, { id, ...data });
  listeners.forEach((l) => l());
  return true;
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
  for (const a of arrivals) {
    const key = reminderKey(stopId, a);
    const r = reminders.get(key);
    // Only a change of a minute or more is worth rescheduling.
    if (!r || Math.abs(r.unix - a.unix) < 60) {
      continue;
    }
    const next = { ...r, unix: a.unix };
    reminders.set(key, next);
    void Notifications.cancelScheduledNotificationAsync(r.id)
      .then(() => schedule(next))
      .then((id) => {
        const still = reminders.get(key);
        if (still) {
          reminders.set(key, { ...still, id });
        } else {
          // Cleared meanwhile.
          void Notifications.cancelScheduledNotificationAsync(id);
        }
      })
      .catch(() => undefined);
  }
}

/** The keys with a reminder, kept up to date for the bells. */
export function useReminderKeys(): Set<string> {
  const [keys, setKeys] = useState(() => new Set(reminders.keys()));
  useEffect(() => {
    const update = () => setKeys(new Set(reminders.keys()));
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return keys;
}
