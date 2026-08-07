import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { GestureResponderHandlers } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { ARRIVALS_REFRESH_MS } from '../services/config';
import {
  STATION_ICONS,
  STATION_LABELS,
  arrivalsAt,
  type TransitArrival,
  type TransitStation,
  type TransitStop,
} from '../services/transit';
import { useTheme } from '../settings';
import type { Theme } from '../theme';
import { formatDistance } from '../utils/format';

interface TransitSheetProps {
  /**
   * Os gestos da barrinha do topo, para o painel poder ser encolhido.
   *
   * Vêm do `DraggableSheet` — ver lá porque é que ficam só na barra e não no
   * painel inteiro.
   */
  dragHandlers?: GestureResponderHandlers;
  /** Paragens perto, já encontradas pelo `App`. */
  stops: TransitStop[];
  /** Estações de comboio, metro, metro de superfície e barco perto. */
  stations: TransitStation[];
  loading: boolean;
  error: string | null;
  /** Está fora da área servida: não é erro, é falta de dados abertos. */
  outside: boolean;
  /** Falta a permissão do GPS, ou ainda não há posição. */
  semPosicao: boolean;
  onClose: () => void;
  /** Traçar o percurso a pé até à paragem. */
  onGoToStop: (stop: TransitStop) => void;
  onSelectedStopChange: (stopId: string | null) => void;
  /** A paragem escolhida no mapa, para a lista abrir a mesma. */
  selectedStopId: string | null;
}

/** "agora" quando está a chegar, senão "4 min". */
function formatWait(minutes: number): string {
  return minutes <= 0 ? 'agora' : `${minutes} min`;
}

/**
 * Paragens perto de si, com a hora a que passa o próximo de cada linha.
 *
 * A fonte é a Carris Metropolitana, que cobre a Área Metropolitana de Lisboa.
 * Fora dessa área não há horários abertos em Portugal — o painel diz isso em vez
 * de mostrar uma lista vazia.
 */
