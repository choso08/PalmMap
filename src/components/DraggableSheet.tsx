import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  type GestureResponderHandlers,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface DraggableSheetProps {
  /**
   * The panel's content.
   *
   * It receives the gesture handlers to put on the little bar at the top. It
   * is a function and not an element because only the panel knows where its
   * bar is — and the gesture must stay **only** there: if it caught the whole
   * panel, dragging a list inside it pulled the panel down instead of
   * scrolling the list.
   */
  children: (dragHandlers: GestureResponderHandlers) => ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * How much of the panel stays visible when shrunk.
   *
   * Enough for the title and the close button — enough to know what is open
   * and to be able to pull it back up.
   */
  peek?: number;
}

/** Distance below which it counts as a tap and not a drag. */
const TAP_MAX = 5;

/** Speed above which the flick matters more than the position. */
const FLICK = 0.5;

/**
 * Lets a bottom panel be dragged down to shrink it.
 *
 * Same purpose as in other maps apps: see the map without losing what is open.
 * Pull the little bar down and the panel shrinks until only the title shows;
 * pull it up and it comes back. A single tap on the bar does the same, for
 * anyone who would rather not drag.
 *
 * The animation runs on the native side (`useNativeDriver`), so it stays smooth
 * even when JavaScript is busy — which is exactly what happens while
 * navigating.
 */
export function DraggableSheet({ children, style, peek = 104 }: DraggableSheetProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const [height, setHeight] = useState(0);

  /** Where the panel rests: 0 open, `maxDown` shrunk. */
  const base = useRef(0);
  const maxDown = Math.max(0, height - peek);

  // If the content shrinks while the panel is down, the place it rested at no
  // longer exists. Without this an empty strip was left at the bottom.
  useEffect(() => {
    if (base.current > maxDown) {
      base.current = maxDown;
      translateY.setValue(maxDown);
    }
  }, [maxDown, translateY]);

  const responder = useMemo(() => {
    const settle = (target: number) => {
      base.current = target;
      Animated.spring(translateY, {
        toValue: target,
        useNativeDriver: true,
        speed: 18,
        bounciness: 2,
      }).start();
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 3,
      onPanResponderMove: (_, gesture) => {
        // Held between the two ends: never above open, never below what was
        // chosen to stay visible.
        translateY.setValue(Math.min(Math.max(base.current + gesture.dy, 0), maxDown));
      },
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dy) < TAP_MAX) {
          // It was a tap: toggle between open and shrunk.
          settle(base.current > 0 ? 0 : maxDown);
          return;
        }

        const at = Math.min(Math.max(base.current + gesture.dy, 0), maxDown);

        // Speed wins over position: a firm flick down shrinks it even if the
        // finger is only halfway, which is what a quick gesture means.
        if (gesture.vy > FLICK) {
          settle(maxDown);
        } else if (gesture.vy < -FLICK) {
          settle(0);
        } else {
          settle(at > maxDown / 2 ? maxDown : 0);
        }
      },
      onPanResponderTerminate: () => settle(base.current),
    });
  }, [maxDown, translateY]);

  return (
    <Animated.View
      style={[style, { transform: [{ translateY }] }]}
      onLayout={(event) => {
        const measured = event.nativeEvent.layout.height;
        setHeight((current) => (Math.abs(measured - current) > 1 ? measured : current));
      }}
    >
      {children(responder.panHandlers)}
    </Animated.View>
  );
}
