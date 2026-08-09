import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
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
  View,
} from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { clearRecents } from '../services/recents';
import { clearMapCache } from '../services/tiles';
import { OfflineMaps } from './OfflineMaps';
import { Schedules } from './Schedules';
import {
  APPEARANCE_MODES,
  CACHE_SIZES,
  LANGUAGES,
  SATELLITE_DETAILS,
  TIME_ADJUSTMENTS,
  TRAVEL_MODES,
  useSettings,
  useT,
  useTheme,
} from '../settings';
import type { Theme } from '../theme';

interface SettingsSheetProps {
  /**
   * Avisa que os últimos destinos foram esquecidos.
   *
   * Sem isto, apagá-los limpava o telemóvel mas não a lista que a pesquisa
   * mostra: continuavam todos lá até se fechar a aplicação, e o botão parecia
   * avariado.
   */
  onRecentsCleared: () => void;
  visible: boolean;
  onClose: () => void;
}

/**
 * Um grupo de opções onde só uma pode estar escolhida.
 *
 * O nome de cada opção vem de fora, por uma função. As listas de opções só
 * guardam o `id` e o ícone: quem sabe como se chamam é a tabela da língua, e
 * misturar as duas coisas obrigava a mexer nas listas para traduzir.
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

/** Ecrã de definições. */
export function SettingsSheet({ visible, onClose, onRecentsCleared }: SettingsSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const { settings, update } = useSettings();
  const strings = useT();
  const s = strings.settings;
  const [clearing, setClearing] = useState(false);

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
      // Sem isto, a margem em cima dependeria de o ecrã desenhar ou não por
      // baixo da barra de estado, que varia. Assim desenha sempre por baixo e
      // é a nossa margem que manda.
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

        <ScrollView contentContainerStyle={styles.content}>
          {/*
            A língua fica em primeiro lugar de propósito: quem abriu as
            definições porque não percebe o que está no ecrã tem de dar com ela
            sem ter de ler o resto.
          */}
          <Text style={styles.sectionTitle}>{s.language}</Text>
          <Text style={styles.sectionHint}>{s.languageHint}</Text>
          <ChoiceRow
            options={LANGUAGES}
            label={(id) => strings.languages[id]}
            value={settings.language}
            onChange={(id) => update('language', id)}
            styles={styles}
            theme={theme}
          />

          <Text style={styles.sectionTitle}>{s.travelMode}</Text>
          <Text style={styles.sectionHint}>{s.travelModeHint}</Text>
          <ChoiceRow
            options={TRAVEL_MODES}
            label={(id) => s.travelModes[id]}
            value={settings.travelMode}
            onChange={(id) => update('travelMode', id)}
            styles={styles}
            theme={theme}
          />
          <Text style={styles.note}>{s.travelModeNote}</Text>

          <Text style={styles.sectionTitle}>{s.timeAdjustment}</Text>
          <Text style={styles.sectionHint}>{s.timeAdjustmentHint}</Text>
          <ChoiceRow
            options={TIME_ADJUSTMENTS}
            label={(id) => s.timeAdjustments[id]}
            value={settings.timeAdjustment}
            onChange={(id) => update('timeAdjustment', id)}
            styles={styles}
            theme={theme}
          />
          <Text style={styles.note}>{s.timeAdjustmentNote}</Text>

          <Text style={styles.sectionTitle}>{s.appearance}</Text>
          <Text style={styles.sectionHint}>{s.appearanceHint}</Text>
          <ChoiceRow
            options={APPEARANCE_MODES}
            label={(id) => s.appearanceModes[id]}
            value={settings.appearance}
            onChange={(id) => update('appearance', id)}
            styles={styles}
            theme={theme}
          />

          <Text style={styles.sectionTitle}>{s.satelliteDetail}</Text>
          <Text style={styles.sectionHint}>{s.satelliteDetailHint}</Text>
          <ChoiceRow
            options={SATELLITE_DETAILS}
            label={(id) => s.satelliteDetails[id]}
            value={settings.satelliteDetail}
            onChange={(id) => update('satelliteDetail', id)}
            styles={styles}
            theme={theme}
          />
          <Text style={styles.note}>
            {settings.satelliteDetail === 'alta' ? s.satelliteHighHint : s.satelliteNormalHint}
          </Text>

          <Text style={styles.sectionTitle}>{s.map}</Text>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>{s.showPlaces}</Text>
              <Text style={styles.switchHint}>{s.showPlacesHint}</Text>
            </View>
            <Switch
              value={settings.showPlacesOnMap}
              onValueChange={(next) => update('showPlacesOnMap', next)}
              trackColor={{ true: theme.accent, false: theme.border }}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>{s.showVehicles}</Text>
              <Text style={styles.switchHint}>{s.showVehiclesHint}</Text>
              {/*
                O custo tem de estar escrito. O serviço não deixa pedir só a área
                que se está a ver — vem a frota toda de cada vez, e é de longe o
                pedido mais pesado que esta aplicação faz.
              */}
              <Text style={styles.switchHint}>{s.showVehiclesCost}</Text>
            </View>
            <Switch
              value={settings.showVehicles}
              onValueChange={(next) => update('showVehicles', next)}
              trackColor={{ true: theme.accent, false: theme.border }}
            />
          </View>

          <Text style={styles.sectionTitle}>{s.cache}</Text>
          <Text style={styles.sectionHint}>{s.cacheHint}</Text>
          <ChoiceRow
            options={CACHE_SIZES}
            label={(id) => s.cacheSizes[id]}
            value={settings.cacheSize}
            onChange={(id) => update('cacheSize', id)}
            styles={styles}
            theme={theme}
          />
          <Text style={styles.note}>
            {settings.cacheSize === 'off' ? s.cacheOffHint : s.cacheFullHint}
          </Text>

          <Pressable
            style={styles.clearButton}
            onPress={() => void handleClearCache()}
            disabled={clearing}
          >
            <MaterialCommunityIcons name="delete-outline" size={18} color={theme.danger} />
            <Text style={styles.clearText}>{clearing ? s.clearingCache : s.clearCache}</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>{s.offlineMaps}</Text>
          <Text style={styles.sectionHint}>{s.offlineMapsHint}</Text>
          <OfflineMaps />
          <Text style={styles.note}>{s.offlineMapsNote}</Text>

          <Text style={styles.sectionTitle}>{s.schedules}</Text>
          <Text style={styles.sectionHint}>{s.schedulesHint}</Text>
          <Schedules />

          <Text style={styles.sectionTitle}>{s.navigation}</Text>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>{s.voice}</Text>
              <Text style={styles.switchHint}>{s.voiceHint}</Text>
            </View>
            <Switch
              value={settings.voiceGuidance}
              onValueChange={(next) => update('voiceGuidance', next)}
              trackColor={{ true: theme.accent, false: theme.border }}
            />
          </View>

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
          <Text style={styles.note}>{s.camerasNote}</Text>

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
          <Text style={styles.note}>{s.tollsNote}</Text>

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

          <Text style={styles.sectionTitle}>{s.recents}</Text>
          <Text style={styles.sectionHint}>{s.recentsHint}</Text>
          <Pressable
            style={styles.forgetRow}
            onPress={() => void clearRecents().then(onRecentsCleared)}
          >
            <MaterialCommunityIcons name="history" size={19} color={theme.danger} />
            <Text style={styles.clearText}>{s.forgetRecents}</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>{s.about}</Text>
          <Text style={styles.about}>{s.aboutText}</Text>

          {/*
            Os créditos. Vários destes serviços exigem atribuição por licença —
            não é cortesia, é condição de uso. Os nomes próprios não se traduzem;
            o que cada um faz, sim.
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
        </ScrollView>
      </View>
    </Modal>
  );
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
