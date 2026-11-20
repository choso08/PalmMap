import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSwipeToClose } from '../useSwipeToClose';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { serviceAlerts } from '../services/alerts';
import { busDeparturesNear, departuresNear, type ScheduleDeparture } from '../services/schedules';
import { useOnline } from '../services/network';
import { arrivalsAt, nearbyStops, type TransitStop } from '../services/transit';
import { stretchLive } from '../services/busEta';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import type { Coordinates } from '../types/geo';
import { distanceMeters } from '../utils/geometry';
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
  /** A station or timetable stop tapped: the map there, its panel if shown. */
  onOpenStation: (at: Coordinates) => void;
  onOpenAlerts: () => void;
}

/** One line at one place: its destination and next passes. */
interface LineRow {
  key: string;
  line: string;
  kind: string;
  operator?: string;
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
  /** A station from the stored timetables: where it is. */
  at: Coordinates | null;
  rows: LineRow[];
}

/** The same line and destination once, with its next passes side by side. */
function group(
  list: {
    line: string;
    destination: string;
    minutes: number;
    live: boolean;
    kind: string;
    operator?: string;
  }[],
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
        operator: a.operator,
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
export function NearbySheet({
  visible,
  origin,
  onClose,
  onOpenStop,
  onOpenStation,
  onOpenAlerts,
}: Props) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const appActive = useAppActive();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  const online = useOnline();
  /** Each load's number: only the latest one may write the list. */
  const loadId = useRef(0);

  const load = useCallback(async () => {
    const id = (loadId.current += 1);
    if (!origin) {
      setPlaces([]);
      return;
    }
    const out: Place[] = [];
    // The stored timetables answer at once: trains, metro, ferries and Metro
    // Sul do Tejo by station; the timetable-only buses (Carris de Lisboa)
    // at their nearest stop — and offline Carris Metropolitana's stored
    // timetable stands in for its live arrivals, as on a stop's panel.
    const stored = [
      ...departuresNear(origin, 900, 40),
      ...busDeparturesNear(origin, 400, 40, new Date(), !online),
    ];
    const byStation = new Map<string, ScheduleDeparture[]>();
    for (const d of stored) {
      const key = `${d.operator}|${d.station}`;
      byStation.set(key, [...(byStation.get(key) ?? []), d]);
    }
    for (const [key, list] of byStation) {
      const kind = list[0].kind;
      out.push({
        key: `st:${key}`,
        name: list[0].station,
        meters: Math.round(distanceMeters(origin, list[0].coordinates)),
        icon:
          kind === 'subway'
            ? 'subway-variant'
            : kind === 'boat'
              ? 'ferry'
              : kind === 'light_rail'
                ? 'tram'
                : kind === 'bus'
                  ? 'bus-stop'
                  : 'train',
        stop: null,
        at: list[0].coordinates,
        rows: group(list.map((d) => ({ ...d, operator: d.feedId, live: false }))),
      });
    }
    if (online) {
      try {
        const stops = (await nearbyStops(origin, NEARBY_STOPS)) ?? [];
        const arrivals = await Promise.all(
          stops.map((s) => arrivalsAt(s.id, 12).then(stretchLive).catch(() => [])),
        );
        stops.forEach((stop, i) => {
          out.push({
            key: stop.id,
            name: stop.name,
            meters: stop.meters,
            icon: 'bus-stop',
            stop,
            at: null,
            rows: group(
              arrivals[i].map((a) => ({ ...a, kind: 'bus', operator: 'carris-metropolitana' })),
            ),
          });
        });
        if (id === loadId.current) {
          setError(null);
        }
      } catch (e) {
        if (id === loadId.current) {
          setError(e instanceof Error ? e.message : strings.transit.stopsFailed);
        }
      }
    } else {
      setError(null);
    }
    // An older load that finished late does not overwrite a newer one.
    if (id !== loadId.current) {
      return;
    }
    // Nearest first, stops and stations together.
    setPlaces(out.sort((a, b) => (a.meters ?? 1e9) - (b.meters ?? 1e9)));
  }, [origin, strings, online]);

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
  // Pull the header down to close (`useSwipeToClose`).
  const swipe = useSwipeToClose(onClose, visible);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      // See-through, so pulling the screen down (`useSwipeToClose`) shows the map.
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Animated.View style={[styles.screen, swipe.sheetStyle]}>
        <View style={styles.header} {...swipe.headerHandlers}>
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
                } else if (place.at) {
                  onClose();
                  onOpenStation(place.at);
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
                  const bg = lineColour(row.kind, row.line, theme.vehicle, row.operator);
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
      </Animated.View>
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
