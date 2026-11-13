import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useOnline } from '../services/network';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

/** How long "Back online" stays after the network returns. */
const BACK_ONLINE_MS = 3000;

/**
 * Says when the phone goes offline, and when it comes back, as Maps does
 * (author's request, November 2026). Offline the app does not stop: it uses
 * the downloaded maps, doors and timetables — the line says so, so that a
 * missing live bus reads as "no network", not as a fault.
 */
export function ConnectivityBanner() {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const online = useOnline();
  const [backOnline, setBackOnline] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setBackOnline(false);
      return;
    }
    if (!wasOffline.current) {
      return;
    }
    wasOffline.current = false;
    setBackOnline(true);
    const timer = setTimeout(() => setBackOnline(false), BACK_ONLINE_MS);
    return () => clearTimeout(timer);
  }, [online]);

  if (online && !backOnline) {
    return null;
  }
  return (
    <View style={[styles.pill, online ? styles.on : styles.off]} pointerEvents="none">
      <MaterialCommunityIcons
        name={online ? 'wifi' : 'wifi-off'}
        size={16}
        color={theme.onOverlay}
      />
      <Text style={styles.text} numberOfLines={2}>
        {online ? strings.network.backOnline : strings.network.offline}
      </Text>
    </View>
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
