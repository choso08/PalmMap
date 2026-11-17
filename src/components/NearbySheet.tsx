import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { serviceAlerts } from '../services/alerts';
import { departuresNear } from '../services/schedules';
import { arrivalsAt, nearbyStops, type TransitStop } from '../services/transit';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import type { Coordinates } from '../types/geo';
import { useAppActive } from '../useAppActive';
import { formatDistance } from '../utils/format';
import { lineColour, textOn } from '../utils/lineColour';

/** How often the minutes are asked again while the screen is open. */
const NEARBY_REFRESH_MS = 30000;
/** Bus stops listed, nearest first. */
const NEARBY_STOPS = 6;
/** Each line's next passes shown in a row. */
const PER_LINE = 2;

interface Props {
  visible: boolean;
  /** Where "near" is: the GPS, or the map's middle without one. */
  origin: Coordinates | null;
  onClose: () => void;
  /** A stop tapped: its panel on the map. */
  onOpenStop: (stop: TransitStop) => void;
  onOpenAlerts: () => void;
}

/** One line at one place: its destination and next passes. */
interface LineRow {
  key: string;
  line: string;
  kind: string;
  destination: string;
  minutes: number[];
  live: boolean;
}

interface Place {
  key: string;
  name: string;
  meters: number | null;
  icon: string;
  stop: TransitStop | null;
  rows: LineRow[];
}

/** The same line and destination once, with its next passes side by side. */
function group(
  list: { line: string; destination: string; minutes: number; live: boolean; kind: string }[],
): LineRow[] {
  const byKey = new Map<string, LineRow>();
  for (const a of [...list].sort((x, y) => x.minutes - y.minutes)) {
    const key = `${a.line}|${a.destination}`;
    const row = byKey.get(key);
    if (!row) {
      byKey.set(key, {
        key,
        line: a.line,
        kind: a.kind,
        destination: a.destination,
        minutes: [a.minutes],
        live: a.live,
      });
    } else if (row.minutes.length < PER_LINE) {
      row.minutes.push(a.minutes);
    }
  }
  return [...byKey.values()];
}

/**
 * "Near you", as Moovit opens (author's request, November 2026): the bus stops
 * and stations around, each line once with its next passes — without
 * touching the map. Live times for Carris Metropolitana, stored timetables for
 * the rest. A tap on a stop opens its panel on the map.
 */
export function NearbySheet({ visible, origin, onClose, onOpenStop, onOpenAlerts }: Props) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const appActive = useAppActive();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  const load = useCallback(async () => {
    if (!origin) {
      setPlaces([]);
      return;
    }
    const out: Place[] = [];
    // Trains, metro, ferries and Carris de Lisboa: the stored timetables, at once.
    const rail = departuresNear(origin, 900, 40);
    const byStation = new Map<string, typeof rail>();
    for (const d of rail) {
      byStation.set(d.station, [...(byStation.get(d.station) ?? []), d]);
    }
    for (const [station, list] of byStation) {
      out.push({
        key: `st:${station}`,
        name: station,
        meters: null,
        icon: list[0].kind === 'subway' ? 'subway-variant' : list[0].kind === 'boat' ? 'ferry' : list[0].kind === 'bus' ? 'bus-stop' : 'train',
        stop: null,
        rows: group(list.map((d) => ({ ...d, live: false }))),
      });
    }
    try {
      const stops = (await nearbyStops(origin, NEARBY_STOPS)) ?? [];
      const arrivals = await Promise.all(
        stops.map((s) => arrivalsAt(s.id, 12).catch(() => [])),
      );
      stops.forEach((stop, i) => {
        out.push({
          key: stop.id,
          name: stop.name,
          meters: stop.meters,
          icon: 'bus-stop',
          stop,
          rows: group(arrivals[i].map((a) => ({ ...a, kind: 'bus' }))),
        });
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.transit.stopsFailed);
    }
    // Stops first, nearest first; stations after, as they come.
    setPlaces(out.sort((a, b) => (a.meters ?? 1e9) - (b.meters ?? 1e9)));
  }, [origin, strings]);

  useEffect(() => {
    if (!visible || !appActive) {
      return;
    }
    void load();
    serviceAlerts()
      .then((list) => setAlertCount(list.length))
      .catch(() => undefined);
    const timer = setInterval(() => void load(), NEARBY_REFRESH_MS);
    return () => clearInterval(timer);
  }, [visible, appActive, load]);

  const t = strings.nearby;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={strings.common.close}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          <Text style={styles.title}>{t.title}</Text>
          <Pressable style={styles.alertsButton} onPress={onOpenAlerts}>
            <MaterialCommunityIcons name="alert-outline" size={18} color={theme.text} />
            <Text style={styles.alertsText}>
              {alertCount > 0 ? t.alertsCount(alertCount) : t.alerts}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load().finally(() => setRefreshing(false));
              }}
            />
          }
        >
          {places === null ? (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {places !== null && places.length === 0 && !error ? (
            <Text style={styles.empty}>{origin ? t.none : t.noPosition}</Text>
          ) : null}
          {(places ?? []).map((place) => (
            <Pressable
              key={place.key}
              style={styles.card}
              onPress={() => {
                if (place.stop) {
                  onClose();
                  onOpenStop(place.stop);
                }
              }}
            >
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name={place.icon as never} size={20} color={theme.accent} />
                <Text style={styles.cardName} numberOfLines={1}>
                  {place.name}
                </Text>
                {place.meters !== null ? (
                  <Text style={styles.muted}>{formatDistance(place.meters)}</Text>
                ) : null}
              </View>
              {place.rows.length === 0 ? (
                <Text style={styles.muted}>{strings.transit.noneSoon}</Text>
              ) : (
                place.rows.slice(0, 6).map((row) => {
                  const bg = lineColour(row.kind, row.line, theme.vehicle);
                  return (
                    <View key={row.key} style={styles.row}>
                      <Text style={[styles.badge, { backgroundColor: bg, color: textOn(bg) }]}>
                        {row.line}
                      </Text>
                      <Text style={styles.destination} numberOfLines={1}>
                        {row.destination}
                      </Text>
                      <Text style={[styles.minutes, row.live ? { color: theme.open } : null]}>
                        {row.minutes.map((m) => (m <= 0 ? strings.saved.arriving : `${m}`)).join(' · ')}
                        {row.minutes.some((m) => m > 0) ? ' min' : ''}
                      </Text>
                    </View>
                  );
                })
              )}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
      paddingTop: insets.top + 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    title: {
      flex: 1,
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
    },
    alertsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: theme.surfaceMuted,
    },
    alertsText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
    },
    list: {
      padding: 12,
      gap: 10,
      paddingBottom: insets.bottom + 24,
    },
    loading: {
      paddingVertical: 40,
    },
    error: {
      color: theme.danger,
      fontSize: 14,
      paddingHorizontal: 8,
    },
    empty: {
      color: theme.textMuted,
      fontSize: 15,
      padding: 16,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 14,
      gap: 8,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardName: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
    },
    muted: {
      fontSize: 13,
      color: theme.textMuted,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    badge: {
      minWidth: 44,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '800',
      borderRadius: 5,
      paddingHorizontal: 5,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    destination: {
      flex: 1,
      fontSize: 14,
      color: theme.text,
    },
    minutes: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
    },
  });
}
