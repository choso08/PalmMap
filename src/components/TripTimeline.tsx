import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { GuideLeg, GuideProgress, RideLeg, TransitGuide } from '../services/transitGuide';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import { formatDistance, formatDuration } from '../utils/format';
import { lineColour, textOn } from '../utils/lineColour';

interface Props {
  guide: TransitGuide;
  /** The first point's name: "My location", or the origin chosen. */
  originName: string;
  /** The last point's name. */
  destinationName: string;
  /** On a trip under way: where one is. Passed steps are faded. */
  progress?: GuideProgress | null;
  arrived?: boolean;
  onPressLeg?: (leg: number) => void;
}

export const MODE_ICONS: Record<string, string> = {
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

/** Enough dots for any walk's row; the rest is clipped. */
const DOTS = Array.from({ length: 40 }, (_, i) => i);

type RailKind = { style: 'solid' | 'dots'; colour: string } | null;

/**
 * A trip as Maps shows its steps: times on the left, a rail in the middle —
 * solid in the line's colour while riding, dotted while walking, a circle at
 * each place one is at — and on the right the places in bold, "Walk 5 min
 * (400 m)", the line's badge with where it goes, the wait at a change, and
 * "12 stops · 25 min", which a tap opens.
 */
export function TripTimeline({
  guide,
  originName,
  destinationName,
  progress = null,
  arrived = false,
  onPressLeg,
}: Props) {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [opened, setOpened] = useState<Set<number>>(() => new Set());
  const g = strings.guide;
  const { legs, trip } = guide;

  const colourOf = (leg: RideLeg) => leg.colour ?? lineColour(leg.kind, leg.line, theme.vehicle);
  const railOf = (leg: GuideLeg | undefined): RailKind =>
    !leg
      ? null
      : leg.type === 'ride'
        ? { style: 'solid', colour: colourOf(leg) }
        : { style: 'dots', colour: theme.textMuted };

  const isDone = (i: number) => arrived || (progress !== null && i < progress.leg);
  const isCurrent = (i: number) => !arrived && progress !== null && i === progress.leg;

  const rail = (kind: RailKind, half?: 'top' | 'bottom') => {
    if (!kind) {
      return null;
    }
    const place = half === 'top' ? styles.railTop : half === 'bottom' ? styles.railBottom : styles.railFull;
    if (kind.style === 'solid') {
      return <View style={[styles.railSolid, place, { backgroundColor: kind.colour }]} />;
    }
    return (
      <View style={[styles.railDots, place]}>
        {DOTS.map((d) => (
          <View key={d} style={[styles.dot, { backgroundColor: kind.colour }]} />
        ))}
      </View>
    );
  };

  /** A row: time, rail, and what is said there. */
  const row = (
    key: string,
    time: string,
    railCell: ReactNode,
    content: ReactNode,
    faded = false,
  ) => (
    <View key={key} style={styles.row}>
      <Text style={[styles.time, faded ? styles.faded : null]}>{time}</Text>
      <View style={styles.railCell}>{railCell}</View>
      <View style={styles.content}>{content}</View>
    </View>
  );

  /** A place between steps: the origin, a stop, a station, the destination. */
  const node = (i: number) => {
    const before = legs[i - 1];
    const after = legs[i];
    const endpoint = i === 0 ? after?.type === 'walk' : !after && before?.type === 'walk';
    let name: string;
    let time: number;
    if (after?.type === 'ride') {
      name = after.stops[0].name;
      time = after.departsAt;
    } else if (i === 0) {
      name = originName;
      time = trip.leaveAt;
    } else if (before?.type === 'ride') {
      name = before.stops[before.stops.length - 1].name;
      time = before.arrivesAt;
    } else {
      name = destinationName;
      time = trip.reachAt;
    }
    if (!after) {
      // The very end: the destination, whatever the last step was.
      name = before?.type === 'ride' ? before.stops[before.stops.length - 1].name : destinationName;
      time = trip.reachAt;
    }
    const ring = (after?.type === 'ride' ? colourOf(after) : null) ??
      (before?.type === 'ride' ? colourOf(before) : theme.text);
    const faded = isDone(i);
    return row(
      `n${i}`,
      clock(time),
      <>
        {rail(railOf(before), 'top')}
        {rail(railOf(after), 'bottom')}
        <View
          style={[
            styles.circle,
            endpoint
              ? { backgroundColor: theme.text, borderColor: theme.text }
              : { backgroundColor: theme.surface, borderColor: ring },
          ]}
        />
      </>,
      <Text style={[styles.place, faded ? styles.faded : null]} numberOfLines={2}>
        {name}
      </Text>,
      faded,
    );
  };

  const walkSegment = (leg: Extract<GuideLeg, { type: 'walk' }>, i: number) => {
    const faded = isDone(i);
    return (
      <Pressable
        key={`l${i}`}
        style={[styles.segment, isCurrent(i) ? styles.current : null]}
        onPress={onPressLeg ? () => onPressLeg(i) : undefined}
        disabled={!onPressLeg}
      >
        {row(
          'w',
          '',
          rail(railOf(leg)),
          <View style={styles.inline}>
            <MaterialCommunityIcons name="walk" size={18} color={theme.textMuted} />
            <Text style={[styles.detail, faded ? styles.faded : null]}>
              {g.walkFor(formatDuration(leg.seconds), formatDistance(leg.meters))}
            </Text>
          </View>,
        )}
      </Pressable>
    );
  };

  const rideSegment = (leg: RideLeg, i: number) => {
    const faded = isDone(i);
    const colour = colourOf(leg);
    const open = opened.has(i);
    // The wait at a change: the time between getting there and the vehicle
    // leaving, after the walk between.
    let wait = 0;
    for (let k = i - 1; k >= 0; k -= 1) {
      const prev = legs[k];
      if (prev.type === 'ride') {
        const walked = legs
          .slice(k + 1, i)
          .reduce((sum, l) => sum + (l.type === 'walk' ? l.seconds : 0), 0);
        wait = leg.departsAt - prev.arrivesAt - walked;
        break;
      }
    }
    const middle = leg.stops.slice(1, -1);
    const passed = isCurrent(i) && progress ? progress.stop : -1;
    return (
      <Pressable
        key={`l${i}`}
        style={[styles.segment, isCurrent(i) ? styles.current : null]}
        onPress={onPressLeg ? () => onPressLeg(i) : undefined}
        disabled={!onPressLeg}
      >
        {row(
          'h',
          '',
          rail(railOf(leg)),
          <View style={styles.rideHead}>
            <View style={styles.inline}>
              <MaterialCommunityIcons
                name={(MODE_ICONS[leg.kind] ?? 'bus') as never}
                size={18}
                color={faded ? theme.textMuted : theme.text}
              />
              <View style={[styles.badge, { backgroundColor: colour }]}>
                <Text style={[styles.badgeText, { color: textOn(colour) }]}>{leg.line}</Text>
              </View>
              {leg.headsign ? (
                <Text style={[styles.headsign, faded ? styles.faded : null]} numberOfLines={1}>
                  → {leg.headsign}
                </Text>
              ) : null}
            </View>
            {leg.live ? (
              <Text style={styles.live}>● {g.realTime}</Text>
            ) : (
              <Text style={styles.detail}>{g.timetable}</Text>
            )}
            {wait >= 60 ? <Text style={styles.detail}>{g.wait(formatDuration(wait))}</Text> : null}
            <Pressable
              style={styles.inline}
              hitSlop={6}
              onPress={() =>
                setOpened((before) => {
                  const next = new Set(before);
                  if (next.has(i)) {
                    next.delete(i);
                  } else {
                    next.add(i);
                  }
                  return next;
                })
              }
            >
              <Text style={styles.detail}>
                {strings.route.stopCount(leg.stops.length - 1)} ·{' '}
                {formatDuration(leg.arrivesAt - leg.departsAt)}
              </Text>
              {middle.length > 0 ? (
                <MaterialCommunityIcons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={theme.textMuted}
                />
              ) : null}
            </Pressable>
          </View>,
        )}
        {open
          ? middle.map((stop, j) =>
              row(
                `s${j}`,
                stop.unix !== null ? clock(stop.unix) : '',
                <>
                  {rail(railOf(leg))}
                  <View style={[styles.smallCircle, { borderColor: colour }]} />
                </>,
                <Text
                  style={[styles.stop, faded || j + 1 <= passed ? styles.faded : null]}
                  numberOfLines={1}
                >
                  {stop.name}
                </Text>,
                faded || j + 1 <= passed,
              ),
            )
          : null}
      </Pressable>
    );
  };

  const out: ReactNode[] = [];
  legs.forEach((leg, i) => {
    // A walk followed by a ride meets it at the stop: one place, not two. A
    // ride followed by a walk, likewise.
    out.push(node(i));
    out.push(leg.type === 'walk' ? walkSegment(leg, i) : rideSegment(leg, i));
  });
  out.push(node(legs.length));

  return <View style={styles.container}>{out}</View>;
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      paddingVertical: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
      minHeight: 26,
    },
    time: {
      width: 44,
      fontSize: 12,
      fontWeight: '600',
      color: theme.text,
      paddingTop: 5,
      fontVariant: ['tabular-nums'],
    },
    railCell: {
      width: 24,
      alignItems: 'center',
    },
    railFull: {
      top: 0,
      bottom: 0,
    },
    railTop: {
      top: 0,
      height: '50%',
    },
    railBottom: {
      top: '50%',
      bottom: 0,
    },
    railSolid: {
      position: 'absolute',
      width: 6,
      borderRadius: 3,
    },
    railDots: {
      position: 'absolute',
      width: 6,
      overflow: 'hidden',
      alignItems: 'center',
      paddingTop: 2,
    },
    dot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      marginBottom: 4,
    },
    circle: {
      position: 'absolute',
      top: '50%',
      marginTop: -8,
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 3,
    },
    smallCircle: {
      position: 'absolute',
      top: '50%',
      marginTop: -5,
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 2,
      backgroundColor: theme.surface,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingVertical: 4,
      paddingLeft: 8,
    },
    place: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
    },
    stop: {
      fontSize: 13,
      color: theme.text,
    },
    segment: {
      borderRadius: 12,
    },
    current: {
      backgroundColor: theme.surfaceMuted,
    },
    rideHead: {
      gap: 3,
      paddingVertical: 6,
    },
    inline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    badge: {
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 2,
      minWidth: 30,
      alignItems: 'center',
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    headsign: {
      flex: 1,
      fontSize: 13,
      color: theme.text,
    },
    detail: {
      fontSize: 12,
      color: theme.textMuted,
    },
    live: {
      fontSize: 12,
      color: theme.open,
      fontWeight: '600',
    },
    faded: {
      color: theme.textMuted,
    },
  });
}
