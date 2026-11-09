import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import { SEARCH_CATEGORIES, type SearchCategory } from '../utils/categories';

interface CategoryBarProps {
  /** The chosen category, or null when none is active. */
  selected: SearchCategory | null;
  onSelect: (category: SearchCategory | null) => void;
  disabled?: boolean;
}

/**
 * Row of buttons to look for businesses by kind — "Restaurants", "Pharmacies"…
 * Tapping the active one again turns the search off.
 */
export function CategoryBar({ selected, onSelect, disabled }: CategoryBarProps) {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {SEARCH_CATEGORIES.map((category) => {
        const active = selected?.id === category.id;

        return (
          <Pressable
            key={category.id}
            style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
            disabled={disabled}
            onPress={() => onSelect(active ? null : category)}
          >
            <MaterialCommunityIcons
              // The names come from `SEARCH_CATEGORIES` and were all checked
              // against the package's icon list.
              name={category.icon as never}
              size={16}
              color={active ? theme.onAccent : theme.textMuted}
            />
            <Text style={[styles.label, active && styles.labelActive]}>{strings.categories[category.labelKey]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    content: {
      gap: 8,
      paddingVertical: 10,
      // Starts aligned with the search bar and runs off to the right when scrolled.
      paddingLeft: 14,
      paddingRight: 14,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 22,
      backgroundColor: theme.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      elevation: 3,
      shadowColor: '#000000',
      shadowOpacity: 0.12,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 2 },
    },
    chipActive: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    chipDisabled: {
      opacity: 0.5,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
    },
    labelActive: {
      color: theme.onAccent,
    },
  });
}
