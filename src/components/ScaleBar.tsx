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
 * own sat at the top under the search, always on). This one appears only
 * while zooming and fades out a moment after — when one is judging a
 * distance, and not in the way otherwise. It sits top-left under the category
 * chips, as Google Maps shows it: low on the left it followed the floating
 * buttons' height, and with a bus's panel open it ended up floating in the
 * middle of the map (author's photo, 7.0.49). Metric always, as the
 * speedometer. A faint pill behind it keeps it readable on satellite.
 *
 * Its state lives here, not in the map: it changes on every camera frame.
 */
export const ScaleBar = forwardRef<ScaleBarRef, { top: number; left: number }>(
  function ScaleBar({ top, left }, ref) {
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
      <Animated.View pointerEvents="none" style={[styles.box, { top, left, opacity }]}>
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
  // The map's own text colours: dark on a light map, light on a dark one,
  // with a halo of the other so it reads on satellite too.
  const ink = theme.dark ? '#FFFFFF' : '#1F1F1F';
  const halo = theme.dark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)';
  return StyleSheet.create({
    // A faint pill: the line has no halo on Android (no shadows on a View).
    box: {
      position: 'absolute',
      paddingHorizontal: 6,
      paddingTop: 2,
      paddingBottom: 4,
      borderRadius: 6,
      backgroundColor: theme.dark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.7)',
    },
    label: {
      fontSize: 11,
      fontWeight: '700',
      color: ink,
      marginBottom: 1,
      textShadowColor: halo,
      textShadowRadius: 3,
      textShadowOffset: { width: 0, height: 0 },
    },
    // A bracket, as a ruler: the line with its two ends up.
    bar: {
      height: 5,
      borderLeftWidth: 2,
      borderRightWidth: 2,
      borderBottomWidth: 2,
      borderColor: ink,
    },
  });
}
