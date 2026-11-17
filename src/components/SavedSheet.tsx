import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Modal, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSwipeToClose } from '../useSwipeToClose';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import type { Place } from '../types/geo';
import { useFavouriteStops } from '../services/favouriteStops';
import type { TransitStop } from '../services/transit';
import { FavouriteStopRow } from './FavouriteStopRow';
import { useFavouriteLines } from '../services/favouriteLines';
import { setHomeWork, useHomeWork, type HomeWorkKind } from '../services/homeWork';
import type { TransitLineInfo } from '../services/transit';
import { operatorColour, textOn } from '../utils/lineColour';

interface Props {
  visible: boolean;
  favourites: Place[];
  recents: Place[];
  onClose: () => void;
  onSelect: (place: Place) => void;
  /** A favourite stop tapped: open its panel. */
  onSelectStop: (stop: TransitStop) => void;
  /** A favourite line tapped: open it. */
  onSelectLine: (line: TransitLineInfo) => void;
}

/**
 * The Saved tab: the saved places and the recent destinations, on a screen of
 * their own.
 *
 * They were only reachable by tapping the empty search box — something people
 * discover by accident. A tab that says "Saved" is where everyone looks first.
 * Everything here is on the phone, so it works without network.
 */
export function SavedSheet({
  visible,
  favourites,
  recents,
  onClose,
  onSelect,
  onSelectStop,
  onSelectLine,
}: Props) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const stops = useFavouriteStops();
  const lines = useFavouriteLines();
  const homeWork = useHomeWork();
  /**
   * Home or Work being chosen: the next place tapped in the lists below is
   * kept as it instead of becoming the destination.
   */
  const [picking, setPicking] = useState<HomeWorkKind | null>(null);
  useEffect(() => {
    if (!visible) {
      setPicking(null);
    }
  }, [visible]);
  const canPick = favourites.length + recents.length > 0;

  const go = (place: Place) => {
    onClose();
    onSelect(place);
  };

  const sections = [
    ...(favourites.length > 0
      ? [{ key: 'fav', title: strings.saved.favourites, icon: 'star', data: favourites }]
      : []),
    ...(recents.length > 0
      ? [{ key: 'rec', title: strings.saved.recents, icon: 'history', data: recents }]
      : []),
  ];

  // Pull the header down to close (`useSwipeToClose`).
  const swipe = useSwipeToClose(onClose, visible);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      // See-through, so pulling the screen down (`useSwipeToClose`) shows the map.
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Animated.View style={[styles.screen, swipe.sheetStyle]}>
        <View style={styles.header} {...swipe.headerHandlers}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={strings.common.close}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          <Text style={styles.title}>{strings.saved.title}</Text>
        </View>

        {/*
          Home and Work, as Moovit and Maps: a tap goes there; empty, a tap
          asks which place it is; a long press chooses another or clears it.
        */}
        <View style={styles.shortcuts}>
          {(['home', 'work'] as const).map((kind) => {
            const place = homeWork[kind];
            const active = picking === kind;
            return (
              <Pressable
                key={kind}
                style={[styles.shortcut, active && styles.shortcutActive]}
                onPress={() => {
                  if (place && !active) {
                    go(place);
                  } else {
                    setPicking(active ? null : kind);
                  }
                }}
                onLongPress={() => setPicking(kind)}
                accessibilityHint={place ? strings.saved.changeHint : undefined}
              >
                <View style={styles.icon}>
                  <MaterialCommunityIcons
                    name={kind === 'home' ? 'home' : 'briefcase'}
                    size={20}
                    color={theme.accent}
                  />
                </View>
                <View style={styles.texts}>
                  <Text style={styles.name} numberOfLines={1}>
                    {strings.saved[kind]}
                  </Text>
                  <Text style={styles.address} numberOfLines={1}>
                    {place ? place.name : strings.saved.set}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        {picking ? (
          <View style={styles.picking}>
            <Text style={styles.pickingText}>
              {canPick ? strings.saved.pickFor(strings.saved[picking]) : strings.saved.pickNone}
            </Text>
            {homeWork[picking] ? (
              <Pressable
                hitSlop={8}
                onPress={() => {
                  setHomeWork(picking, null);
                  setPicking(null);
                }}
              >
                <Text style={styles.pickingAction}>{strings.saved.clear}</Text>
              </Pressable>
            ) : null}
            <Pressable hitSlop={8} onPress={() => setPicking(null)}>
              <Text style={styles.pickingAction}>{strings.common.cancel}</Text>
            </Pressable>
          </View>
        ) : null}

        {sections.length === 0 && stops.length === 0 && lines.length === 0 ? (
          <Text style={styles.empty}>{strings.saved.empty}</Text>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(p, i) => `${p.id}-${i}`}
            // Favourite stops first, with their next buses, only while open.
            ListHeaderComponent={
              <View>
                {lines.length > 0 ? (
                  <View>
                    <Text style={styles.section}>{strings.saved.lines}</Text>
                    {lines.map((line) => {
                      const colour = line.colour ?? operatorColour('carris-metropolitana', theme.vehicle);
                      return (
                        <Pressable
                          key={line.id}
                          style={styles.row}
                          onPress={() => {
                            onClose();
                            onSelectLine(line);
                          }}
                        >
                          <View style={[styles.lineBadge, { backgroundColor: colour }]}>
                            <Text
                              style={[
                                styles.lineBadgeText,
                                { color: line.textColour ?? textOn(colour) },
                              ]}
                            >
                              {line.short}
                            </Text>
                          </View>
                          <Text style={[styles.name, styles.texts]} numberOfLines={2}>
                            {line.long}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              {stops.length > 0 && visible ? (
                <View>
                  <Text style={styles.section}>{strings.saved.stops}</Text>
                  {stops.map((stop) => (
                    <FavouriteStopRow
                      key={stop.id}
                      stop={stop}
                      onPress={() => {
                        onClose();
                        onSelectStop(stop);
                      }}
                    />
                  ))}
                </View>
              ) : null}
              </View>
            }
            renderSectionHeader={({ section }) => (
              <Text style={styles.section}>{section.title}</Text>
            )}
            renderItem={({ item, section }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  if (picking) {
                    setHomeWork(picking, item);
                    setPicking(null);
                  } else {
                    go(item);
                  }
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
      </Animated.View>
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
    shortcuts: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    shortcut: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    shortcutActive: {
      borderColor: theme.accent,
    },
    picking: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginHorizontal: 16,
      marginTop: 10,
      padding: 10,
      borderRadius: 10,
      backgroundColor: theme.surfaceMuted,
    },
    pickingText: {
      flex: 1,
      fontSize: 13,
      color: theme.text,
    },
    pickingAction: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.accent,
    },
    lineBadge: {
      minWidth: 46,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      alignItems: 'center',
    },
    lineBadgeText: {
      fontSize: 14,
      fontWeight: '800',
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
