import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { setHomeWork } from '../services/homeWork';
import {
  askBackgroundPermission,
  canLearn,
  forgetLearnt,
  guessHomeWork,
  watchLearnt,
  type FrequentPlace,
  type Learnt,
} from '../services/movementLearning';
import { addressAt } from '../services/nominatim';
import { useSettings, useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import type { Coordinates, Place } from '../types/geo';

const SHOWN_MAX = 6;

/**
 * The "Learn from my movements" switch and what it learnt (Settings →
 * Navigation). What is learnt is shown and can be deleted — the same rule as
 * the learnt pace: nothing learnt in silence.
 */
export function LearningSettings({ onShowPlace }: { onShowPlace?: (at: Coordinates) => void }) {
  const theme = useTheme();
  const strings = useT();
  const s = strings.learning;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { settings, update } = useSettings();
  const [learnt, setLearnt] = useState<Learnt | null>(null);
  useEffect(() => watchLearnt(setLearnt), []);

  const toggle = async (next: boolean) => {
    if (!next) {
      update('learnFromMovements', false);
      // Turned off: offered to delete everything at once, not left lying.
      if (learnt?.places.length) {
        Alert.alert(s.offTitle, undefined, [
          { text: s.keep, style: 'cancel' },
          { text: s.forget, style: 'destructive', onPress: () => void forgetLearnt() },
        ]);
      }
      return;
    }
    if (!canLearn()) {
      return;
    }
    // Asked when turned on, never by itself.
    if (await askBackgroundPermission()) {
      update('learnFromMovements', true);
    } else {
      Alert.alert(s.deniedTitle, s.deniedBody);
    }
  };

  const places = learnt?.places ?? [];
  const guess = guessHomeWork(places);
  const shown = [...places].sort((a, b) => b.minutes - a.minutes).slice(0, SHOWN_MAX);

  const saveAs = async (kind: 'home' | 'work', place: FrequentPlace) => {
    const named = await addressAt(place.coordinates).catch(() => null);
    const value: Place = named ?? {
      id: -Date.now(),
      name: kind === 'home' ? strings.saved.home : strings.saved.work,
      address: `${place.coordinates.latitude.toFixed(5)}, ${place.coordinates.longitude.toFixed(5)}`,
      coordinates: place.coordinates,
    };
    setHomeWork(kind, { ...value, coordinates: place.coordinates });
  };

  return (
    <>
      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <Text style={styles.switchLabel}>{s.title}</Text>
          <Text style={styles.hint}>{s.hint}</Text>
          <Text style={styles.hint}>{s.privacy}</Text>
        </View>
        <Switch
          value={settings.learnFromMovements}
          onValueChange={(next) => void toggle(next)}
          trackColor={{ true: theme.accent, false: theme.border }}
        />
      </View>

      {settings.learnFromMovements || places.length ? (
        <>
          <Text style={styles.section}>{s.places}</Text>
          {shown.length === 0 ? <Text style={styles.hint}>{s.none}</Text> : null}
          {shown.map((place) => {
            const isHome = guess.home === place;
            const isWork = guess.work === place;
            return (
              <View key={place.id} style={styles.place}>
                <Pressable
                  style={styles.placeMain}
                  onPress={() => onShowPlace?.(place.coordinates)}
                  accessibilityLabel={s.show}
                >
                  <MaterialCommunityIcons
                    name={isHome ? 'home-outline' : isWork ? 'briefcase-outline' : 'map-marker-outline'}
                    size={20}
                    color={theme.accent}
                  />
                  <View style={styles.switchText}>
                    <Text style={styles.placeTitle}>
                      {isHome ? s.looksHome : isWork ? s.looksWork : s.show}
                    </Text>
                    <Text style={styles.hint}>
                      {s.visits(place.visits, Math.max(1, Math.round(place.minutes / 60)))}
                    </Text>
                  </View>
                </Pressable>
                {isHome || isWork ? (
                  <Pressable
                    style={styles.chip}
                    onPress={() => void saveAs(isHome ? 'home' : 'work', place)}
                  >
                    <Text style={styles.chipText}>{isHome ? s.setHome : s.setWork}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          {places.length ? (
            <Pressable
              style={styles.forgetRow}
              onPress={() =>
                Alert.alert(s.forgetTitle, undefined, [
                  { text: strings.common.cancel, style: 'cancel' },
                  { text: s.forget, style: 'destructive', onPress: () => void forgetLearnt() },
                ])
              }
            >
              <MaterialCommunityIcons name="delete-outline" size={19} color={theme.danger} />
              <Text style={styles.forgetText}>{s.forget}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    switchText: { flex: 1 },
    switchLabel: { fontSize: 15, color: theme.text },
    hint: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    section: { marginTop: 6, fontSize: 13, fontWeight: '700', color: theme.textMuted },
    place: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
    placeMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    placeTitle: { fontSize: 14, color: theme.text },
    chip: {
      backgroundColor: theme.accent,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipText: { color: theme.onAccent, fontWeight: '700', fontSize: 13 },
    forgetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    forgetText: { fontSize: 14, color: theme.danger },
  });
}
