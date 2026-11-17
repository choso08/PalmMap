import { useMemo, useRef } from 'react';
import { Animated, PanResponder, type GestureResponderHandlers } from 'react-native';

/** How far down, in points, a pull must go to close. */
const CLOSE_AT = 90;
/** Or how fast (points per millisecond). */
const CLOSE_FLICK = 0.6;
/** How far a finger moves before it is a pull, not a tap. */
const PULL_MIN = 10;

/**
 * Pull a screen down by its header to close it (author's request, November
 * 2026: "it should work on every panel"). The bottom panels shrink when
 * pulled (`DraggableSheet`); the screens that open over the map — layers,
 * Saved, Transit, alerts, Directions, Settings, steps — close.
 *
 * The header's buttons keep their taps: nothing is claimed at the start of a
 * touch, only a clearly downward move takes over. The screen follows the
 * finger, and springs back when let go short of `CLOSE_AT`.
 */
export function useSwipeToClose(
  onClose: () => void,
  visible: boolean,
): { headerHandlers: GestureResponderHandlers; sheetStyle: { transform: { translateY: Animated.Value }[] } } {
  const translateY = useRef(new Animated.Value(0)).current;
  const close = useRef(onClose);
  close.current = onClose;

  // Opened again: from where it belongs, not from where it was let go. Done
  // while rendering, before the screen's first frame — an effect runs after
  // it, and the screen showed for a moment as low as it was let go.
  const wasVisible = useRef(visible);
  if (visible && !wasVisible.current) {
    translateY.setValue(0);
  }
  wasVisible.current = visible;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => g.dy > PULL_MIN && g.dy > Math.abs(g.dx) * 1.5,
        onPanResponderMove: (_, g) => translateY.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > CLOSE_AT || g.vy > CLOSE_FLICK) {
            close.current();
            return;
          }
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 2 }).start();
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () =>
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 2 }).start(),
      }),
    [translateY],
  );

  return { headerHandlers: responder.panHandlers, sheetStyle: { transform: [{ translateY }] } };
}