export function TransitSheet({
  stops,
  stations,
  loading,
  error,
  outside,
  semPosicao,
  onClose,
  onGoToStop,
  onSelectedStopChange,
  selectedStopId,
  dragHandlers,
}: TransitSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  /**
   * A paragem aberta vive no `App`, e não aqui, porque também se abre tocando no
   * pino do mapa. Ter duas cópias do mesmo estado dava-as a divergir.
   *
   * A lista das paragens também é de lá, pela mesma razão e por outra: os pinos
   * têm de aparecer no mapa **sem** este painel estar aberto.
   */
  const openStop = selectedStopId;
  const setOpenStop = onSelectedStopChange;
  const [arrivals, setArrivals] = useState<TransitArrival[] | null>(null);
  const [arrivalsError, setArrivalsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * As passagens da paragem aberta.
   *
   * `silencioso` serve para as atualizações automáticas não porem o indicador a
   * rodar de trinta em trinta segundos — o painel ficaria sempre a piscar.
   */
  /** Identifica o pedido mais recente, para ignorar respostas atrasadas. */
  const ultimoPedido = useRef(0);

  const carregarPassagens = useCallback(async (stopId: string, silencioso = false) => {
    const pedido = ultimoPedido.current + 1;
    ultimoPedido.current = pedido;

    if (!silencioso) {
      setArrivals(null);
      setArrivalsError(null);
    }
    setRefreshing(true);
    try {
      const horas = await arrivalsAt(stopId);
      // Trocar de paragem enquanto a anterior estava na fila fazia as horas de
      // uma aparecer por baixo do nome da outra.
      if (ultimoPedido.current !== pedido) {
        return;
      }
      setArrivals(horas);
      setArrivalsError(null);
    } catch {
      if (ultimoPedido.current === pedido) {
        setArrivalsError('Não foi possível obter as horas de passagem.');
      }
    } finally {
      if (ultimoPedido.current === pedido) {
        setRefreshing(false);
      }
    }
  }, []);

  // Enquanto uma paragem está aberta, os minutos vão-se atualizando sozinhos.
  // Sem isto, ficava a dizer "4 min" durante um quarto de hora.
  useEffect(() => {
    if (!openStop) {
      return;
    }
    void carregarPassagens(openStop);

    const timer = setInterval(
      () => void carregarPassagens(openStop, true),
      ARRIVALS_REFRESH_MS,
    );

    return () => clearInterval(timer);
  }, [openStop, carregarPassagens]);

  return (
    <View style={styles.container}>
      <View style={styles.handleZone} {...dragHandlers}>
        <View style={styles.handle} />
      </View>

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Transportes perto de si</Text>
          <Text style={styles.subtitle}>Carris Metropolitana · área de Lisboa</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
          <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text style={styles.loadingText}>A procurar paragens…</Text>
        </View>
      ) : null}

      {!loading && semPosicao ? (
        <Text style={styles.aviso}>
          Sem a sua localização não há como saber que paragens ficam perto. Autorize o
          acesso ao GPS nas definições do telemóvel.
        </Text>
      ) : null}

      {error ? <Text style={styles.erro}>{error}</Text> : null}

      {outside ? (
        <Text style={styles.aviso}>
          Não há horários para esta zona. Só a Área Metropolitana de Lisboa tem os dados
          abertos — no resto do país cada operador guarda os seus. O mapa dos transportes
          continua a mostrar por onde as linhas passam.
        </Text>
      ) : null}

      <ScrollView style={styles.lista} keyboardShouldPersistTaps="handled">
        {stops.map((stop) => {
          const aberta = openStop === stop.id;

          return (
            <View key={stop.id}>
              <Pressable
                style={styles.linha}
                onPress={() => setOpenStop(aberta ? null : stop.id)}
              >
                <MaterialCommunityIcons
                  name="bus-stop"
                  size={22}
                  color={aberta ? theme.accent : theme.textMuted}
                />

                <View style={styles.linhaTexto}>
                  <Text style={styles.nome} numberOfLines={1}>
                    {stop.name}
                  </Text>
                  <Text style={styles.detalhe} numberOfLines={1}>
                    {/*
                      A paragem diz-nos com que meios liga. É o que permite
                      escrever "muda aqui para o comboio" sem cruzar coordenadas.
                    */}
                    {stop.connections
                      .map((c) => LIGACOES[c])
                      .filter(Boolean)
                      .join(' · ')}
                    {stop.connections.length > 0 ? ' · ' : ''}
                    {formatDistance(stop.meters)}
                    {stop.locality ? ` · ${stop.locality}` : ''}
                    {stop.lines.length > 0 ? ` · ${stop.lines.slice(0, 6).join(', ')}` : ''}
                  </Text>
                </View>

                <MaterialCommunityIcons
                  name={aberta ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={theme.textMuted}
                />
              </Pressable>

              {aberta ? (
                <View style={styles.passagens}>
                  {arrivals === null && !arrivalsError ? (
                    <View style={styles.loading}>
                      <ActivityIndicator size="small" color={theme.accent} />
                      <Text style={styles.loadingText}>A ver as horas…</Text>
                    </View>
                  ) : null}

                  {arrivalsError ? <Text style={styles.erro}>{arrivalsError}</Text> : null}

                  {arrivals?.length === 0 ? (
                    <Text style={styles.aviso}>
                      Sem passagens nas próximas duas horas.
                    </Text>
                  ) : null}

                  {(arrivals ?? []).map((a, i) => (
                    <View key={`${a.line}-${a.time}-${i}`} style={styles.passagem}>
                      <View style={styles.linhaBadge}>
                        <Text style={styles.linhaBadgeTexto}>{a.line}</Text>
                      </View>
                      <Text style={styles.destino} numberOfLines={1}>
                        {a.destination}
                      </Text>
                      <View style={styles.espera}>
                        <Text style={styles.esperaTexto}>{formatWait(a.minutes)}</Text>
                        {/*
                          O ponto verde separa o tempo real do horário. Sem ele,
                          "4 min" tanto podia ser o autocarro a chegar como uma
                          previsão de papel — e a diferença é toda.
                        */}
                        <Text style={styles.esperaHora}>
                          {a.live ? '● ' : ''}
                          {a.time}
                        </Text>
                      </View>
                    </View>
                  ))}

                  <View style={styles.acoes}>
                    <Pressable
                      style={styles.acao}
                      onPress={() => void carregarPassagens(stop.id)}
                      disabled={refreshing}
                    >
                      <MaterialCommunityIcons
                        name="refresh"
                        size={16}
                        color={theme.accent}
                      />
                      <Text style={styles.acaoTexto}>Atualizar</Text>
                    </Pressable>

                    <Pressable style={styles.acao} onPress={() => onGoToStop(stop)}>
                      <MaterialCommunityIcons
                        name="walk"
                        size={16}
                        color={theme.accent}
                      />
                      <Text style={styles.acaoTexto}>Ir até à paragem</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
        {/*
          As estações de comboio, metro, metro de superfície e barco.

          **Destas só se sabe onde ficam.** O Fertagus e a CP publicam horários
          em GTFS estático, que é outro caminho; o Metro Sul do Tejo não publica
          nada. Mostrar a estação já vale — dizer que há horários seria mentira.
        */}
        {stations.length > 0 ? (
          <>
            <Text style={styles.seccao}>Estações perto</Text>
            {stations.map((estacao) => (
              <View key={estacao.id} style={styles.linha}>
                <MaterialCommunityIcons
                  name={STATION_ICONS[estacao.kind] as never}
                  size={22}
                  color={theme.poi}
                />
                <View style={styles.linhaTexto}>
                  <Text style={styles.nome} numberOfLines={1}>
                    {estacao.name}
                  </Text>
                  <Text style={styles.detalhe} numberOfLines={1}>
                    {STATION_LABELS[estacao.kind]} · {formatDistance(estacao.meters)}
                    {estacao.locality ? ` · ${estacao.locality}` : ''}
                  </Text>
                </View>
              </View>
            ))}
            <Text style={styles.aviso}>
              Destas só se sabe onde ficam. Os horários do comboio e do metro ainda não
              entram aqui — ver o que falta no ficheiro do projeto.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** Como se escreve cada ligação na linha da paragem. */
const LIGACOES: Record<string, string> = {
  boat: 'Barco',
  light_rail: 'Metro de superfície',
  subway: 'Metro',
  train: 'Comboio',
};

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: insets.bottom + 20,
      // Em pontos e não em percentagem: o painel está posicionado em absoluto,
      // e nesse caso o pai não tem altura definida contra a qual uma
      // percentagem se possa medir.
      maxHeight: Dimensions.get('window').height * 0.72,
      elevation: 12,
      shadowColor: '#000000',
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: -3 },
    },
    handleZone: {
      // Área de toque generosa à volta da barrinha: o alvo visível tem 4 pontos
      // de altura e ninguém acerta nisso com o polegar.
      alignItems: 'center',
      paddingTop: 10,
      marginTop: -10,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      marginBottom: 14,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    headerText: {
      flex: 1,
    },
    title: {
      fontSize: 19,
      fontWeight: '700',
      color: theme.text,
      letterSpacing: -0.3,
    },
    subtitle: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 3,
    },
    closeButton: {
      padding: 4,
      borderRadius: 18,
      backgroundColor: theme.surfaceMuted,
    },
    loading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 14,
    },
    loadingText: {
      fontSize: 14,
      color: theme.textMuted,
    },
    erro: {
      fontSize: 13,
      color: theme.danger,
      marginTop: 12,
      lineHeight: 18,
    },
    aviso: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 12,
      lineHeight: 19,
    },
    seccao: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textMuted,
      marginTop: 18,
      marginBottom: 4,
    },
    lista: {
      marginTop: 8,
    },
    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    linhaTexto: {
      flex: 1,
    },
    nome: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
    },
    detalhe: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2,
    },
    passagens: {
      paddingBottom: 12,
      paddingLeft: 36,
    },
    passagem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 7,
    },
    linhaBadge: {
      minWidth: 46,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: theme.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      alignItems: 'center',
    },
    linhaBadgeTexto: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.accent,
    },
    destino: {
      flex: 1,
      fontSize: 13,
      color: theme.text,
    },
    espera: {
      alignItems: 'flex-end',
    },
    esperaTexto: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
    },
    esperaHora: {
      fontSize: 11,
      color: theme.textMuted,
      marginTop: 1,
    },
    acoes: {
      flexDirection: 'row',
      gap: 18,
      marginTop: 10,
    },
    acao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    acaoTexto: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.accent,
    },
  });
}
