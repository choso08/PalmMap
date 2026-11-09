import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { Modal, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import type { Place } from '../types/geo';

interface Props {
  visible: boolean;
  favourites: Place[];
  recents: Place[];
  onClose: () => void;
  onSelect: (place: Place) => void;
}

/**
 * The Saved tab: the saved places and the recent destinations, on a screen of
 * their own.
 *
 * They were only reachable by tapping the empty search box — something people
 * discover by accident. A tab that says "Saved" is where everyone looks first.
 * Everything here is on the phone, so it works without network.
 */
export function SavedSheet({ visible, favourites, recents, onClose, onSelect }: Props) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  const sections = [
    ...(favourites.length > 0
      ? [{ key: 'fav', title: strings.saved.favourites, icon: 'star', data: favourites }]
      : []),
    ...(recents.length > 0
      ? [{ key: 'rec', title: strings.saved.recents, icon: 'history', data: recents }]
      : []),
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={strings.common.close}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          <Text style={styles.title}>{strings.saved.title}</Text>
        </View>

        {sections.length === 0 ? (
          <Text style={styles.empty}>{strings.saved.empty}</Text>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(p, i) => `${p.id}-${i}`}
            renderSectionHeader={({ section }) => (
              <Text style={styles.section}>{section.title}</Text>
            )}
            renderItem={({ item, section }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onClose();
                  onSelect(item);
                }}
              >
                <View style={styles.icon}>
                  <MaterialCommunityIcons
                    name={section.icon as never}
                    size={20}
                    color={section.key === 'fav' ? theme.poi : theme.textMuted}
                  />
                </View>
                <View style={styles.texts}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.address ? (
                    <Text style={styles.address} numberOfLines={1}>
                      {item.address}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            )}
            contentContainerStyle={styles.list}
          />
        )}
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.surface,
      paddingTop: insets.top + 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
    },
    empty: {
      margin: 24,
      fontSize: 15,
      lineHeight: 22,
      color: theme.textMuted,
    },
    list: {
      paddingBottom: insets.bottom + 24,
    },
    section: {
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 6,
      fontSize: 13,
      fontWeight: '700',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      backgroundColor: theme.surface,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    icon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceMuted,
    },
    texts: {
      flex: 1,
    },
    name: {
      fontSize: 15,
      color: theme.text,
      fontWeight: '600',
    },
    address: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 2,
    },
  });
}
