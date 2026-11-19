import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSwipeToClose } from '../useSwipeToClose';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { useSettings, useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import type { Place } from '../types/geo';
import { useFavouriteStops } from '../services/favouriteStops';
import type { TransitStop } from '../services/transit';
import { FavouriteStopRow } from './FavouriteStopRow';
import { useFavouriteLines } from '../services/favouriteLines';
import { LABELS_MAX, useHomeWork, useLabels, type HomeWorkKind } from '../services/homeWork';
import { LabelIcon } from './LabelIcon';
import {
  forgetParkedCar,
  setParkingPaidUntil,
  useParkedCar,
  type ParkedCar,
} from '../services/parkedCar';

/** The parking timer's choices, in minutes from now. */
const PAID_FOR_MIN = [30, 60, 120, 180];
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
  /** Saves the car where the person is; absent without a position. */
  onParkHere?: () => void;
  /** The parked car tapped: walk to it. */
  onGoToCar: (car: ParkedCar) => void;
  /** Home or Work to set or change: opens `HomeWorkPicker`. */
  onSetHomeWork: (kind: HomeWorkKind) => void;
  /** A label to change, or `null` for a new one (`LabelEditor`). */
  onEditLabel: (kind: HomeWorkKind | null) => void;
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
  onParkHere,
  onGoToCar,
  onSetHomeWork,
  onEditLabel,
}: Props) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const stops = useFavouriteStops();
  const lines = useFavouriteLines();
  const homeWork = useHomeWork();
  const labels = useLabels();
  const parked = useParkedCar();
  const { settings } = useSettings();
  const [noticeOff, setNoticeOff] = useState(false);
  const clockOf = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const paidLeft = parked?.paidUntil && parked.paidUntil > Date.now() ? parked.paidUntil : null;

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
          Home and Work, as Maps: a tap goes there; empty, a tap opens the
          screen that sets it (`HomeWorkPicker`); the pencil, or a long press,
          changes or removes it.
        */}
        <View style={styles.shortcuts}>
          {(['home', 'work'] as const).map((kind) => {
            const place = homeWork[kind];
            return (
              <Pressable
                key={kind}
                style={styles.shortcut}
                onPress={() => (place ? go(place) : onSetHomeWork(kind))}
                onLongPress={() => onSetHomeWork(kind)}
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
                {place ? (
                  <Pressable
                    hitSlop={10}
                    onPress={() => onSetHomeWork(kind)}
                    accessibilityLabel={strings.saved.change}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.textMuted} />
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {/*
          The person's own labels ("Gym", "Mum's"), each in its colour and
          icon: a tap goes there (or picks its place, when it has none), a
          long press changes it; the last chip makes a new one.
        */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // A horizontal ScrollView in a column takes every free pixel of
          // height: the "New label" chip stretched to half the screen
          // (author's photo, 19 November 2026).
          style={styles.labelsRow}
          contentContainerStyle={styles.labels}
          keyboardShouldPersistTaps="handled"
        >
          {labels.map((label) => {
            const kind: HomeWorkKind = `label:${label.id}`;
            return (
              <Pressable
                key={label.id}
                style={styles.labelChip}
                onPress={() => (label.place ? go(label.place) : onSetHomeWork(kind))}
                onLongPress={() => onEditLabel(kind)}
                accessibilityHint={strings.saved.changeHint}
              >
                <View style={[styles.labelDot, { backgroundColor: label.colour }]}>
                  <LabelIcon icon={label.icon} size={15} colour="#fff" />
                </View>
                <Text style={styles.labelText} numberOfLines={1}>
                  {label.place ? label.name : `${label.name} · ${strings.saved.set}`}
                </Text>
              </Pressable>
            );
          })}
          {labels.length < LABELS_MAX ? (
            <Pressable style={[styles.labelChip, styles.labelAdd]} onPress={() => onEditLabel(null)}>
              <MaterialCommunityIcons name="tag-plus-outline" size={18} color={theme.accent} />
              <Text style={[styles.labelText, { color: theme.accent }]}>{strings.labels.add}</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {/*
          Where the car was left (`services/parkedCar.ts`): a tap walks there;
          with none, a tap saves where the person is.
        */}
        {parked || onParkHere ? (
          <View style={styles.carRow}>
            <Pressable
              style={[styles.shortcut, styles.carMain]}
              onPress={() => {
                if (parked) {
                  onClose();
                  onGoToCar(parked);
                } else {
                  onParkHere?.();
                }
              }}
            >
              <View style={styles.icon}>
                <MaterialCommunityIcons name="car" size={20} color={theme.accent} />
              </View>
              <View style={styles.texts}>
                <Text style={styles.name} numberOfLines={1}>
                  {strings.parked.car}
                </Text>
                <Text style={styles.address} numberOfLines={1}>
                  {parked
                    ? [
                        strings.parked.parkedAgo(
                          strings.parked.ago(Math.round((Date.now() - parked.at) / 60000)),
                        ),
                        paidLeft ? strings.parked.paidUntil(clockOf(paidLeft)) : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : strings.parked.saveHere}
                </Text>
              </View>
            </Pressable>
            {parked ? (
              <Pressable
                hitSlop={10}
                onPress={forgetParkedCar}
                accessibilityLabel={strings.parked.forget}
                style={styles.carForget}
              >
                <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {/*
          The parking timer: paid for 30 min to 3 h from now, a notice ten
          minutes before it ends (`setParkingPaidUntil`). A tap on the chosen
          one clears it.
        */}
        {parked ? (
          <View style={styles.paidRow}>
            <Text style={styles.paidLabel}>{strings.parked.paidFor}</Text>
            {PAID_FOR_MIN.map((min) => (
              <Pressable
                key={min}
                style={styles.paidChip}
                onPress={() => {
                  void setParkingPaidUntil(Date.now() + min * 60000, settings.notifyParking).then((ok) =>
                    setNoticeOff(!ok),
                  );
                }}
              >
                <Text style={styles.paidChipText}>
                  {min < 60 ? `${min} min` : `${min / 60} h`}
                </Text>
              </Pressable>
            ))}
            {paidLeft ? (
              <Pressable
                hitSlop={8}
                onPress={() => {
                  setNoticeOff(false);
                  void setParkingPaidUntil(null);
                }}
                accessibilityLabel={strings.saved.clear}
              >
                <MaterialCommunityIcons name="timer-off-outline" size={20} color={theme.textMuted} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {parked && noticeOff ? <Text style={styles.paidNote}>{strings.parked.noticeOff}</Text> : null}

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
                onPress={() => go(item)}
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
    paidRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    paidLabel: {
      color: theme.textMuted,
      fontSize: 13,
    },
    paidChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    paidChipText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '500',
    },
    paidNote: {
      color: theme.textMuted,
      fontSize: 12,
      paddingHorizontal: 16,
      paddingTop: 4,
    },
    carRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 10,
    },
    carMain: {
      paddingRight: 44,
    },
    carForget: {
      position: 'absolute',
      right: 28,
      padding: 4,
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
    labelsRow: { flexGrow: 0, flexShrink: 0 },
    labels: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, alignItems: 'center' },
    labelChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 6,
      paddingRight: 14,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      maxWidth: 220,
      height: 40,
    },
    labelAdd: { paddingLeft: 12, borderStyle: 'dashed', borderColor: theme.accent },
    labelDot: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    labelText: { fontSize: 14, fontWeight: '600', color: theme.text, flexShrink: 1 },
  });
}
