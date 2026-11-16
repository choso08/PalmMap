import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { alertsFor, serviceAlerts, type ServiceAlert } from '../services/alerts';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

interface Props {
  /** Public line numbers shown here (`3601`). */
  lines: string[];
  /** The stop shown, for alerts that name stops. */
  stopId?: string | null;
}

/**
 * The service alerts touching what is on screen — a stop's lines, a bus's, a
 * line's journey — as Moovit shows them (author's request, November 2026).
 * Collapsed to the title; a tap shows the whole text. Nothing when there are
 * none, or when they cannot be fetched: extra information, never an error.
 */
export function ServiceAlerts({ lines, stopId }: Props) {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [all, setAll] = useState<ServiceAlert[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    serviceAlerts()
      .then((list) => {
        if (!cancelled) {
          setAll(list);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const key = lines.join(',');
  const shown = useMemo(
    () => alertsFor(all, key ? key.split(',') : [], stopId),
    [all, key, stopId],
  );
  if (shown.length === 0) {
    return null;
  }

  return (
    <View style={styles.box}>
      {shown.slice(0, 4).map((a) => {
        const unfolded = open === a.id;
        return (
          <Pressable
            key={a.id}
            style={styles.row}
            onPress={() => setOpen(unfolded ? null : a.id)}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons
              name={a.effect === 'NO_SERVICE' ? 'alert-octagon' : 'alert'}
              size={18}
              color={theme.closingSoon}
              style={styles.icon}
            />
            <View style={styles.texts}>
              <Text style={styles.title} numberOfLines={unfolded ? undefined : 2}>
                {a.title}
              </Text>
              {unfolded && a.description ? (
                <Text style={styles.description}>{a.description}</Text>
              ) : null}
              {!unfolded && a.description ? (
                <Text style={styles.more}>{strings.transit.alertMore}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    box: {
      marginTop: 10,
      borderRadius: 12,
      backgroundColor: theme.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    row: {
      flexDirection: 'row',
      paddingVertical: 8,
    },
    icon: {
      marginTop: 1,
      marginRight: 10,
    },
    texts: {
      flex: 1,
    },
    title: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
    },
    description: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 4,
      lineHeight: 18,
    },
    more: {
      fontSize: 12,
      color: theme.accent,
      marginTop: 2,
    },
  });
}
