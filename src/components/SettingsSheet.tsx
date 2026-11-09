import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo } from 'react';
import { useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { forgetCrash, lastCrash, type CrashReport } from '../services/crash';
import { clearRecents } from '../services/recents';
import { clearMapCache } from '../services/tiles';
import { Collapsible } from './Collapsible';
import { OfflineMaps } from './OfflineMaps';
import { Schedules } from './Schedules';
import { Updates } from './Updates';
import type { UpdateInfo } from '../services/update';
import {
  APPEARANCE_MODES,
  CACHE_SIZES,
  LANGUAGES,
  SATELLITE_DETAILS,
  TIME_ADJUSTMENTS,
  TRAVEL_MODES,
  useLanguage,
  useLearnedPace,
  useSettings,
  useT,
  useTheme,
} from '../settings';
import type { Theme } from '../theme';
import { formatFactor } from '../utils/format';
import { hasRegionVoice } from '../utils/voice';

interface SettingsSheetProps {
  /**
   * Says the recent destinations were forgotten.
   *
   * Without it, clearing them cleaned the phone but not the list the search
   * shows: they all stayed until the app was closed, and the button looked
   * broken.
   */
  onRecentsCleared: () => void;
  /**
   * The new version the automatic check found, if any.
   *
   * It lives in `App.tsx` because it also marks the Settings button with a dot
   * — two copies of the same answer would drift apart.
   */
  update: UpdateInfo | null;
  onUpdateFound: (info: UpdateInfo | null) => void;
  visible: boolean;
  onClose: () => void;
}

/**
 * A group of options where only one can be chosen.
 *
 * Each option's name comes from outside, through a function. The option lists
 * keep only the `id` and the icon: the language table knows what they are
 * called, and mixing the two meant touching the lists to translate.
 */
function ChoiceRow<T extends string>({
  options,
  label,
  value,
  onChange,
  styles,
  theme,
}: {
  options: { id: T; icon: string }[];
  label: (id: T) => string;
  value: T;
  onChange: (id: T) => void;
  styles: ReturnType<typeof makeStyles>;
  theme: Theme;
}) {
  return (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <Pressable
            key={option.id}
            style={[styles.choice, active && styles.choiceActive]}
            onPress={() => onChange(option.id)}
          >
            <MaterialCommunityIcons
              name={option.icon as never}
              size={22}
              color={active ? theme.onAccent : theme.textMuted}
            />
            <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>
              {label(option.id)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The Settings screen. */
export function SettingsSheet({
  visible,
  onClose,
  onRecentsCleared,
  update: novaVersao,
  onUpdateFound,
}: SettingsSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const { settings, update } = useSettings();
  const strings = useT();
  const s = strings.settings;
  const { pace, forgetPace } = useLearnedPace();
  const language = useLanguage();
  const [clearing, setClearing] = useState(false);

  /**
   * The settings search: what is typed hides every option whose name, hint or
   * section does not contain it (accents and case ignored), and opens the
   * groups that hold a match — so nobody has to dig through the groups.
   */
  const [filter, setFilter] = useState('');
  const show = useMemo(() => {
    const q = normalise(filter.trim());
    const has = (...terms: string[]) => !q || terms.some((term) => normalise(term).includes(q));
    const nav = s.navigation;
    const result = {
      language: has(s.language, ...LANGUAGES.map((l) => strings.languages[l.id])),
      time: has(s.timeAdjustment, s.forgetPace),
      appearance: has(s.appearance, ...Object.values(s.appearanceModes)),
      satellite: has(s.satelliteDetail, ...Object.values(s.satelliteDetails)),
      places: has(s.map, s.showPlaces),
      vehicles: has(s.map, s.showVehicles, s.showVehiclesCost),
      cache: has(s.cache, s.clearCache),
      offline: has(s.offlineMaps, s.offlineMapsNote),
      schedules: has(s.schedules),
      voice: has(nav, s.voice),
      limit: has(nav, s.speedLimit),
      cameras: has(nav, s.cameras, s.camerasHint),
      tolls: has(nav, s.tolls, s.tollsHint),
      speed: has(nav, s.speed, s.speedNote),
      battery: has(nav, s.batterySaver, s.batterySaverHint),
      recents: has(s.recents, s.forgetRecents),
      updates: has(s.updates),
      about: has(s.about, s.aboutText, 'OpenStreetMap', 'OSRM', 'CARTO', 'Overpass'),
    };
    return {
      ...result,
      searching: q.length > 0,
      map: result.places || result.vehicles,
      navigation:
        result.voice ||
        result.limit ||
        result.cameras ||
        result.tolls ||
        result.speed ||
        result.battery,
      nothing: !Object.values(result).some(Boolean),
    };
  }, [filter, s, strings]);

  /**
   * The last time the app closed by itself, if it did.
   *
   * **It comes first, on purpose.** Whoever comes here because the app closed
   * does not have to search; whoever never had a crash sees nothing, since the
   * whole section only exists when there is something to show.
   *
   * Read when the screen opens, not at app start: it is information for whoever
   * came looking, and not worth a disk read every time the map opens.
   */
  const [falha, setFalha] = useState<CrashReport | null>(null);
  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    void lastCrash().then((guardada) => {
      if (!cancelled) {
        setFalha(guardada);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  /**
   * "Car 1.3× · Bike 1.1×", only with the modes where something was measured.
   * Empty when nothing was learnt — and then the whole line is hidden.
   *
   * The order is `TRAVEL_MODES`'s, not the order the values arrived in: a list
   * that reorders itself reads as if its content had changed.
   */
  const ritmo = useMemo(
    () =>
      TRAVEL_MODES.filter((mode) => pace[mode.id] != null)
        .map((mode) => `${s.travelModes[mode.id]} ${formatFactor(pace[mode.id] as number)}`)
        .join(' · '),
    [pace, s],
  );

  const handleClearCache = async () => {
    setClearing(true);
    try {
      await clearMapCache();
      Alert.alert(s.cacheClearedTitle, s.cacheClearedBody);
    } catch {
      Alert.alert(s.clearCacheFailed, s.tryAgain);
    } finally {
      setClearing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      // Without this, the top margin would depend on whether the screen draws
      // under the status bar, which varies. This way it always does, and our
      // margin is the one that counts.
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{s.title}</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
            <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <MaterialCommunityIcons name="magnify" size={20} color={theme.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={filter}
            onChangeText={setFilter}
            placeholder={s.searchPlaceholder}
            placeholderTextColor={theme.placeholder}
            returnKeyType="search"
          />
          {filter ? (
            <Pressable onPress={() => setFilter('')} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {show.nothing ? <Text style={styles.note}>{s.searchNothing}</Text> : null}
          {/*
            What closed the app last time, when something did. See
            `src/services/crash.ts`: this does not fix the fault, it fixes the
            report — without the phone at hand, a photographed message saves
            several rounds of guessing.
          */}
          {falha ? (
            <View style={styles.falha}>
              <Text style={styles.falhaTitulo}>{s.lastCrash}</Text>
              <Text style={styles.falhaMensagem} selectable>
                {falha.message}
              </Text>
              {falha.stack ? (
                <Text style={styles.falhaPilha} selectable>
                  {falha.stack}
                </Text>
              ) : null}
              <Pressable
                style={styles.falhaBotao}
                onPress={() => {
                  setFalha(null);
                  void forgetCrash();
                }}
              >
                <Text style={styles.falhaBotaoTexto}>{s.lastCrashForget}</Text>
              </Pressable>
            </View>
          ) : null}

          {/*
            Language comes first on purpose: whoever opened Settings because
            they cannot understand the screen has to find it without reading
            the rest.
          */}
          {show.language ? (
            <>
              <Text style={styles.sectionTitle}>{s.language}</Text>
              <ChoiceRow
                options={LANGUAGES}
                label={(id) => strings.languages[id]}
                value={settings.language}
                onChange={(id) => update('language', id)}
                styles={styles}
                theme={theme}
              />
            </>
          ) : null}

          {show.time ? (
            <>
              <Text style={styles.sectionTitle}>{s.timeAdjustment}</Text>
              <ChoiceRow
                options={TIME_ADJUSTMENTS}
                label={(id) => s.timeAdjustments[id]}
                value={settings.timeAdjustment}
                onChange={(id) => update('timeAdjustment', id)}
                styles={styles}
                theme={theme}
              />

              {/*
            What the app learnt stays visible and can be forgotten. A value
            learnt in silence that nobody can see or clear is the kind of thing
            that, the day it goes wrong, has no explanation at all — and the
            manual correction above would stop working without anyone knowing
            why.
          */}
              {ritmo ? (
                <>
                  <Text style={styles.note}>{s.paceNote(ritmo)}</Text>
                  <Pressable style={styles.forgetRow} onPress={forgetPace}>
                    <MaterialCommunityIcons name="speedometer" size={19} color={theme.danger} />
                    <Text style={styles.clearText}>{s.forgetPace}</Text>
                  </Pressable>
                </>
              ) : null}
            </>
          ) : null}

          {show.appearance ? (
            <>
              <Text style={styles.sectionTitle}>{s.appearance}</Text>
              <ChoiceRow
                options={APPEARANCE_MODES}
                label={(id) => s.appearanceModes[id]}
                value={settings.appearance}
                onChange={(id) => update('appearance', id)}
                styles={styles}
                theme={theme}
              />
            </>
          ) : null}

          {show.satellite ? (
            <>
              <Text style={styles.sectionTitle}>{s.satelliteDetail}</Text>
              <ChoiceRow
                options={SATELLITE_DETAILS}
                label={(id) => s.satelliteDetails[id]}
                value={settings.satelliteDetail}
                onChange={(id) => update('satelliteDetail', id)}
                styles={styles}
                theme={theme}
              />
              {settings.satelliteDetail === 'alta' ? (
                <Text style={styles.note}>{s.satelliteHighHint}</Text>
              ) : null}
            </>
          ) : null}

          {show.map ? <Text style={styles.sectionTitle}>{s.map}</Text> : null}
          {show.places ? (
            <>
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.switchLabel}>{s.showPlaces}</Text>
                </View>
                <Switch
                  value={settings.showPlacesOnMap}
                  onValueChange={(next) => update('showPlacesOnMap', next)}
                  trackColor={{ true: theme.accent, false: theme.border }}
                />
              </View>
            </>
          ) : null}

          {show.vehicles ? (
            <>
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.switchLabel}>{s.showVehicles}</Text>
                  {/*
                The cost has to be written. The service cannot be asked for just
                the area in view — the whole fleet comes every time, by far the
                heaviest request this app makes.
              */}
                  <Text style={styles.switchHint}>{s.showVehiclesCost}</Text>
                </View>
                <Switch
                  value={settings.showVehicles}
                  onValueChange={(next) => update('showVehicles', next)}
                  trackColor={{ true: theme.accent, false: theme.border }}
                />
              </View>
            </>
          ) : null}

          {show.cache ? (
            <>
              <Text style={styles.sectionTitle}>{s.cache}</Text>
              <ChoiceRow
                options={CACHE_SIZES}
                label={(id) => s.cacheSizes[id]}
                value={settings.cacheSize}
                onChange={(id) => update('cacheSize', id)}
                styles={styles}
                theme={theme}
              />
              {settings.cacheSize === 'off' ? (
                <Text style={styles.note}>{s.cacheOffHint}</Text>
              ) : null}

              <Pressable
                style={styles.clearButton}
                onPress={() => void handleClearCache()}
                disabled={clearing}
              >
                <MaterialCommunityIcons name="delete-outline" size={18} color={theme.danger} />
                <Text style={styles.clearText}>{clearing ? s.clearingCache : s.clearCache}</Text>
              </Pressable>
            </>
          ) : null}

          {show.offline ? (
            <Collapsible title={s.offlineMaps} forceOpen={show.searching}>
              <OfflineMaps />
              <Text style={styles.note}>{s.offlineMapsNote}</Text>
            </Collapsible>
          ) : null}

          {show.schedules ? (
            <Collapsible title={s.schedules} forceOpen={show.searching}>
              <Schedules />
            </Collapsible>
          ) : null}

          {/* Every navigation option in one group, closed by default (author's request). */}
          {show.navigation ? (
            <Collapsible title={s.navigation} forceOpen={show.searching}>
              {show.voice ? (
                <>
                  <View style={styles.switchRow}>
                    <View style={styles.switchText}>
                      <Text style={styles.switchLabel}>{s.voice}</Text>
                      {/*
                  Only when the phone does **not** have the region's voice. The app
                  cannot install voices — that is Android's settings — but it can
                  say why an accent nobody asked for is heard, which otherwise
                  reads as an app fault.
                */}
                      {hasRegionVoice(language) === false ? (
                        <Text style={styles.switchHint}>{s.voiceRegionHint}</Text>
                      ) : null}
                    </View>
                    <Switch
                      value={settings.voiceGuidance}
                      onValueChange={(next) => update('voiceGuidance', next)}
                      trackColor={{ true: theme.accent, false: theme.border }}
                    />
                  </View>
                </>
              ) : null}

              {show.limit ? (
                <>
                  <View style={styles.switchRow}>
                    <View style={styles.switchText}>
                      <Text style={styles.switchLabel}>{s.speedLimit}</Text>
                    </View>
                    <Switch
                      value={settings.speedLimitAlerts}
                      onValueChange={(next) => update('speedLimitAlerts', next)}
                      trackColor={{ true: theme.accent, false: theme.border }}
                    />
                  </View>
                </>
              ) : null}

              {show.cameras ? (
                <>
                  <View style={styles.switchRow}>
                    <View style={styles.switchText}>
                      <Text style={styles.switchLabel}>{s.cameras}</Text>
                      <Text style={styles.switchHint}>{s.camerasHint}</Text>
                    </View>
                    <Switch
                      value={settings.speedCameraAlerts}
                      onValueChange={(next) => update('speedCameraAlerts', next)}
                      trackColor={{ true: theme.accent, false: theme.border }}
                    />
                  </View>
                </>
              ) : null}

              {show.tolls ? (
                <>
                  <View style={styles.switchRow}>
                    <View style={styles.switchText}>
                      <Text style={styles.switchLabel}>{s.tolls}</Text>
                      <Text style={styles.switchHint}>{s.tollsHint}</Text>
                    </View>
                    <Switch
                      value={settings.avoidTolls}
                      onValueChange={(next) => update('avoidTolls', next)}
                      trackColor={{ true: theme.accent, false: theme.border }}
                    />
                  </View>
                </>
              ) : null}

              {show.speed ? (
                <>
                  <View style={styles.switchRow}>
                    <View style={styles.switchText}>
                      <Text style={styles.switchLabel}>{s.speed}</Text>
                    </View>
                    <Switch
                      value={settings.showSpeed}
                      onValueChange={(next) => update('showSpeed', next)}
                      trackColor={{ true: theme.accent, false: theme.border }}
                    />
                  </View>
                  <Text style={styles.note}>{s.speedNote}</Text>
                </>
              ) : null}

              {show.battery ? (
                <>
                  <View style={styles.switchRow}>
                    <View style={styles.switchText}>
                      <Text style={styles.switchLabel}>{s.batterySaver}</Text>
                      <Text style={styles.switchHint}>{s.batterySaverHint}</Text>
                    </View>
                    <Switch
                      value={settings.batterySaver}
                      onValueChange={(next) => update('batterySaver', next)}
                      trackColor={{ true: theme.accent, false: theme.border }}
                    />
                  </View>
                </>
              ) : null}
            </Collapsible>
          ) : null}

          {show.recents ? (
            <>
              <Text style={styles.sectionTitle}>{s.recents}</Text>
              <Pressable
                style={styles.forgetRow}
                onPress={() => void clearRecents().then(onRecentsCleared)}
              >
                <MaterialCommunityIcons name="history" size={19} color={theme.danger} />
                <Text style={styles.clearText}>{s.forgetRecents}</Text>
              </Pressable>
            </>
          ) : null}

          {show.updates ? (
            <>
              <Text style={styles.sectionTitle}>{s.updates}</Text>
              <Updates found={novaVersao} onFound={onUpdateFound} />
            </>
          ) : null}

          {show.about ? (
            <>
              <Text style={styles.sectionTitle}>{s.about}</Text>
              <Text style={styles.about}>{s.aboutText}</Text>

              {/*
            The credits. Several of these services require attribution by
            licence — not a courtesy, a condition of use. Proper names are not
            translated; what each one does is.
          */}
              <Pressable
                style={styles.creditRow}
                onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}
              >
                <Text style={styles.creditName}>OpenStreetMap</Text>
                <Text style={styles.creditRole}>{s.credits.osm}</Text>
              </Pressable>

              <Pressable
                style={styles.creditRow}
                onPress={() => void Linking.openURL('https://routing.openstreetmap.de/about.html')}
              >
                <Text style={styles.creditName}>OSRM · FOSSGIS</Text>
                <Text style={styles.creditRole}>{s.credits.osrm}</Text>
              </Pressable>

              <Pressable
                style={styles.creditRow}
                onPress={() => void Linking.openURL('https://carto.com/attribution')}
              >
                <Text style={styles.creditName}>CARTO</Text>
                <Text style={styles.creditRole}>{s.credits.carto}</Text>
              </Pressable>

              <View style={styles.creditRow}>
                <Text style={styles.creditName}>Overpass</Text>
                <Text style={styles.creditRole}>{s.credits.overpass}</Text>
              </View>
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Lower case, without accents: "Navegação" is found by "navegacao". */
function normalise(text: string): string {
  const lower = text.toLowerCase();
  return typeof lower.normalize === 'function'
    ? lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    : lower;
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.surface,
      // Abaixo da barra de estado e da câmara.
      paddingTop: insets.top + 14,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.text,
      letterSpacing: -0.4,
    },
    closeButton: {
      padding: 6,
      borderRadius: 20,
      backgroundColor: theme.surfaceMuted,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 20,
      marginTop: 12,
      paddingHorizontal: 12,
      borderRadius: 22,
      backgroundColor: theme.surfaceMuted,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 9,
      fontSize: 15,
      color: theme.text,
    },
    content: {
      padding: 20,
      paddingBottom: insets.bottom + 36,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 26,
    },
    sectionHint: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 5,
    },
    choiceRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
    },
    choice: {
      flex: 1,
      alignItems: 'center',
      gap: 6,
      paddingVertical: 14,
      borderRadius: 18,
      backgroundColor: theme.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    choiceActive: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    choiceLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
    },
    choiceLabelActive: {
      color: theme.onAccent,
    },
    clearButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 14,
      borderRadius: 18,
      paddingVertical: 13,
      backgroundColor: theme.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    clearText: {
      color: theme.danger,
      fontSize: 15,
      fontWeight: '700',
    },
    note: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 10,
      lineHeight: 17,
    },
    /*
     * The last crash. It looks like a notice, not a setting, because it is not
     * one — it is something that happened and can be cleared once read.
     */
    falha: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.danger,
      padding: 14,
      gap: 8,
      marginBottom: 8,
    },
    falhaTitulo: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.danger,
    },
    falhaHint: {
      fontSize: 12,
      color: theme.textMuted,
      lineHeight: 17,
    },
    falhaMensagem: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
    },
    falhaPilha: {
      fontSize: 10,
      lineHeight: 14,
      color: theme.textMuted,
    },
    falhaBotao: {
      alignSelf: 'flex-start',
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: theme.background,
    },
    falhaBotaoTexto: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textMuted,
    },
    forgetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginTop: 14,
    },
    switchText: {
      flex: 1,
    },
    switchLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
    },
    switchHint: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 4,
      lineHeight: 17,
    },
    about: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 10,
      lineHeight: 19,
    },
    creditRow: {
      marginTop: 14,
    },
    creditName: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.accent,
    },
    creditRole: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2,
    },
  });
}
