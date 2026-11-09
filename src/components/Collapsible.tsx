import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../settings';
import type { Theme } from '../theme';

interface Props {
  title: string;
  /** A short line under the title, visible while closed. */
  hint?: string;
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
export function Collapsible({ title, hint, children }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Pressable
        style={styles.header}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.texts}>
          <Text style={styles.title}>{title}</Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={theme.textMuted}
        />
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    wrapper: {
      marginTop: 26,
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
  });
}
