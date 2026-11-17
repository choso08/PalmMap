import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text } from 'react-native';

import { useOnline } from '../services/network';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

/** How long either line stays (author's request: five seconds). */
const SHOWN_MS = 5000;
/** How far a swipe must go, sideways or up, to put it away. */
const SWIPE_AWAY = 50;

/**
 * Says when the phone goes offline, and when it comes back, as Maps does
 * (author's request, November 2026). Offline the app does not stop: it uses
 * the downloaded maps, doors and timetables — the line says so, so that a
 * missing live bus reads as "no network", not as a fault.
 *
 * Both lines go away by themselves after `SHOWN_MS`, or at once with a swipe
 * sideways or up (author's request: it used to stay as long as there was no
 * network, covering the map).
 */
export function ConnectivityBanner() {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const online = useOnline();
  const [shown, setShown] = useState<'off' | 'on' | null>(null);
  const seenOffline = useRef(false);
  const dx = useRef(new Animated.Value(0)).current;
  const dy = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!online) {
      seenOffline.current = true;
      setShown('off');
    } else if (seenOffline.current) {
      seenOffline.current = false;
      setShown('on');
    } else {
      return;
    }
    dx.setValue(0);
    dy.setValue(0);
    const timer = setTimeout(() => setShown(null), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [online, dx, dy]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 || g.dy < -6,
        onPanResponderMove: (_e, g) => {
          dx.setValue(g.dx);
          dy.setValue(Math.min(0, g.dy));
        },
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) > SWIPE_AWAY || g.dy < -SWIPE_AWAY) {
            Animated.timing(Math.abs(g.dx) > SWIPE_AWAY ? dx : dy, {
              toValue: Math.abs(g.dx) > SWIPE_AWAY ? Math.sign(g.dx) * 500 : -200,
              duration: 180,
              useNativeDriver: true,
            }).start(() => setShown(null));
          } else {
            Animated.parallel([
              Animated.spring(dx, { toValue: 0, useNativeDriver: true }),
              Animated.spring(dy, { toValue: 0, useNativeDriver: true }),
            ]).start();
          }
        },
      }),
    [dx, dy],
  );

  if (!shown) {
    return null;
  }
  const on = shown === 'on';
  return (
    <Animated.View
      {...pan.panHandlers}
      style={[
        styles.pill,
        on ? styles.on : styles.off,
        { transform: [{ translateX: dx }, { translateY: dy }] },
      ]}
    >
      <MaterialCommunityIcons name={on ? 'wifi' : 'wifi-off'} size={16} color={theme.onOverlay} />
      <Text style={styles.text} numberOfLines={2}>
        {on ? strings.network.backOnline : strings.network.offline}
      </Text>
    </Animated.View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      gap: 8,
      marginTop: 8,
      marginHorizontal: 16,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 18,
      elevation: 4,
    },
    off: {
      backgroundColor: theme.overlay,
    },
    on: {
      backgroundColor: theme.open,
    },
    text: {
      flexShrink: 1,
      fontSize: 13,
      fontWeight: '600',
      color: theme.onOverlay,
    },
  });
}
