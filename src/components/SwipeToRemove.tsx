import { useMemo, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { useTheme } from '../settings';

interface Props {
  children: ReactNode;
  onRemove: () => void;
}

/** How far the row must travel, sideways, to count as "remove". */
const REMOVE_AT_PX = 110;

/**
 * A row that is removed by sliding it sideways, either way — as recent
 * searches are in Google Maps (author's request, November 2026).
 *
 * Only a clearly sideways drag is taken (`dx` well over `dy`), so scrolling the
 * list up and down and tapping the row work as before. Short of the threshold
 * the row springs back; past it, it slides out and `onRemove` runs.
 */
export function SwipeToRemove({ children, onRemove }: Props) {
  const theme = useTheme();
  const dx = useRef(new Animated.Value(0)).current;
  const removeRef = useRef(onRemove);
  removeRef.current = onRemove;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderMove: (_, g) => dx.setValue(g.dx),
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dx) >= REMOVE_AT_PX) {
            Animated.timing(dx, {
              toValue: Math.sign(g.dx) * 500,
              duration: 160,
              useNativeDriver: true,
            }).start(() => removeRef.current());
          } else {
            Animated.spring(dx, { toValue: 0, useNativeDriver: true }).start();
          }
        },
        onPanResponderTerminate: () =>
          Animated.spring(dx, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [dx],
  );

  return (
    <View>
      {/* What shows behind the row as it slides: a bin, on both sides. */}
      <View style={[StyleSheet.absoluteFill, styles.behind, { backgroundColor: theme.danger }]}>
        <MaterialCommunityIcons name="delete-outline" size={20} color={theme.onAccent} />
        <MaterialCommunityIcons name="delete-outline" size={20} color={theme.onAccent} />
      </View>
      <Animated.View
        style={{ transform: [{ translateX: dx }], backgroundColor: theme.surface }}
        {...responder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  behind: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
});
