import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import type { ElevationProfile } from '../utils/elevation';

/** How many columns the little chart is drawn with. */
const BARS = 48;
const CHART_HEIGHT = 44;

/**
 * A walking or cycling route's climb, as the apps for those have it: metres up
 * and down, and the shape of the route's height in a small chart of columns
 * (plain views — no drawing library needed for this). The lowest point sits
 * a little above the floor, so a flat route reads as flat, not as nothing.
 */
export function ElevationProfileView({ profile }: { profile: ElevationProfile }) {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const bars = useMemo(() => {
    const { points, min, max } = profile;
    const total = points[points.length - 1][0] || 1;
    // A range under 20 m is drawn as 20 m: otherwise a gentle street looks
    // like a mountain.
    const span = Math.max(20, max - min);
    const out: number[] = [];
    let j = 0;
    for (let b = 0; b < BARS; b += 1) {
      const at = (total * (b + 0.5)) / BARS;
      while (j < points.length - 2 && points[j + 1][0] < at) {
        j += 1;
      }
      const [d0, h0] = points[j];
      const [d1, h1] = points[j + 1] ?? points[j];
      const h = d1 > d0 ? h0 + ((h1 - h0) * (at - d0)) / (d1 - d0) : h0;
      out.push(0.12 + (0.88 * (h - min)) / span);
    }
    return out;
  }, [profile]);

  return (
    <View style={styles.container}>
      <View style={styles.numbers}>
        <MaterialCommunityIcons name="trending-up" size={16} color={theme.textMuted} />
        <Text style={styles.number}>{strings.route.ascent(profile.ascent)}</Text>
        <MaterialCommunityIcons name="trending-down" size={16} color={theme.textMuted} />
        <Text style={styles.number}>{strings.route.descent(profile.descent)}</Text>
        <Text style={styles.range}>
          {strings.route.heightRange(Math.round(profile.min), Math.round(profile.max))}
        </Text>
      </View>
      <View style={styles.chart} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {bars.map((f, i) => (
          <View key={i} style={[styles.bar, { height: f * CHART_HEIGHT }]} />
        ))}
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      marginTop: 10,
      gap: 6,
    },
    numbers: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    number: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
      marginRight: 8,
    },
    range: {
      color: theme.textMuted,
      fontSize: 12,
      marginLeft: 'auto',
    },
    chart: {
      height: CHART_HEIGHT,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 1,
    },
    bar: {
      flex: 1,
      backgroundColor: theme.accent,
      opacity: 0.55,
      borderTopLeftRadius: 2,
      borderTopRightRadius: 2,
    },
  });
}
