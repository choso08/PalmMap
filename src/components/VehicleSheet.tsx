import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  type GestureResponderHandlers,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { type EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { VehicleProgress, VehicleTrip } from '../services/transit';
import type { LiveVehicle } from '../services/vehicles';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import { formatDurationShort } from '../utils/format';
import { textOn } from '../utils/lineColour';

interface Props {
  /** The bus as last seen: it keeps moving while the panel is open. */
  vehicle: LiveVehicle;
  trip: VehicleTrip | null;
  progress: VehicleProgress | null;
  loading: boolean;
  error: string | null;
  dragHandlers?: GestureResponderHandlers;
  onClose: () => void;
}

/** Stops listed before "N more stops". */
const FOLDED_STOPS = 6;

function clock(unix: number): string {
  const d = new Date(unix * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "13 s", "2 min": how long ago the bus reported where it was. */
function ago(seconds: number): string {
  return seconds < 60 ? `${Math.max(0, Math.round(seconds))} s` : `${Math.floor(seconds / 60)} min`;
}

/**
 * A bus tapped on the map (author's request, November 2026): its line and
 * where it goes, how long ago its position came in, the stop it stands at or
 * heads to, and the stops after with when it should reach them — its own
 * timetable shifted by how late it runs. The map draws its way from where it
 * is, and those stops.
 */
export function VehicleSheet({ vehicle, trip, progress, loading, error, dragHandlers, onClose }: Props) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const tr = strings.transit;
  const [unfolded, setUnfolded] = useState(false);

  // The age counts up on screen between refreshes of the list.
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, []);

  const colour = trip?.colour ?? theme.vehicle;
  const stops = trip?.stops ?? [];
  const ahead = progress ? stops.slice(progress.nextIndex) : [];
  const shown = unfolded ? ahead : ahead.slice(0, FOLDED_STOPS);
  const standingAt = progress && progress.atIndex >= 0 ? stops[progress.atIndex] : null;
  const next = ahead[0] ?? null;
  const nextEta = progress?.etas[0] ?? null;

  let delayText: string | null = null;
  if (trip && progress?.delaySeconds != null) {
    if (!trip.exactTrip) {
      delayText = tr.vehicleNearTrip;
    } else {
      const min = Math.round(Math.abs(progress.delaySeconds) / 60);
      delayText =
        min < 1 ? tr.vehicleOnTime : progress.delaySeconds > 0 ? tr.vehicleLate(min) : tr.vehicleEarly(min);
    }
  }
  const late = trip?.exactTrip && (progress?.delaySeconds ?? 0) >= 60;

  return (
    <View style={styles.container}>
      <View style={styles.handleZone} {...dragHandlers}>
        <View style={styles.handle} />
      </View>

      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: colour }]}>
          <MaterialCommunityIcons name="bus" size={16} color={textOn(colour)} />
          <Text style={[styles.badgeText, { color: textOn(colour) }]}>{vehicle.line}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={2}>
            {trip?.headsign ? `→ ${trip.headsign}` : vehicle.line}
          </Text>
          <Text style={styles.updated}>
            {tr.vehicleUpdated(ago(now - vehicle.reportedAt))}
            {vehicle.speedKmh > 0 ? ` · ${vehicle.speedKmh} km/h` : ''}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
          <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text style={styles.muted}>{tr.loadingJourney}</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {trip && progress ? (
        <>
          <View style={styles.status}>
            <Text style={styles.statusLabel}>
              {standingAt ? tr.vehicleAt : next ? tr.vehicleNext : tr.vehicleEnd}
            </Text>
            {standingAt || next ? (
              <Text style={styles.statusName} numberOfLines={2}>
                {(standingAt ?? next)?.name}
                {!standingAt && nextEta !== null
                  ? ` · ${formatDurationShort(Math.max(0, nextEta - now))}`
                  : ''}
              </Text>
            ) : null}
            {delayText ? (
              <Text style={[styles.delay, late ? styles.delayLate : null]}>{delayText}</Text>
            ) : null}
          </View>

          {ahead.length > 0 ? (
            <ScrollView style={styles.list} nestedScrollEnabled>
              {shown.map((stop, k) => {
                const eta = progress.etas[k];
                return (
                  <View key={`${stop.id}-${k}`} style={styles.row}>
                    <Text style={[styles.time, k === 0 && styles.timeFirst]}>
                      {eta !== null && eta !== undefined ? clock(eta) : ''}
                    </Text>
                    <View style={styles.railColumn}>
                      <View
                        style={[
                          styles.rail,
                          { backgroundColor: colour },
                          k === 0 && styles.railFirst,
                          k === ahead.length - 1 && styles.railLast,
                        ]}
                      />
                      <View
                        style={[
                          k === 0 || k === ahead.length - 1 ? styles.dotBig : styles.dot,
                          { borderColor: colour },
                        ]}
                      />
                    </View>
                    <Text
                      style={[styles.name, (k === 0 || k === ahead.length - 1) && styles.nameBold]}
                      numberOfLines={1}
                    >
                      {stop.name}
                    </Text>
                  </View>
                );
              })}
              {ahead.length > FOLDED_STOPS ? (
                <Pressable style={styles.more} onPress={() => setUnfolded((u) => !u)}>
                  <MaterialCommunityIcons
                    name={unfolded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.accent}
                  />
                  <Text style={styles.moreText}>
                    {unfolded ? tr.vehicleLess : tr.vehicleMore(ahead.length - FOLDED_STOPS)}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          ) : null}
        </>
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
      gap: 12,
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
      alignItems: 'flex-start',
      gap: 12,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 8,
      marginTop: 1,
    },
    badgeText: {
      fontSize: 15,
      fontWeight: '800',
    },
    headerText: {
      flex: 1,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
      letterSpacing: -0.3,
    },
    updated: {
      fontSize: 11,
      color: theme.textMuted,
      marginTop: 3,
      fontVariant: ['tabular-nums'],
    },
    closeButton: {
      padding: 4,
      borderRadius: 18,
      backgroundColor: theme.surfaceMuted,
    },
    loading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    muted: {
      fontSize: 13,
      color: theme.textMuted,
    },
    error: {
      fontSize: 13,
      color: theme.danger,
    },
    status: {
      backgroundColor: theme.surfaceMuted,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 2,
    },
    statusLabel: {
      fontSize: 12,
      color: theme.textMuted,
    },
    statusName: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
    },
    delay: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.open,
      marginTop: 2,
    },
    delayLate: {
      color: theme.danger,
    },
    list: {
      maxHeight: 260,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 34,
    },
    time: {
      width: 46,
      fontSize: 12,
      color: theme.textMuted,
      fontVariant: ['tabular-nums'],
    },
    timeFirst: {
      color: theme.text,
      fontWeight: '700',
    },
    railColumn: {
      width: 22,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rail: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 5,
      borderRadius: 3,
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
    dotBig: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 3,
      backgroundColor: theme.surface,
    },
    name: {
      flex: 1,
      fontSize: 14,
      color: theme.text,
      paddingLeft: 8,
    },
    nameBold: {
      fontWeight: '700',
    },
    more: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 8,
      paddingLeft: 46,
    },
    moreText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.accent,
    },
  });
}
