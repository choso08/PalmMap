import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LineJourney as Journey } from '../services/transit';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

interface Props {
  journey: Journey | null;
  loading: boolean;
  error: string | null;
}

/** Minutes between two `HH:MM`, across midnight; null when either is missing. */
function minutesBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) {
    return null;
  }
  const [h1, m1] = from.split(':').map(Number);
  const [h2, m2] = to.split(':').map(Number);
  const diff = h2 * 60 + m2 - (h1 * 60 + m1);
  return diff < 0 ? diff + 24 * 60 : diff;
}

/**
 * A line's stops from where one boards, as Maps shows a tapped line: a coloured
 * rail with the boarding stop at the top, the stops in between folded into
 * "12 stops · 25 min" (a tap opens them), and the last one — where to get off
 * for the destination chosen, or the end of the line.
 */
export function LineJourney({ journey, loading, error }: Props) {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [unfolded, setUnfolded] = useState(false);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={theme.accent} />
        <Text style={styles.muted}>{strings.transit.loadingJourney}</Text>
      </View>
    );
  }
  if (error) {
    return <Text style={styles.error}>{error}</Text>;
  }
  if (!journey || journey.stops.length === 0) {
    return null;
  }

  // The line's own colour for the rail, as on the bus stop's sign; the theme's
  // accent when the service gives none.
  const rail = journey.colour ?? theme.accent;
  const stops = journey.stops;
  const first = stops[0];
  const last = stops.length > 1 ? stops[stops.length - 1] : null;
  const middle = stops.slice(1, -1);
  const fold = middle.length > 3 && !unfolded;

  const row = (
    stop: (typeof stops)[number],
    kind: 'end' | 'middle',
    label?: string,
  ) => (
    <View key={`${stop.id}-${kind}-${label ?? ''}`} style={styles.row}>
      <Text style={[styles.time, kind === 'end' && styles.timeEnd]}>{stop.time ?? ''}</Text>
      <View style={styles.railColumn}>
        <View style={[styles.railLine, { backgroundColor: rail }]} />
        <View
          style={[
            kind === 'end' ? styles.dotEnd : styles.dot,
            { borderColor: rail },
          ]}
        />
      </View>
      <View style={styles.texts}>
        <Text style={[styles.name, kind === 'end' && styles.nameEnd]} numberOfLines={2}>
          {stop.name}
        </Text>
        {label ? <Text style={[styles.label, { color: rail }]}>{label}</Text> : null}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {row(first, 'end')}
      {fold ? (
        <Pressable style={styles.row} onPress={() => setUnfolded(true)}>
          <Text style={styles.time} />
          <View style={styles.railColumn}>
            <View style={[styles.railLine, { backgroundColor: rail }]} />
          </View>
          <Text style={styles.more}>
            {strings.transit.moreStops(
              middle.length,
              minutesBetween(first.time, last?.time ?? null),
            )}
          </Text>
        </Pressable>
      ) : (
        middle.map((s) => row(s, 'middle'))
      )}
      {last
        ? row(last, 'end', journey.alightIndex !== null ? strings.transit.getOffHere : undefined)
        : null}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      paddingTop: 4,
      paddingBottom: 8,
    },
    loading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
    },
    muted: {
      fontSize: 13,
      color: theme.textMuted,
    },
    error: {
      fontSize: 13,
      color: theme.danger,
      paddingVertical: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 32,
    },
    time: {
      width: 46,
      fontSize: 12,
      color: theme.textMuted,
      fontVariant: ['tabular-nums'],
    },
    timeEnd: {
      fontWeight: '700',
      color: theme.text,
    },
    railColumn: {
      width: 22,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
    },
    railLine: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 4,
      borderRadius: 2,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 2,
      backgroundColor: theme.surface,
    },
    dotEnd: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 3,
      backgroundColor: theme.surface,
    },
    texts: {
      flex: 1,
      paddingLeft: 8,
      paddingVertical: 4,
    },
    name: {
      fontSize: 13,
      color: theme.text,
    },
    nameEnd: {
      fontWeight: '700',
    },
    label: {
      fontSize: 12,
      fontWeight: '700',
    },
    more: {
      flex: 1,
      paddingLeft: 8,
      fontSize: 13,
      color: theme.accent,
      fontWeight: '600',
    },
  });
}
