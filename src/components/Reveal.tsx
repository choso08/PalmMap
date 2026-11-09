import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface RevealProps {
  children: ReactNode;
  /**
   * Whether the content should be visible.
   *
   * When it turns false, the content **does not vanish at once**: it fades and
   * only then leaves the screen. It is what separates an app that feels
   * finished from one where things flicker.
   */
  visible?: boolean;
  /** How many points it rises when appearing. Negative makes it come down. */
  from?: number;
  style?: StyleProp<ViewStyle>;
  /** Its size, for the floating buttons that must sit above it. */
  onLayout?: (event: LayoutChangeEvent) => void;
}

/** How long it takes to appear. Short on purpose: this is a maps app, not a
 * presentation — a slow animation holds up someone who wants the map. */
const IN_MS = 240;
const OUT_MS = 160;

/**
 * Makes content appear rising and fading in, instead of popping up.
 *
 * Uses React Native's `Animated` with `useNativeDriver`, so the animation runs
 * on the native side and does not stutter while JavaScript is busy — which is
 * exactly when this appears, right after a response from the Internet.
 */
export function Reveal({ children, visible = true, from = 22, style, onLayout }: RevealProps) {
  const progress = useRef(new Animated.Value(0)).current;
  /** Stays mounted while leaving the screen, otherwise there is nothing to animate. */
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: OUT_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [visible, progress]);

  if (!mounted) {
    return null;
  }

  return (
    <Animated.View
      // `box-none`: the wrapper never catches touches, only what is inside it.
      // It is what lets the map underneath be tapped when the panel has been
      // shrunk — this element's box stays where it was, but lets them through.
      //
      // While fading out it catches nothing; without this, it caught touches
      // no longer meant for it.
      pointerEvents={visible ? 'box-none' : 'none'}
      onLayout={onLayout}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [from, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
