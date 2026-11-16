import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../settings';
import type { Theme } from '../theme';

interface Props {
  title: string;
  /** A top-level group of the settings: drawn larger, with this icon. */
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** A short line under the title, visible while closed. */
  hint?: string;
  /** Keep it open regardless of the toggle — used while searching the settings. */
  forceOpen?: boolean;
  children: ReactNode;
}

/**
 * A section of the settings screen that opens and closes.
 *
 * Long lists — the countries to download, the timetables — used to sit open in
 * the middle of the settings and push everything else down. Closed by default,
 * and the contents are only mounted while open: the list of countries is not
 * even requested until someone wants to see it.
 */
export function Collapsible({ title, icon, hint, forceOpen = false, children }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [toggled, setOpen] = useState(false);
  const open = toggled || forceOpen;

  return (
    <View style={icon ? styles.groupWrapper : styles.wrapper}>
      <Pressable
        style={icon ? styles.groupHeader : styles.header}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        {icon ? (
          <View style={styles.groupIcon}>
            <MaterialCommunityIcons name={icon} size={20} color={theme.accent} />
          </View>
        ) : null}
        <View style={styles.texts}>
          <Text style={icon ? styles.groupTitle : styles.title}>{title}</Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={theme.textMuted}
        />
      </Pressable>
      {open ? <View style={icon ? styles.groupBody : styles.body}>{children}</View> : null}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    wrapper: {
      marginTop: 26,
    },
    groupWrapper: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      gap: 14,
    },
    groupIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceMuted,
    },
    groupTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
    },
    texts: {
      flex: 1,
      paddingRight: 8,
    },
    title: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    hint: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 5,
    },
    body: {
      marginTop: 4,
    },
    groupBody: {
      marginTop: -12,
      paddingBottom: 20,
    },
  });
}
