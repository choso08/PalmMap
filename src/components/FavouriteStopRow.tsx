import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { departuresAtStop } from '../services/schedules';
import { arrivalsAt, type TransitStop } from '../services/transit';
import { stretchLive } from '../services/busEta';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import { lineColour, textOn } from '../utils/lineColour';

interface Props {
  stop: TransitStop;
  onPress: () => void;
}

interface Next {
  line: string;
  destination: string;
  minutes: number;
  live: boolean;
}

/**
 * A favourite stop on the Saved screen with its next three buses — what one
 * opens the app to know (author's request, "as in Moovit"). Asked once when
 * shown; tapping opens the stop's panel, which keeps itself up to date.
 */
export function FavouriteStopRow({ stop, onPress }: Props) {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [next, setNext] = useState<Next[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const done = (list: Next[]) => {
      if (!cancelled) {
        setNext(list);
      }
    };
    if (stop.id.startsWith('sched:')) {
      done(
        departuresAtStop(stop.id, 3).map((d) => ({
          line: d.line,
          destination: d.destination,
          minutes: d.minutes,
          live: false,
        })),
      );
    } else {
      arrivalsAt(stop.id, 3)
        .then((list) =>
          done(
            stretchLive(list).map((a) => ({
              line: a.line,
              destination: a.destination,
              minutes: a.minutes,
              live: a.live,
            })),
          ),
        )
        .catch(() => done([]));
    }
    return () => {
      cancelled = true;
    };
  }, [stop.id]);

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.icon}>
        <MaterialCommunityIcons name="bus-stop" size={20} color={theme.accent} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.name} numberOfLines={1}>
          {stop.name}
        </Text>
        {next === null ? (
          <Text style={styles.muted}>…</Text>
        ) : next.length === 0 ? (
          <Text style={styles.muted}>{strings.transit.noneSoon}</Text>
        ) : (
          next.map((n, i) => {
            const bg = lineColour('bus', n.line, theme.vehicle, 'carris-metropolitana');
            return (
              <View key={i} style={styles.next}>
                <Text style={[styles.badge, { backgroundColor: bg, color: textOn(bg) }]}>
                  {n.line}
                </Text>
                <Text style={styles.destination} numberOfLines={1}>
                  {n.destination}
                </Text>
                <Text style={[styles.minutes, n.live ? { color: theme.open } : null]}>
                  {n.minutes <= 0 ? strings.saved.arriving : `${n.minutes} min`}
                </Text>
              </View>
            );
          })
        )}
      </View>
    </Pressable>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      paddingVertical: 12,
      gap: 14,
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceMuted,
    },
    texts: {
      flex: 1,
      gap: 4,
    },
    name: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
    },
    muted: {
      fontSize: 13,
      color: theme.textMuted,
    },
    next: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    badge: {
      minWidth: 38,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '700',
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 1,
      overflow: 'hidden',
    },
    destination: {
      flex: 1,
      fontSize: 13,
      color: theme.textMuted,
    },
    minutes: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
    },
  });
}
