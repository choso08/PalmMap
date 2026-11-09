import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { GestureResponderHandlers } from 'react-native';

import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { useTheme, useT } from '../settings';
import type { Theme } from '../theme';
import type { Coordinates, Place } from '../types/geo';
import { formatDistance } from '../utils/format';
import { distanceMeters } from '../utils/geometry';
import {
  clock,
  openStatus,
  parseOpeningHours,
  weekdayOf,
  type WeeklyHours,
} from '../utils/openingHours';

interface PlaceSheetProps {
  /**
   * The gestures of the handle at the top, so the sheet can be shrunk. They
   * come from `DraggableSheet` — see there why they stay on the handle only.
   */
  dragHandlers?: GestureResponderHandlers;
  place: Place;
  /** Where the person is, for "350 m" next to the category. */
  from?: Coordinates | null;
  favourite: boolean;
  onToggleFavourite: () => void;
  onRoute: () => void;
  /**
   * Add this place as a stop on the existing route. Only offered when there is
   * already a destination — before that there is no route to add a stop to.
   */
  onAddStop?: () => void;
  onClose: () => void;
}

/**
 * A place's card, laid out the way the maps apps people know do it.
 *
 * Name, then kind and distance, then **whether it is open now** — the thing
 * people most want to know and the one OpenStreetMap's raw `opening_hours`
 * text hid. Then a row of round action buttons (directions first and filled),
 * then the details. Tapping the hours unfolds the whole week.
 *
 * When the hours cannot be read (`sunrise-sunset`, months, odd syntax), the
 * text is shown as written and there is no status line: a wrong "Open" sends
 * someone to a closed door. See `utils/openingHours.ts`.
 */
