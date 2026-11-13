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

import { MODE_ICONS, TripTimeline } from './TripTimeline';
import type { GuideProgress, TransitGuide } from '../services/transitGuide';
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
  voiceOn: boolean;
  onToggleVoice: () => void;
  /** The last place's name in the steps. */
  destinationName: string;
}

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
  voiceOn,
  onToggleVoice,
  destinationName,
}: Props) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const now = useNow();

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
          <TripTimeline
            guide={guide}
            originName={strings.directions.myLocation}
            destinationName={destinationName}
            progress={progress}
            arrived={arrived}
            onPressLeg={onChooseStep}
          />
        </ScrollView>
      ) : null}

      {/*
        The same footer as driving navigation: end on the left, the time left in
        the middle, the speaker on the right — not next to the end button, where
        a tap meant for the sound could end the trip (author's report).
      */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.round, styles.end, pressed && styles.pressed]}
          onPress={onEnd}
          hitSlop={6}
          accessibilityLabel={g.end}
        >
          <MaterialCommunityIcons name="close" size={24} color={theme.onAccent} />
        </Pressable>
        <View style={styles.footerTexts}>
          {guide ? (
            <>
              <Text style={styles.remaining}>
                {formatDuration(Math.max(0, guide.trip.reachAt - now))}
              </Text>
              <Text style={styles.footerDetail}>{g.arriveAt(clock(guide.trip.reachAt))}</Text>
            </>
          ) : null}
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.round,
            voiceOn ? styles.voice : styles.voiceOff,
            pressed && styles.pressed,
          ]}
          onPress={onToggleVoice}
          hitSlop={6}
          accessibilityLabel={voiceOn ? strings.navigation.muteVoice : strings.navigation.unmuteVoice}
        >
          <MaterialCommunityIcons
            name={voiceOn ? 'volume-high' : 'volume-off'}
            size={24}
            color={voiceOn ? theme.text : theme.danger}
          />
        </Pressable>
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
      maxHeight: 320,
      marginTop: 10,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 12,
    },
    round: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
    },
    end: {
      backgroundColor: theme.danger,
    },
    voice: {
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
    },
    voiceOff: {
      backgroundColor: theme.background,
      borderWidth: 1.5,
      borderColor: theme.danger,
    },
    pressed: {
      opacity: 0.7,
    },
    footerTexts: {
      flex: 1,
      alignItems: 'center',
    },
    remaining: {
      fontSize: 24,
      fontWeight: '800',
      color: theme.open,
      letterSpacing: -0.5,
    },
    footerDetail: {
      fontSize: 14,
      color: theme.textMuted,
      marginTop: 2,
    },
  });
}
