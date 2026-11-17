import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderHandlers,
} from 'react-native';
import { type EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { JourneyStop, LineDirection, TransitLineInfo } from '../services/transit';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import { operatorColour, textOn } from '../utils/lineColour';
import { ServiceAlerts } from './ServiceAlerts';
import { useIsFavouriteLine } from '../services/favouriteLines';

interface Props {
  line: TransitLineInfo;
  directions: LineDirection[];
  /** Which of `directions` is shown. */
  index: number;
  loading: boolean;
  error: string | null;
  dragHandlers?: GestureResponderHandlers;
  onChooseDirection: (index: number) => void;
  onStopPress: (stop: JourneyStop) => void;
  onClose: () => void;
}

/**
 * A line found by the search (author's request, "as in Moovit"): its number
 * and name, one chip per direction, its alerts, and every stop in order —
 * a tap on one opens that stop's arrivals. The map draws its way.
 */
export function LineSheet({
  line,
  directions,
  index,
  loading,
  error,
  dragHandlers,
  onChooseDirection,
  onStopPress,
  onClose,
}: Props) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const colour = line.colour ?? operatorColour('carris-metropolitana', theme.vehicle);
  const shown = directions[index] ?? null;
  const [favourite, toggleFavourite] = useIsFavouriteLine(line);

  return (
    <View style={styles.container}>
      <View style={styles.handleZone} {...dragHandlers}>
        <View style={styles.handle} />
      </View>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: colour }]}>
          <MaterialCommunityIcons name="bus" size={16} color={line.textColour ?? textOn(colour)} />
          <Text style={[styles.badgeText, { color: line.textColour ?? textOn(colour) }]}>
            {line.short}
          </Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {line.long}
        </Text>
        <Pressable
          onPress={toggleFavourite}
          hitSlop={12}
          accessibilityLabel={favourite ? strings.transit.unfavouriteLine : strings.transit.favouriteLine}
          accessibilityState={{ selected: favourite }}
        >
          <MaterialCommunityIcons
            name={favourite ? 'star' : 'star-outline'}
            size={22}
            color={favourite ? theme.accent : theme.textMuted}
          />
        </Pressable>
        <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
          <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
        </Pressable>
      </View>

      {directions.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {directions.map((d, i) => (
            <Pressable
              key={d.patternId}
              style={[styles.chip, i === index && { backgroundColor: colour, borderColor: colour }]}
              onPress={() => onChooseDirection(i)}
            >
              <Text
                style={[styles.chipText, i === index && { color: textOn(colour) }]}
                numberOfLines={1}
              >
                → {d.headsign}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : shown ? (
        <Text style={styles.muted}>→ {shown.headsign}</Text>
      ) : null}

      <ServiceAlerts lines={[line.short]} />

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text style={styles.muted}>{strings.transit.loadingJourney}</Text>
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : shown ? (
        <ScrollView style={styles.list} nestedScrollEnabled>
          {shown.stops.map((stop, k) => {
            const end = k === 0 || k === shown.stops.length - 1;
            return (
              <Pressable key={`${stop.id}-${k}`} style={styles.row} onPress={() => onStopPress(stop)}>
                <View style={styles.rail}>
                  <View
                    style={[
                      styles.railLine,
                      { backgroundColor: colour },
                      k === 0 && styles.railFirst,
                      k === shown.stops.length - 1 && styles.railLast,
                    ]}
                  />
                  <View style={[end ? styles.dotEnd : styles.dot, { borderColor: colour }]} />
                </View>
                <Text style={[styles.stopName, end && styles.stopEnd]} numberOfLines={1}>
                  {stop.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: insets.bottom + 20,
      gap: 10,
    },
    handleZone: {
      alignItems: 'center',
      paddingTop: 10,
      marginTop: -10,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      marginBottom: 2,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    badgeText: {
      fontSize: 17,
      fontWeight: '800',
    },
    title: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
    },
    close: {
      padding: 6,
      borderRadius: 20,
      backgroundColor: theme.surfaceMuted,
    },
    chips: {
      gap: 8,
    },
    chip: {
      maxWidth: 260,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipText: {
      fontSize: 14,
      color: theme.text,
    },
    muted: {
      fontSize: 14,
      color: theme.textMuted,
    },
    loading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
    },
    error: {
      fontSize: 14,
      color: theme.danger,
    },
    list: {
      maxHeight: 300,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 40,
    },
    rail: {
      width: 28,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
    },
    railLine: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 4,
    },
    railFirst: {
      top: '50%',
    },
    railLast: {
      bottom: '50%',
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
    stopName: {
      flex: 1,
      marginLeft: 10,
      fontSize: 14,
      color: theme.text,
    },
    stopEnd: {
      fontWeight: '700',
    },
  });
}