export function PlaceSheet({
  place,
  from,
  favourite,
  onToggleFavourite,
  onRoute,
  onAddStop,
  onClose,
  dragHandlers,
}: PlaceSheetProps) {
  const theme = useTheme();
  const strings = useT();
  const s = strings.place;
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const [weekOpen, setWeekOpen] = useState(false);

  const { phone, website, openingHours } = place.details ?? {};
  const week = useMemo(() => parseOpeningHours(openingHours), [openingHours]);

  // The status changes with the clock; once a minute is plenty.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => setWeekOpen(false), [place.id]);

  const status = week ? openStatus(week, now) : null;
  const statusLine = (() => {
    if (!status) {
      return null;
    }
    switch (status.kind) {
      case 'always':
        return { lead: s.open24h, leadColour: theme.open, rest: '' };
      case 'open':
        return status.closesSoon
          ? { lead: s.closesSoon, leadColour: theme.closingSoon, rest: clock(status.closesAt) }
          : { lead: s.openNow, leadColour: theme.open, rest: s.closesAt(clock(status.closesAt)) };
      case 'closed': {
        const time = clock(status.opensAt);
        const rest =
          status.inDays === 0
            ? s.opensAt(time)
            : status.inDays === 1
              ? s.opensTomorrow(time)
              : s.opensOn(s.weekdaysShort[status.weekday], time);
        return { lead: s.closedNow, leadColour: theme.danger, rest };
      }
      case 'closedForGood':
        return { lead: s.closedNow, leadColour: theme.danger, rest: '' };
    }
  })();

  const distance = from ? formatDistance(distanceMeters(from, place.coordinates)) : null;
  const subtitle = [place.category, distance].filter(Boolean).join(' · ');

  const share = () => {
    const { latitude, longitude } = place.coordinates;
    const link = `https://www.openstreetmap.org/?mlat=${latitude.toFixed(6)}&mlon=${longitude.toFixed(6)}#map=18/${latitude.toFixed(6)}/${longitude.toFixed(6)}`;
    void Share.share({
      message: [place.name, place.address, link].filter(Boolean).join('\n'),
    }).catch(() => undefined);
  };

  type Action = { key: string; icon: string; label: string; onPress: () => void; primary?: boolean };
  const actions: Action[] = [
    { key: 'route', icon: 'directions', label: s.route, onPress: onRoute, primary: true },
    ...(phone
      ? [{ key: 'call', icon: 'phone', label: s.call, onPress: () => void Linking.openURL(`tel:${phone}`) }]
      : []),
    {
      key: 'save',
      icon: favourite ? 'bookmark' : 'bookmark-outline',
      label: favourite ? s.unsave : s.save,
      onPress: onToggleFavourite,
    },
    ...(onAddStop
      ? [{ key: 'stop', icon: 'map-marker-plus-outline', label: s.addWaypoint, onPress: onAddStop }]
      : []),
    { key: 'share', icon: 'share-variant-outline', label: s.share, onPress: share },
    ...(website
      ? [{ key: 'web', icon: 'web', label: s.website, onPress: () => void Linking.openURL(website) }]
      : []),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.handleZone} {...dragHandlers}>
        <View style={styles.handle} />
      </View>

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={2}>
            {place.name}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          {statusLine ? (
            <Text style={styles.status} numberOfLines={1}>
              <Text style={{ color: statusLine.leadColour, fontWeight: '700' }}>
                {statusLine.lead}
              </Text>
              {statusLine.rest ? ` · ${statusLine.rest}` : ''}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={styles.closeButton}
          accessibilityLabel={strings.common.close}
        >
          <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actions}
        style={styles.actionsRow}
      >
        {actions.map((a) => (
          <Pressable
            key={a.key}
            onPress={a.onPress}
            style={({ pressed }) => [
              styles.action,
              a.primary && styles.actionPrimary,
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons
              name={a.icon as never}
              size={18}
              color={a.primary ? theme.onAccent : theme.accent}
            />
            <Text style={[styles.actionText, a.primary && styles.actionTextPrimary]}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.details}>
        {place.address ? (
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={19} color={theme.textMuted} />
            <Text style={styles.detailText} numberOfLines={2}>
              {place.address}
            </Text>
          </View>
        ) : null}

        {openingHours ? (
          <Pressable
            onPress={week ? () => setWeekOpen((v) => !v) : undefined}
            style={styles.detailRow}
          >
            <MaterialCommunityIcons name="clock-outline" size={19} color={theme.textMuted} />
            <View style={styles.detailBody}>
              {week ? (
                weekOpen ? (
                  <WeekTable week={week} today={weekdayOf(now)} styles={styles} names={s.weekdays} closed={s.closedAllDay} />
                ) : (
                  <Text style={styles.detailText} numberOfLines={1}>
                    {todayHours(week, weekdayOf(now), s.closedAllDay)}
                  </Text>
                )
              ) : (
                <Text style={styles.detailText} numberOfLines={3}>
                  {openingHours}
                </Text>
              )}
            </View>
            {week ? (
              <MaterialCommunityIcons
                name={weekOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={theme.textMuted}
              />
            ) : null}
          </Pressable>
        ) : null}

        {phone ? (
          <Pressable onPress={() => void Linking.openURL(`tel:${phone}`)} style={styles.detailRow}>
            <MaterialCommunityIcons name="phone-outline" size={19} color={theme.textMuted} />
            <Text style={[styles.detailText, styles.link]} numberOfLines={1}>
              {phone}
            </Text>
          </Pressable>
        ) : null}

        {website ? (
          <Pressable onPress={() => void Linking.openURL(website)} style={styles.detailRow}>
            <MaterialCommunityIcons name="web" size={19} color={theme.textMuted} />
            <Text style={[styles.detailText, styles.link]} numberOfLines={1}>
              {website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function rangesText(ranges: [number, number][], closed: string): string {
  if (ranges.length === 0) {
    return closed;
  }
  return ranges.map(([a, b]) => `${clock(a)}–${b >= 1440 && b % 1440 === 0 ? '24:00' : clock(b)}`).join(', ');
}

function todayHours(week: WeeklyHours, today: number, closed: string): string {
  return rangesText(week[today], closed);
}

/** The whole week, today in bold. */
function WeekTable({
  week,
  today,
  styles,
  names,
  closed,
}: {
  week: WeeklyHours;
  today: number;
  styles: ReturnType<typeof makeStyles>;
  names: string[];
  closed: string;
}) {
  return (
    <View style={styles.week}>
      {week.map((ranges, day) => (
        <View key={day} style={styles.weekRow}>
          <Text style={[styles.weekDay, day === today && styles.weekToday]}>{names[day]}</Text>
          <Text style={[styles.weekHours, day === today && styles.weekToday]}>
            {rangesText(ranges, closed)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 10,
      paddingBottom: insets.bottom + 20,
      elevation: 12,
      shadowColor: '#000000',
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: -3 },
    },
    handleZone: {
      // A generous touch area round the handle: the visible target is four
      // points tall and nobody hits that with a thumb.
      alignItems: 'center',
      paddingTop: 10,
      marginTop: -10,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      marginBottom: 12,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingHorizontal: 20,
    },
    headerText: {
      flex: 1,
      gap: 3,
    },
    name: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.text,
      letterSpacing: -0.3,
    },
    subtitle: {
      fontSize: 14,
      color: theme.textMuted,
    },
    status: {
      fontSize: 14,
      color: theme.textMuted,
    },
    closeButton: {
      padding: 6,
      borderRadius: 18,
      backgroundColor: theme.surfaceMuted,
    },
    actionsRow: {
      marginTop: 14,
      flexGrow: 0,
    },
    actions: {
      gap: 8,
      paddingHorizontal: 20,
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    actionPrimary: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    pressed: {
      opacity: 0.7,
    },
    actionText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.accent,
    },
    actionTextPrimary: {
      color: theme.onAccent,
    },
    details: {
      marginTop: 12,
      paddingHorizontal: 20,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 16,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    detailBody: {
      flex: 1,
    },
    detailText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      color: theme.text,
    },
    link: {
      color: theme.accent,
    },
    week: {
      gap: 4,
    },
    weekRow: {
      flexDirection: 'row',
    },
    weekDay: {
      width: 92,
      fontSize: 14,
      color: theme.text,
    },
    weekHours: {
      flex: 1,
      fontSize: 14,
      color: theme.text,
    },
    weekToday: {
      fontWeight: '700',
    },
  });
}
