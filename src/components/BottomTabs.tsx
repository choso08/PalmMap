import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

export type Tab = 'explore' | 'go' | 'saved' | 'settings';

/** The bar's own height, without the system navigation bar under it. */
export const TAB_BAR_HEIGHT = 64;

interface Props {
  active: Tab;
  onPress: (tab: Tab) => void;
  /** A new version is waiting: a dot on the Settings tab. */
  updateAvailable?: boolean;
}

const TABS: { id: Tab; icon: string; activeIcon: string }[] = [
  { id: 'explore', icon: 'map-marker-outline', activeIcon: 'map-marker' },
  { id: 'go', icon: 'directions', activeIcon: 'directions' },
  { id: 'saved', icon: 'bookmark-outline', activeIcon: 'bookmark' },
  { id: 'settings', icon: 'cog-outline', activeIcon: 'cog' },
];

/**
 * The tab bar along the bottom of the map, as in the maps apps people already
 * know: Explore (the map), Go (directions), Saved and Settings.
 *
 * It hides while a bottom panel is open or while navigating — those panels sit
 * where it would be, and two layers fighting for the bottom of the screen is
 * the first thing that makes an app feel cramped.
 */
export function BottomTabs({ active, onPress, updateAvailable = false }: Props) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const on = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            style={styles.tab}
            onPress={() => onPress(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <View style={[styles.pill, on && styles.pillOn]}>
              <MaterialCommunityIcons
                name={(on ? tab.activeIcon : tab.icon) as never}
                size={22}
                color={on ? theme.accent : theme.textMuted}
              />
              {tab.id === 'settings' && updateAvailable ? <View style={styles.dot} /> : null}
            </View>
            <Text style={[styles.label, on && styles.labelOn]}>{strings.tabs[tab.id]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    bar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      height: TAB_BAR_HEIGHT + insets.bottom,
      paddingBottom: insets.bottom,
      backgroundColor: theme.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      elevation: 12,
      shadowColor: '#000000',
      shadowOpacity: 0.1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: -2 },
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
    },
    pill: {
      paddingHorizontal: 18,
      paddingVertical: 4,
      borderRadius: 16,
    },
    pillOn: {
      backgroundColor: theme.surfaceMuted,
    },
    label: {
      fontSize: 12,
      color: theme.textMuted,
      fontWeight: '500',
    },
    labelOn: {
      color: theme.accent,
      fontWeight: '700',
    },
    dot: {
      position: 'absolute',
      top: 3,
      right: 14,
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: theme.accent,
      borderWidth: 1.5,
      borderColor: theme.surface,
    },
  });
}
