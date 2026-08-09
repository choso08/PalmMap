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
  SATELLITE_DETAILS,
  TIME_ADJUSTMENTS,
  TRAVEL_MODES,
  useSettings,
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
export function SettingsSheet({ visible, onClose, onRecentsCleared }: SettingsSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const { settings, update } = useSettings();
  const [clearing, setClearing] = useState(false);

  const handleClearCache = async () => {
    setClearing(true);
    try {
      await clearMapCache();
      Alert.alert('Mapa guardado apagado', 'As zonas voltam a ser obtidas quando houver rede.');
    } catch {
      Alert.alert('Não foi possível apagar', 'Tente novamente.');
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
            Cada meio tem o seu servidor, por isso a pé ignoram-se os sentidos únicos e o
            tempo é contado a passo de pessoa. Também se pode trocar no painel do percurso,
            sem vir aqui.
          </Text>

          <Text style={styles.sectionTitle}>Tempo estimado</Text>
          <Text style={styles.sectionHint}>
            Se as estradas da sua zona forem mais lentas do que o mapa julga.
          </Text>
          <ChoiceRow
            options={TIME_ADJUSTMENTS}
            value={settings.timeAdjustment}
            onChange={(id) => update('timeAdjustment', id)}
            styles={styles}
            theme={theme}
          />
          <Text style={styles.note}>
            O tempo vem do tipo de estrada e do piso registado no OpenStreetMap. Onde o piso
            não está registado, assume-se estrada alcatroada — e numa estrada de terra
            batida o tempo real pode ser o dobro.
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

          <Text style={styles.sectionTitle}>Detalhe do satélite</Text>
          <Text style={styles.sectionHint}>
            Quanto se aproxima a imagem antes de ficar desfocada.
          </Text>
          <ChoiceRow
            options={SATELLITE_DETAILS}
            value={settings.satelliteDetail}
            onChange={(id) => update('satelliteDetail', id)}
            styles={styles}
            theme={theme}
          />
          <Text style={styles.note}>
            {settings.satelliteDetail === 'alta'
              ? 'Acrescenta as ortofotos oficiais do Estado por cima: vê-se casa a casa, mas só em Portugal e gastando bastantes mais dados. Fora de Portugal fica igual ao normal.'
              : 'Sentinel-2, do programa europeu Copernicus. Cobre o mundo todo e vê a dez metros por pixel — dá a costa, a floresta e os terrenos, não casas uma a uma.'}
          </Text>

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

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>Autocarros a andar</Text>
              <Text style={styles.switchHint}>
                Mostra onde estão os autocarros da Carris Metropolitana, em tempo real, no
                mapa dos transportes. Só aparece com o mapa aproximado.
              </Text>
              {/*
                O custo tem de estar escrito. O serviço não deixa pedir só a área
                que se está a ver — vem a frota toda de cada vez, e é de longe o
                pedido mais pesado que esta aplicação faz.
              */}
              <Text style={styles.switchHint}>
                Gasta bastantes dados: o serviço só sabe dar a frota inteira de cada vez,
                e isso repete-se de vinte em vinte segundos enquanto estiver a ver.
              </Text>
            </View>
            <Switch
              value={settings.showVehicles}
              onValueChange={(next) => update('showVehicles', next)}
              trackColor={{ true: theme.accent, false: theme.border }}
            />
          </View>

          <Text style={styles.sectionTitle}>Mapa guardado</Text>
          <Text style={styles.sectionHint}>
            As zonas por onde passa ficam guardadas e voltam a aparecer sem rede.
          </Text>
          <ChoiceRow
            options={CACHE_SIZES}
            value={settings.cacheSize}
            onChange={(id) => update('cacheSize', id)}
            styles={styles}
            theme={theme}
          />
          <Text style={styles.note}>
            {settings.cacheSize === 'off'
              ? 'Desligado: o mapa é pedido de novo de cada vez, e sem rede não aparece.'
              : 'Quando enche, esquece primeiro o que há mais tempo não vê.'}
          </Text>

          <Pressable
            style={styles.clearButton}
            onPress={() => void handleClearCache()}
            disabled={clearing}
          >
            <MaterialCommunityIcons name="delete-outline" size={18} color={theme.danger} />
            <Text style={styles.clearText}>
              {clearing ? 'A apagar…' : 'Apagar o mapa guardado'}
            </Text>
          </Pressable>

          <Text style={styles.sectionTitle}>Mapas de países</Text>
          <Text style={styles.sectionHint}>
            Guarda o país inteiro de uma vez. Funciona sem rede a qualquer zoom, mesmo em
            sítios onde nunca esteve.
          </Text>
          <OfflineMaps />
          <Text style={styles.note}>
            Descarregue por Wi-Fi: os países maiores têm centenas de megabytes.
          </Text>

          <Text style={styles.sectionTitle}>Horários</Text>
          <Text style={styles.sectionHint}>
            Comboio, metro e barco. Guardados no telemóvel, aparecem nas estações e nos
            trajetos de transportes públicos.
          </Text>
          <Schedules />

          <Text style={styles.sectionTitle}>Navegação</Text>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>Ler as instruções em voz alta</Text>
              <Text style={styles.switchHint}>
                Durante a navegação, anuncia as manobras à medida que se aproximam. Usa a
                voz portuguesa do telemóvel.
              </Text>
            </View>
            <Switch
              value={settings.voiceGuidance}
              onValueChange={(next) => update('voiceGuidance', next)}
              trackColor={{ true: theme.accent, false: theme.border }}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>Avisar de radares</Text>
              <Text style={styles.switchHint}>
                Avisa antes dos radares fixos, dos de semáforo e do controlo de velocidade
                média que estiverem no percurso, com o limite quando ele é conhecido.
              </Text>
            </View>
            <Switch
              value={settings.speedCameraAlerts}
              onValueChange={(next) => update('speedCameraAlerts', next)}
              trackColor={{ true: theme.accent, false: theme.border }}
            />
          </View>
          <Text style={styles.note}>
            Vem do OpenStreetMap, e só apanha o que lá está marcado. Radares móveis não
            aparecem em mapa nenhum — mudam de sítio todos os dias. Isto é uma ajuda, não
            é uma garantia: quem conduz é quem tem de ver os sinais.
          </Text>

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>Evitar portagens</Text>
              <Text style={styles.switchHint}>
                Procura um caminho sem autoestradas com portagem. Costuma dar mais tempo de
                viagem.
              </Text>
            </View>
            <Switch
              value={settings.avoidTolls}
              onValueChange={(next) => update('avoidTolls', next)}
              trackColor={{ true: theme.accent, false: theme.border }}
            />
          </View>
          <Text style={styles.note}>
            O servidor público de percursos pode não ter esta opção instalada. Quando não
            tem, o percurso sai à mesma — e o painel diz que não foi possível evitá-las.
            Não há forma aberta de saber quanto custa cada portagem, por isso o preço não
            é mostrado.
          </Text>

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>Poupar bateria a navegar</Text>
              <Text style={styles.switchHint}>
                Numa reta longa, lê a posição de quatro em quatro segundos em vez de todos
                os segundos. Perto de uma manobra volta ao ritmo normal.
              </Text>
            </View>
            <Switch
              value={settings.batterySaver}
              onValueChange={(next) => update('batterySaver', next)}
              trackColor={{ true: theme.accent, false: theme.border }}
            />
          </View>

          <Text style={styles.sectionTitle}>Últimos destinos</Text>
          <Text style={styles.sectionHint}>
            Aparecem na pesquisa antes de se escrever, a seguir aos guardados.
          </Text>
          <Pressable style={styles.forgetRow} onPress={() => void clearRecents().then(onRecentsCleared)}>
            <MaterialCommunityIcons name="history" size={19} color={theme.danger} />
            <Text style={styles.clearText}>Esquecer os últimos destinos</Text>
          </Pressable>

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
            onPress={() => void Linking.openURL('https://routing.openstreetmap.de/about.html')}
          >
            <Text style={styles.creditName}>OSRM · FOSSGIS</Text>
            <Text style={styles.creditRole}>cálculo dos percursos</Text>
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
