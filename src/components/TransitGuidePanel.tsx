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

import { LineJourney } from './LineJourney';
import type { GuideLeg, GuideProgress, RideLeg, TransitGuide } from '../services/transitGuide';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import { formatDistance, formatDuration } from '../utils/format';

interface Props {
  dragHandlers?: GestureResponderHandlers;
  /** Null while the steps are being prepared. */
  guide: TransitGuide | null;
  progress: GuideProgress;
  arrived: boolean;
  /** A step tapped in the list becomes the current one — the way back. */
  onChooseStep: (leg: number) => void;
  onEnd: () => void;
}

const MODE_ICONS: Record<string, string> = {
  bus: 'bus',
  train: 'train',
  subway: 'subway-variant',
  light_rail: 'tram',
  boat: 'ferry',
};

function clock(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The clock, once every half minute, for "leaves in 4 min". */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * A public transport trip under way, as Maps shows one after "Start": the step
 * one is on in big type at the top — walk to the stop, take the line, get off
 * in N stops — and every step underneath, with the rides' stops folded. It
 * follows the GPS by itself (`guideProgress`, in `App.tsx`); a tap on a step
 * makes it the current one.
 */
export function TransitGuidePanel({
  dragHandlers,
  guide,
  progress,
  arrived,
  onChooseStep,
  onEnd,
}: Props) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const now = useNow();
  const [opened, setOpened] = useState<number | null>(null);

  const g = strings.guide;

  /** The big line at the top, and the one under it. */
  const headline = (): { icon: string; title: string; detail: string } => {
    if (!guide) {
      return { icon: 'bus-clock', title: g.preparing, detail: '' };
    }
    if (arrived) {
      return { icon: 'flag-checkered', title: g.arrived, detail: '' };
    }
    const step = guide.legs[progress.leg];
    if (step.type === 'walk') {
      return {
        icon: 'walk',
        title: step.toName ? g.walkTo(step.toName) : g.walkToDestination,
        detail: `${formatDistance(step.meters)} · ${formatDuration(step.seconds)}`,
      };
    }
    const icon = MODE_ICONS[step.kind] ?? 'bus';
    if (progress.stop === 0) {
      const wait = step.departsAt - now;
      return {
        icon,
        title: g.board(step.line, step.headsign),
        detail:
          wait > 60
            ? g.leavesAt(clock(step.departsAt), formatDuration(wait))
            : g.leavingNow(clock(step.departsAt)),
      };
    }
    const last = step.stops[step.stops.length - 1];
    const left = step.stops.length - 1 - progress.stop;
    return {
      icon,
      title: left <= 1 ? g.getOffNext(last.name) : g.getOffAt(last.name),
      detail: g.stopsLeft(left, clock(step.arrivesAt)),
    };
  };
  const top = headline();

  const rideJourney = (leg: RideLeg) => ({
    line: leg.line,
    headsign: leg.headsign,
    colour: null,
    stops: leg.stops.map((s) => ({
      id: s.id,
      name: s.name,
      coordinates: s.coordinates,
      time: s.unix !== null ? clock(s.unix) : null,
    })),
    alightIndex: leg.stops.length - 1,
  });

  const stepRow = (leg: GuideLeg, i: number) => {
    const current = !arrived && i === progress.leg;
    const done = arrived || i < progress.leg;
    const isRide = leg.type === 'ride';
    return (
      <View key={i}>
        <Pressable
          style={[styles.step, current ? styles.stepCurrent : null]}
          onPress={() => {
            onChooseStep(i);
            setOpened(isRide && opened !== i ? i : null);
          }}
        >
          <Text style={[styles.stepTime, done ? styles.done : null]}>
            {isRide ? clock(leg.departsAt) : ''}
          </Text>
          <MaterialCommunityIcons
            name={(isRide ? (MODE_ICONS[leg.kind] ?? 'bus') : 'walk') as never}
            size={20}
            color={done ? theme.textMuted : current ? theme.accent : theme.text}
          />
          {isRide ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{leg.line}</Text>
            </View>
          ) : null}
          <View style={styles.stepTexts}>
            <Text style={[styles.stepTitle, done ? styles.done : null]} numberOfLines={2}>
              {isRide
                ? leg.headsign || leg.stops[leg.stops.length - 1].name
                : leg.toName
                  ? g.walkTo(leg.toName)
                  : g.walkToDestination}
            </Text>
            <Text style={styles.stepDetail} numberOfLines={1}>
              {isRide
                ? `${strings.route.stopCount(leg.stops.length - 1)} · ${formatDuration(
                    leg.arrivesAt - leg.departsAt,
                  )}${leg.live ? '' : ` · ${g.timetable}`}`
                : `${formatDistance(leg.meters)} · ${formatDuration(leg.seconds)}`}
            </Text>
          </View>
          {isRide ? (
            <MaterialCommunityIcons
              name={opened === i ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.textMuted}
            />
          ) : null}
        </Pressable>
        {isRide && opened === i ? (
          <View style={styles.journey}>
            <LineJourney journey={rideJourney(leg)} loading={false} error={null} />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.handleZone} {...dragHandlers}>
        <View style={styles.handle} />
      </View>

      <View style={styles.banner}>
        {guide ? (
          <MaterialCommunityIcons name={top.icon as never} size={30} color={theme.onAccent} />
        ) : (
          <ActivityIndicator color={theme.onAccent} />
        )}
        <View style={styles.bannerTexts}>
          <Text style={styles.bannerTitle} numberOfLines={2}>
            {top.title}
          </Text>
          {top.detail ? <Text style={styles.bannerDetail}>{top.detail}</Text> : null}
        </View>
      </View>

      {guide ? (
        <ScrollView style={styles.list} nestedScrollEnabled>
          {guide.legs.map(stepRow)}
        </ScrollView>
      ) : null}

      <View style={styles.footer}>
        <Pressable style={styles.end} onPress={onEnd} hitSlop={8}>
          <MaterialCommunityIcons name="close" size={22} color={theme.onAccent} />
        </Pressable>
        <View style={styles.footerTexts}>
          {guide ? (
            <>
              <Text style={styles.arrival}>
                {g.arriveAt(clock(guide.trip.reachAt))}
              </Text>
              <Text style={styles.footerDetail}>
                {formatDuration(Math.max(0, guide.trip.reachAt - now))}
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: insets.bottom + 14,
      elevation: 12,
      shadowColor: '#000000',
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: -3 },
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
      marginBottom: 12,
    },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.accent,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    bannerTexts: {
      flex: 1,
    },
    bannerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.onAccent,
    },
    bannerDetail: {
      fontSize: 13,
      color: theme.onAccent,
      marginTop: 2,
    },
    list: {
      maxHeight: 260,
      marginTop: 10,
    },
    step: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderRadius: 12,
    },
    stepCurrent: {
      backgroundColor: theme.surfaceMuted,
    },
    stepTime: {
      width: 42,
      fontSize: 12,
      fontWeight: '600',
      color: theme.text,
      fontVariant: ['tabular-nums'],
    },
    done: {
      color: theme.textMuted,
    },
    badge: {
      backgroundColor: theme.vehicle,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    badgeText: {
      color: theme.onOverlay,
      fontSize: 12,
      fontWeight: '700',
    },
    stepTexts: {
      flex: 1,
    },
    stepTitle: {
      fontSize: 14,
      color: theme.text,
      fontWeight: '600',
    },
    stepDetail: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 1,
    },
    journey: {
      paddingLeft: 6,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 10,
    },
    end: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerTexts: {
      flex: 1,
    },
    arrival: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.open,
    },
    footerDetail: {
      fontSize: 13,
      color: theme.textMuted,
    },
  });
}
