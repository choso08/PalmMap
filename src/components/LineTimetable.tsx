import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { stopTimetable } from '../services/transit';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import { dayChipLabel } from './TransitWhenPicker';

/** Seconds since today's midnight, to the minute. */
function secondsNow(): number {
  const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60;
}

interface Props {
  patternId: string;
  boardSequence?: number;
  stopId: string;
}

/** How many days ahead can be looked at: the pattern's timetable covers weeks. */
const DAYS = 7;

/**
 * A line's every passage at a stop on a chosen day, hour by hour, as Moovit
 * shows it (author's request, November 2026). Closed until tapped: the times
 * come from the pattern the journey already loaded (`stopTimetable`).
 */
export function LineTimetable({ patternId, boardSequence, stopId }: Props) {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [times, setTimes] = useState<number[] | null>(null);
  const [failed, setFailed] = useState(false);

  const day = (n: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return d;
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setTimes(null);
    setFailed(false);
    stopTimetable(patternId, boardSequence, stopId, day(offset))
      .then((found) => !cancelled && setTimes(found))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [open, offset, patternId, boardSequence, stopId]);

  // Hour by hour, as on the stop's printed sheet: "07 | 05 20 35 50".
  const hours = useMemo(() => {
    const byHour = new Map<number, string[]>();
    for (const sec of times ?? []) {
      const h = Math.floor(sec / 3600);
      const list = byHour.get(h) ?? [];
      list.push(String(Math.floor((sec % 3600) / 60)).padStart(2, '0'));
      byHour.set(h, list);
    }
    return [...byHour.entries()];
  }, [times]);

  // The passages already gone today are faded, as on Moovit — kept current
  // while the timetable is open (a tick a minute).
  const [nowSec, setNowSec] = useState(secondsNow);
  useEffect(() => {
    if (!open) {
      return;
    }
    setNowSec(secondsNow());
    const timer = setInterval(() => setNowSec(secondsNow()), 60000);
    return () => clearInterval(timer);
  }, [open]);

  const label = (n: number) => dayChipLabel(n, strings);

  return (
    <View>
      <Pressable style={styles.toggle} onPress={() => setOpen((o) => !o)} hitSlop={6}>
        <MaterialCommunityIcons name="timetable" size={16} color={theme.accent} />
        <Text style={styles.toggleText}>{strings.transit.fullTimetable}</Text>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={theme.accent}
        />
      </Pressable>
      {open ? (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.days}
          >
            {Array.from({ length: DAYS }, (_, n) => (
              <Pressable
                key={n}
                style={[styles.day, n === offset ? styles.dayOn : null]}
                onPress={() => setOffset(n)}
              >
                <Text style={[styles.dayText, n === offset ? styles.dayTextOn : null]}>
                  {label(n)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {failed ? (
            <Text style={styles.muted}>{strings.transit.timetableFailed}</Text>
          ) : times === null ? (
            <ActivityIndicator style={styles.spinner} size="small" color={theme.accent} />
          ) : hours.length === 0 ? (
            <Text style={styles.muted}>{strings.transit.noTimesThatDay}</Text>
          ) : (
            hours.map(([h, minutes]) => {
              const gone = offset === 0 && (h + 1) * 3600 <= nowSec;
              return (
                <View key={h} style={styles.hourRow}>
                  <Text style={[styles.hour, gone ? styles.gone : null]}>
                    {String(h % 24).padStart(2, '0')}
                  </Text>
                  <View style={styles.minutes}>
                    {minutes.map((m, k) => (
                      <Text
                        key={k}
                        style={[
                          styles.minute,
                          offset === 0 && h * 3600 + Number(m) * 60 < nowSec ? styles.gone : null,
                        ]}
                      >
                        {m}
                      </Text>
                    ))}
                  </View>
                </View>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    toggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
    },
    toggleText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.accent,
    },
    days: {
      gap: 6,
      paddingBottom: 8,
    },
    day: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    dayOn: {
      borderColor: theme.accent,
    },
    dayText: {
      fontSize: 12,
      color: theme.textMuted,
    },
    dayTextOn: {
      color: theme.accent,
      fontWeight: '600',
    },
    spinner: {
      paddingVertical: 8,
    },
    muted: {
      fontSize: 13,
      color: theme.textMuted,
      paddingVertical: 6,
    },
    hourRow: {
      flexDirection: 'row',
      paddingVertical: 3,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    hour: {
      width: 34,
      fontSize: 13,
      fontWeight: '700',
      color: theme.text,
      fontVariant: ['tabular-nums'],
    },
    minutes: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: 10,
    },
    minute: {
      fontSize: 13,
      color: theme.text,
      fontVariant: ['tabular-nums'],
    },
    gone: {
      color: theme.textMuted,
      opacity: 0.6,
    },
  });
}
