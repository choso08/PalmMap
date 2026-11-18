import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

interface Props {
  name: string;
  kind: 'home' | 'work' | null;
  /** "25 min", once known. */
  time: string | null;
  onGo: () => void;
  onDismiss: () => void;
}

/**
 * "Going to Work? 25 min" on opening the app — from the trips the person
 * usually starts at this time from here (`services/tripHabits.ts`). One tap
 * and the route is there; ✕ and it is gone for this session.
 */
export function SuggestionCard({ name, kind, time, onGo, onDismiss }: Props) {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Pressable style={styles.card} onPress={onGo} accessibilityRole="button">
      <View style={styles.icon}>
        <MaterialCommunityIcons
          name={kind === 'home' ? 'home' : kind === 'work' ? 'briefcase' : 'map-marker-star'}
          size={18}
          color={theme.onAccent}
        />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={1}>
          {strings.suggestion.goingTo(kind ? strings.saved[kind] : name)}
        </Text>
        {time ? <Text style={styles.time}>{time}</Text> : null}
      </View>
      <Pressable onPress={onDismiss} hitSlop={12} accessibilityLabel={strings.common.close}>
        <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
      </Pressable>
    </Pressable>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 14,
      marginTop: 4,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 16,
      backgroundColor: theme.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      elevation: 3,
      shadowColor: '#000000',
      shadowOpacity: 0.12,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 2 },
    },
    icon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    texts: {
      flex: 1,
    },
    title: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
    },
    time: {
      color: theme.textMuted,
      fontSize: 13,
    },
  });
}
