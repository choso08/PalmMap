import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { MAP_TYPES, useSettings, useT, useTheme, type MapType } from '../settings';
import type { Theme } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Starts the measuring tape (it used to have its own button on the map). */
  onMeasure: () => void;
}

/**
 * The map layers panel, opened from the button under the search bar.
 *
 * It replaces the corner button that cycled through the three map types and
 * showed the icon of the **next** one — it worked, but nobody guesses that. A
 * panel with the three types side by side, the current one marked, is the
 * pattern people already know, and it also gives the map's on/off details a
 * home next to them.
 */
export function LayersSheet({ visible, onClose, onMeasure }: Props) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const { settings, update } = useSettings();

  const choose = (type: MapType) => {
    update('mapType', type);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{strings.layers.mapType}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={strings.common.close}>
            <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
          </Pressable>
        </View>

        <View style={styles.types}>
          {MAP_TYPES.map((type) => {
            const on = settings.mapType === type.id;
            return (
              <Pressable key={type.id} style={styles.type} onPress={() => choose(type.id)}>
                <View style={[styles.thumb, on && styles.thumbOn]}>
                  <MaterialCommunityIcons
                    name={type.icon as never}
                    size={30}
                    color={on ? theme.accent : theme.textMuted}
                  />
                </View>
                <Text
                  style={[styles.typeLabel, on && styles.typeLabelOn]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {strings.settings.mapTypes[type.id]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>{strings.layers.details}</Text>
        <View style={styles.row}>
          <MaterialCommunityIcons name="storefront-outline" size={22} color={theme.text} />
          <Text style={styles.rowText}>{strings.settings.showPlaces}</Text>
          <Switch
            value={settings.showPlacesOnMap}
            onValueChange={(v) => update('showPlacesOnMap', v)}
            trackColor={{ true: theme.accent, false: theme.border }}
          />
        </View>
        <View style={styles.row}>
          <MaterialCommunityIcons name="bus-marker" size={22} color={theme.text} />
          <View style={styles.rowTexts}>
            <Text style={styles.rowLabel}>{strings.settings.showVehicles}</Text>
            <Text style={styles.rowHint}>{strings.settings.showVehiclesCost}</Text>
          </View>
          <Switch
            value={settings.showVehicles}
            onValueChange={(v) => update('showVehicles', v)}
            trackColor={{ true: theme.accent, false: theme.border }}
          />
        </View>

        <Text style={styles.section}>{strings.layers.tools}</Text>
        <Pressable
          style={styles.row}
          onPress={() => {
            onClose();
            onMeasure();
          }}
        >
          <MaterialCommunityIcons name="ruler" size={22} color={theme.text} />
          <Text style={styles.rowText}>{strings.layers.measure}</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textMuted} />
        </Pressable>
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.25)',
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: insets.bottom + 20,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
    },
    types: {
      flexDirection: 'row',
      // Four types side by side: a narrower gap leaves the thumbnails room.
      gap: 10,
      marginTop: 16,
    },
    type: {
      flex: 1,
      alignItems: 'center',
      gap: 6,
    },
    thumb: {
      width: '100%',
      aspectRatio: 1.25,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceMuted,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    thumbOn: {
      borderColor: theme.accent,
    },
    typeLabel: {
      fontSize: 13,
      color: theme.textMuted,
      textAlign: 'center',
    },
    typeLabelOn: {
      color: theme.accent,
      fontWeight: '700',
    },
    section: {
      marginTop: 22,
      marginBottom: 4,
      fontSize: 13,
      fontWeight: '700',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 10,
    },
    rowTexts: {
      flex: 1,
    },
    rowText: {
      flex: 1,
      fontSize: 15,
      color: theme.text,
    },
    // No `flex: 1` inside the column: it squashed the label to nothing and the
    // hint was drawn over it.
    rowLabel: {
      fontSize: 15,
      color: theme.text,
    },
    rowHint: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2,
    },
  });
}
