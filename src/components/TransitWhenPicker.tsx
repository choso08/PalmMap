import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TransitWhen } from '../services/transitPlan';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

interface Props {
  when: TransitWhen;
  onChange: (when: TransitWhen) => void;
}

const STEP_S = 5 * 60;
const DAY_S = 24 * 3600;

function clock(unix: number): string {
  const d = new Date(unix * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Whole days from today to that moment's day, in the phone's time zone. */
function dayOffset(unix: number): number {
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  const b = new Date(unix * 1000);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / (DAY_S * 1000));
}

/** Now, rounded up to the next five minutes. */
function soon(): number {
  return Math.ceil(Date.now() / 1000 / STEP_S) * STEP_S;
}

/**
 * "Leave now" and its choices, as under the trips in Maps (author's request,
 * November 2026): leave now, depart at a time, or arrive by one. The time
 * moves in steps of five minutes and an hour, and the day forward and back —
 * no native picker, so no new library.
 */
export function TransitWhenPicker({ when, onChange }: Props) {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [open, setOpen] = useState(false);
  const w = strings.when;

  const dayLabel = (unix: number) => {
    const off = dayOffset(unix);
    if (off === 0) {
      return '';
    }
    if (off === 1) {
      return w.tomorrow;
    }
    const d = new Date(unix * 1000);
    return ` (${d.getDate()}/${d.getMonth() + 1})`;
  };
  const label =
    when.kind === 'now'
      ? w.now
      : when.kind === 'depart'
        ? w.departAt(clock(when.at), dayLabel(when.at))
        : w.arriveBy(clock(when.at), dayLabel(when.at));

  const at = when.kind === 'now' ? soon() : when.at;
  const move = (seconds: number) => {
    if (when.kind === 'now') {
      return;
    }
    // Never into the past: the timetables answer from now on.
    onChange({ kind: when.kind, at: Math.max(soon(), when.at + seconds) });
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.row} onPress={() => setOpen((o) => !o)} hitSlop={6}>
        <MaterialCommunityIcons name="clock-outline" size={18} color={theme.accent} />
        <Text style={styles.label}>{label}</Text>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.textMuted}
        />
      </Pressable>

      {open ? (
        <View style={styles.editor}>
          <View style={styles.tabs}>
            {(['now', 'depart', 'arrive'] as const).map((kind) => (
              <Pressable
                key={kind}
                style={[styles.tab, when.kind === kind && styles.tabOn]}
                onPress={() => onChange(kind === 'now' ? { kind } : { kind, at })}
              >
                <Text style={[styles.tabText, when.kind === kind && styles.tabTextOn]}>
                  {kind === 'now' ? w.tabNow : kind === 'depart' ? w.tabDepart : w.tabArrive}
                </Text>
              </Pressable>
            ))}
          </View>

          {when.kind !== 'now' ? (
            <View style={styles.time}>
              <Step icon="chevron-double-left" onPress={() => move(-DAY_S)} styles={styles} theme={theme} />
              <Step icon="minus" onPress={() => move(-3600)} styles={styles} theme={theme} small="h" />
              <Step icon="minus" onPress={() => move(-STEP_S)} styles={styles} theme={theme} small="5" />
              <View style={styles.timeText}>
                <Text style={styles.big}>{clock(when.at)}</Text>
                <Text style={styles.day}>{dayLabel(when.at).replace(/[()]/g, '').trim()}</Text>
              </View>
              <Step icon="plus" onPress={() => move(STEP_S)} styles={styles} theme={theme} small="5" />
              <Step icon="plus" onPress={() => move(3600)} styles={styles} theme={theme} small="h" />
              <Step icon="chevron-double-right" onPress={() => move(DAY_S)} styles={styles} theme={theme} />
            </View>
          ) : null}

          <Pressable style={styles.done} onPress={() => setOpen(false)}>
            <Text style={styles.doneText}>{w.done}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Step({
  icon,
  onPress,
  styles,
  theme,
  small,
}: {
  icon: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  theme: Theme;
  small?: string;
}) {
  return (
    <Pressable style={styles.step} onPress={onPress} hitSlop={4}>
      <MaterialCommunityIcons name={icon as never} size={16} color={theme.text} />
      {small ? <Text style={styles.stepSmall}>{small}</Text> : null}
    </Pressable>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      marginTop: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
    },
    label: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
    },
    editor: {
      backgroundColor: theme.surfaceMuted,
      borderRadius: 14,
      padding: 10,
      gap: 10,
    },
    tabs: {
      flexDirection: 'row',
      gap: 6,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: theme.surface,
    },
    tabOn: {
      backgroundColor: theme.accent,
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
    },
    tabTextOn: {
      color: theme.onAccent,
    },
    time: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    step: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepSmall: {
      position: 'absolute',
      bottom: 1,
      fontSize: 8,
      color: theme.textMuted,
    },
    timeText: {
      alignItems: 'center',
      minWidth: 70,
    },
    big: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.text,
      fontVariant: ['tabular-nums'],
    },
    day: {
      fontSize: 11,
      color: theme.textMuted,
    },
    done: {
      alignSelf: 'flex-end',
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    doneText: {
      color: theme.accent,
      fontWeight: '700',
      fontSize: 14,
    },
  });
}
