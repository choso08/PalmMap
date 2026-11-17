import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import { formatDistance } from '../utils/format';

/** The longest the bar may be, in dp. */
const MAX_WIDTH = 96;
/** How long it stays after the zoom stops changing. */
const LINGER_MS = 2500;
/** Metres per pixel at zoom 0 on the equator, with MapLibre's 512-px tiles. */
const EQUATOR_M_PER_PX = 40075016.686 / 512;

export interface ScaleBarRef {
  /** The camera moved: shown when the zoom changed, then fades out. */
  update(zoom: number, latitude: number): void;
}

/** The longest round distance (1, 2 or 5 × 10ⁿ m) that fits in `maxMetres`. */
function roundDistance(maxMetres: number): number {
  const power = 10 ** Math.floor(Math.log10(maxMetres));
  const first = maxMetres / power;
  return (first >= 5 ? 5 : first >= 2 ? 2 : 1) * power;
}

/**
 * The scale, as in Google Maps (author's report, November 2026: MapLibre's
 * own sat at the top under the search, always on, and Android only lets it
 * go top-left). This one sits low on the left, next to where the compass
 * shows, appears while zooming and fades out a moment after — when one is
 * judging a distance, and not in the way otherwise. Metric always, as the
 * speedometer.
 *
 * Its state lives here, not in the map: it changes on every camera frame.
 */
export const ScaleBar = forwardRef<ScaleBarRef, { bottom: number; left: number }>(
  function ScaleBar({ bottom, left }, ref) {
    const theme = useTheme();
    const units = useT().units;
    const styles = useMemo(() => makeStyles(theme), [theme]);
    const [scale, setScale] = useState<{ metres: number; width: number } | null>(null);
    const opacity = useRef(new Animated.Value(0)).current;
    const lastZoom = useRef<number | null>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
      () => () => {
        if (hideTimer.current) {
          clearTimeout(hideTimer.current);
        }
      },
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        update(zoom, latitude) {
          const previous = lastZoom.current;
          lastZoom.current = zoom;
          // A drag alone does not bring it up; a pinch or the zoom buttons do.
          if (previous === null || Math.abs(previous - zoom) < 0.01) {
            return;
          }
          const perPx =
            (EQUATOR_M_PER_PX * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
          if (!Number.isFinite(perPx) || perPx <= 0) {
            return;
          }
          const metres = roundDistance(perPx * MAX_WIDTH);
          const width = Math.round(metres / perPx);
          setScale((s) => (s && s.metres === metres && s.width === width ? s : { metres, width }));
          Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
          if (hideTimer.current) {
            clearTimeout(hideTimer.current);
          }
          hideTimer.current = setTimeout(() => {
            Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
          }, LINGER_MS);
        },
      }),
      [opacity],
    );

    if (!scale) {
      return null;
    }
    return (
      <Animated.View pointerEvents="none" style={[styles.box, { bottom, left, opacity }]}>
        <Text style={styles.label}>
          {scale.metres < 1000
            ? formatDistance(scale.metres)
            : `${scale.metres / 1000} ${units.kilometres}`}
        </Text>
        <View style={[styles.bar, { width: scale.width }]} />
      </Animated.View>
    );
  },
);

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    box: {
      position: 'absolute',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: theme.surface,
      elevation: 2,
    },
    label: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 2,
    },
    // A bracket, as a ruler: the line with its two ends up.
    bar: {
      height: 5,
      borderLeftWidth: 1.5,
      borderRightWidth: 1.5,
      borderBottomWidth: 1.5,
      borderColor: theme.text,
    },
  });
}
