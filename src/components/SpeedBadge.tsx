import { StyleSheet, Text, View } from 'react-native';

import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

interface SpeedBadgeProps {
  /**
   * The speed in km/h, or `null` when it is not known.
   *
   * `null` really is "don't know", not "stopped": the speedometer disappears
   * instead of showing zero. In a tunnel, showing zero to someone doing 100
   * would be worse than showing nothing.
   */
  kmh: number | null;
  /** Going over the known limit. Paints the number red. */
  overLimit?: boolean;
  /** Where it sits, in points from the bottom edge of the screen. */
  bottom: number;
}

/**
 * The speedometer.
 *
 * It lives on its own because it appears in **two places**: inside the
 * navigation screen and over the map while driving without navigating. Two
 * copies of the same drawing would end up drifting apart — and what would
 * drift is the alignment, which is what shows while driving.
 */
export function SpeedBadge({ kmh, overLimit = false, bottom }: SpeedBadgeProps) {
  const theme = useTheme();
  const strings = useT();

  if (kmh === null) {
    return null;
  }

  const styles = makeStyles(theme, bottom);

  return (
    <View style={[styles.box, overLimit && styles.over]}>
      <Text style={[styles.value, overLimit && styles.valueOver]}>{kmh}</Text>
      <Text style={[styles.unit, overLimit && styles.unitOver]}>
        {strings.navigation.speedUnit}
      </Text>
    </View>
  );
}

function makeStyles(theme: Theme, bottom: number) {
  return StyleSheet.create({
    box: {
      position: 'absolute',
      left: 16,
      bottom,
      minWidth: 64,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
      elevation: 6,
      shadowColor: '#000000',
      shadowOpacity: 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
    },
    over: {
      backgroundColor: theme.danger,
    },
    value: {
      fontSize: 26,
      fontWeight: '800',
      color: theme.text,
      letterSpacing: -0.8,
      // Without this the box changed height between "9" and "90", and the
      // speedometer jumped every time it crossed a ten.
      lineHeight: 30,
    },
    valueOver: {
      color: theme.onAccent,
    },
    unit: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.textMuted,
      marginTop: 1,
    },
    unitOver: {
      color: theme.onAccent,
    },
  });
}
