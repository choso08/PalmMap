import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { type EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TransitWhen } from '../services/transitPlan';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

interface Props {
  when: TransitWhen;
  onChange: (when: TransitWhen) => void;
}

const STEP_MIN = 5;
const DAYS = 7;
/** One row of the time wheels. */
const ITEM_H = 44;
/** Rows seen in a wheel; the middle one is the chosen. */
const VISIBLE = 5;

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 / STEP_MIN }, (_, i) => i * STEP_MIN);

const pad = (n: number) => String(n).padStart(2, '0');

function clock(unix: number): string {
  const d = new Date(unix * 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Midnight of the day `offset` days from today, in the phone's time zone. */
function midnight(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

/** Whole days from today to that moment's day. */
function dayOffset(unix: number): number {
  const b = new Date(unix * 1000);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - midnight(0).getTime()) / 86400000);
}

/** Now, rounded up to the next five minutes, in seconds. */
function soon(): number {
  const step = STEP_MIN * 60;
  return Math.ceil(Date.now() / 1000 / step) * step;
}

/**
 * "Leave now" and its choices, as Maps has them (author's request, November
 * 2026). In the route panel only a chip; tapping it opens a sheet of its own —
 * now / depart at / arrive by, the day, and two wheels for hour and minutes —
 * and **nothing is planned until "Set"**. The first version replanned at every
 * tap of +5 min: the trips reloaded, the panel shrank and grew under the
 * finger, and the buttons jumped away (author's report).
 */
export function TransitWhenPicker({ when, onChange }: Props) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const w = strings.when;
  const [open, setOpen] = useState(false);

  // The draft, changed freely while the sheet is open.
  const [kind, setKind] = useState<TransitWhen['kind']>(when.kind);
  const [day, setDay] = useState(0);
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);

  const openSheet = () => {
    const at = when.kind === 'now' ? soon() : when.at;
    const d = new Date(at * 1000);
    setKind(when.kind === 'now' ? 'depart' : when.kind);
    setDay(Math.max(0, Math.min(DAYS - 1, dayOffset(at))));
    setHour(d.getHours());
    setMinute(Math.floor(d.getMinutes() / STEP_MIN) * STEP_MIN);
    setOpen(true);
  };

  const apply = (chosen: TransitWhen['kind']) => {
    setOpen(false);
    if (chosen === 'now') {
      if (when.kind !== 'now') {
        onChange({ kind: 'now' });
      }
      return;
    }
    const d = midnight(day);
    d.setHours(hour, minute, 0, 0);
    // Never into the past: the timetables answer from now on.
    const at = Math.max(soon(), Math.round(d.getTime() / 1000));
    if (when.kind !== chosen || when.at !== at) {
      onChange({ kind: chosen, at });
    }
  };

  const dayName = (offset: number) => {
    if (offset === 0) {
      return w.today;
    }
    if (offset === 1) {
      return w.tomorrowShort;
    }
    const d = midnight(offset);
    return `${strings.place.weekdaysShort[(d.getDay() + 6) % 7]} ${d.getDate()}`;
  };

  const suffix = (unix: number) => {
    const off = dayOffset(unix);
    return off === 0 ? '' : ` · ${dayName(off)}`;
  };
  const label =
    when.kind === 'now'
      ? w.now
      : when.kind === 'depart'
        ? w.departAt(clock(when.at), suffix(when.at))
        : w.arriveBy(clock(when.at), suffix(when.at));

  return (
    <>
      <Pressable style={styles.chip} onPress={openSheet} hitSlop={6}>
        <MaterialCommunityIcons name="clock-outline" size={17} color={theme.accent} />
        <Text style={styles.chipText}>{label}</Text>
        <MaterialCommunityIcons name="menu-down" size={20} color={theme.textMuted} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.tabs}>
            {(['now', 'depart', 'arrive'] as const).map((k) => (
              <Pressable
                key={k}
                style={[styles.tab, kind === k && styles.tabOn]}
                onPress={() => setKind(k)}
              >
                <Text style={[styles.tabText, kind === k && styles.tabTextOn]}>
                  {k === 'now' ? w.tabNow : k === 'depart' ? w.tabDepart : w.tabArrive}
                </Text>
              </Pressable>
            ))}
          </View>

          {kind !== 'now' ? (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.days}
              >
                {Array.from({ length: DAYS }, (_, i) => (
                  <Pressable
                    key={i}
                    style={[styles.dayChip, day === i && styles.dayChipOn]}
                    onPress={() => setDay(i)}
                  >
                    <Text style={[styles.dayText, day === i && styles.dayTextOn]}>
                      {dayName(i)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.wheels}>
                <View style={styles.band} pointerEvents="none" />
                <Wheel
                  values={HOURS}
                  value={hour}
                  onChange={setHour}
                  styles={styles}
                />
                <Text style={styles.colon}>:</Text>
                <Wheel
                  values={MINUTES}
                  value={minute}
                  onChange={setMinute}
                  styles={styles}
                />
              </View>
            </>
          ) : (
            <Text style={styles.nowHint}>{w.nowHint}</Text>
          )}

          <View style={styles.buttons}>
            <Pressable style={styles.cancel} onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>{w.cancel}</Text>
            </Pressable>
            <Pressable style={styles.set} onPress={() => apply(kind)}>
              <Text style={styles.setText}>{w.set}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

/**
 * A column of numbers that snaps to one row; the row in the middle is the
 * value. A tap on a row also chooses it.
 */
function Wheel({
  values,
  value,
  onChange,
  styles,
}: {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const ref = useRef<ScrollView>(null);
  const index = Math.max(0, values.indexOf(value));

  // Placed on the value when it appears (no animation: it is where it was).
  useEffect(() => {
    const timer = setTimeout(() => ref.current?.scrollTo({ y: index * ITEM_H, animated: false }), 0);
    return () => clearTimeout(timer);
    // Only on mount: afterwards the wheel is what moves the value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const v = values[Math.max(0, Math.min(values.length - 1, i))];
    if (v !== value) {
      onChange(v);
    }
  };

  return (
    <ScrollView
      ref={ref}
      style={styles.wheel}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      nestedScrollEnabled
      onMomentumScrollEnd={settle}
      onScrollEndDrag={(e) => {
        // A drag that stops dead fires no momentum end.
        if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) {
          settle(e);
        }
      }}
      contentContainerStyle={{ paddingVertical: ((VISIBLE - 1) / 2) * ITEM_H }}
    >
      {values.map((v, i) => (
        <Pressable
          key={v}
          style={styles.wheelItem}
          onPress={() => {
            ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
            onChange(v);
          }}
        >
          <Text style={[styles.wheelText, v === value && styles.wheelTextOn]}>{pad(v)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      marginTop: 10,
      paddingLeft: 10,
      paddingRight: 6,
      paddingVertical: 6,
      borderRadius: 18,
      backgroundColor: theme.surfaceMuted,
    },
    chipText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: insets.bottom + 16,
      gap: 16,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
    },
    tabs: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceMuted,
      borderRadius: 12,
      padding: 3,
    },
    tab: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 10,
      alignItems: 'center',
    },
    tabOn: {
      backgroundColor: theme.surface,
      elevation: 2,
      shadowColor: '#000000',
      shadowOpacity: 0.12,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.textMuted,
    },
    tabTextOn: {
      color: theme.accent,
    },
    days: {
      gap: 8,
    },
    dayChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    dayChipOn: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    dayText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
    },
    dayTextOn: {
      color: theme.onAccent,
    },
    wheels: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      height: ITEM_H * VISIBLE,
    },
    band: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: ((VISIBLE - 1) / 2) * ITEM_H,
      height: ITEM_H,
      borderRadius: 12,
      backgroundColor: theme.surfaceMuted,
    },
    wheel: {
      width: 80,
      height: ITEM_H * VISIBLE,
    },
    wheelItem: {
      height: ITEM_H,
      alignItems: 'center',
      justifyContent: 'center',
    },
    wheelText: {
      fontSize: 20,
      color: theme.textMuted,
      fontVariant: ['tabular-nums'],
    },
    wheelTextOn: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.text,
    },
    colon: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.text,
      marginHorizontal: 4,
    },
    nowHint: {
      fontSize: 14,
      color: theme.textMuted,
      textAlign: 'center',
      paddingVertical: 12,
    },
    buttons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
    },
    cancel: {
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 22,
    },
    cancelText: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.accent,
    },
    set: {
      paddingHorizontal: 24,
      paddingVertical: 11,
      borderRadius: 22,
      backgroundColor: theme.accent,
    },
    setText: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.onAccent,
    },
  });
}
