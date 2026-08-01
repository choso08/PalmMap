import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import {
  APPEARANCE_MODES,
  TRAVEL_MODES,
  useSettings,
  useTheme,
} from '../settings';
import type { Theme } from '../theme';

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Um grupo de opções onde só uma pode estar escolhida. */
function ChoiceRow<T extends string>({
  options,
  value,
  onChange,
  styles,
  theme,
}: {
  options: { id: T; label: string; icon: string }[];
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
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Ecrã de definições. */
export function SettingsSheet({ visible, onClose }: SettingsSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { settings, update } = useSettings();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Definições</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
            <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>Meio de transporte</Text>
          <Text style={styles.sectionHint}>
            Como se calculam os percursos.
          </Text>
          <ChoiceRow
            options={TRAVEL_MODES}
            value={settings.travelMode}
            onChange={(id) => update('travelMode', id)}
            styles={styles}
            theme={theme}
          />
          <Text style={styles.note}>
            O servidor público do OSRM é de demonstração e pode ter apenas o perfil de
            carro. Se os percursos a pé e de bicicleta vierem iguais aos de carro, é isso.
          </Text>

          <Text style={styles.sectionTitle}>Aspeto</Text>
          <Text style={styles.sectionHint}>
            No modo automático segue a definição do telemóvel.
          </Text>
          <ChoiceRow
            options={APPEARANCE_MODES}
            value={settings.appearance}
            onChange={(id) => update('appearance', id)}
            styles={styles}
            theme={theme}
          />

          <Text style={styles.sectionTitle}>Mapa</Text>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>Mostrar negócios no mapa</Text>
              <Text style={styles.switchHint}>
                Marca sozinho os negócios da zona que está a ver. Desligar reduz os pedidos
                feitos ao serviço, que é mantido por voluntários.
              </Text>
            </View>
            <Switch
              value={settings.showPlacesOnMap}
              onValueChange={(next) => update('showPlacesOnMap', next)}
              trackColor={{ true: theme.accent, false: theme.border }}
            />
          </View>

          <Text style={styles.sectionTitle}>Acerca</Text>
          <Text style={styles.about}>
            O PalmMap usa apenas serviços abertos e gratuitos, sem Google e sem chaves de
            API. Os dados do mapa são de quem contribui para o OpenStreetMap.
          </Text>

          <Pressable
            style={styles.creditRow}
            onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}
          >
            <Text style={styles.creditName}>OpenStreetMap</Text>
            <Text style={styles.creditRole}>dados do mapa, pesquisa e tiles</Text>
          </Pressable>

          <Pressable
            style={styles.creditRow}
            onPress={() => void Linking.openURL('https://carto.com/attribution')}
          >
            <Text style={styles.creditName}>CARTO</Text>
            <Text style={styles.creditRole}>tiles do mapa em modo escuro</Text>
          </Pressable>

          <View style={styles.creditRow}>
            <Text style={styles.creditName}>OSRM</Text>
            <Text style={styles.creditRole}>cálculo dos percursos</Text>
          </View>

          <View style={styles.creditRow}>
            <Text style={styles.creditName}>Overpass</Text>
            <Text style={styles.creditRole}>negócios e pontos de interesse</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.surface,
      paddingTop: 52,
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
      borderRadius: 16,
      backgroundColor: theme.surfaceMuted,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
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
      borderRadius: 14,
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
    note: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 10,
      lineHeight: 17,
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
