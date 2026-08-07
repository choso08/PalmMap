import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { GestureResponderHandlers } from 'react-native';

import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { TRAVEL_MODES, useTheme, useTimeFactor, type TravelMode } from '../settings';
import type { Theme } from '../theme';
import type { Place, Route } from '../types/geo';
import { WALK_DETOUR, WALK_SPEED_MS } from '../services/config';
import type { BusTrip } from '../services/transit';
import { formatDistance, formatDuration } from '../utils/format';

interface RoutePanelProps {
  /**
   * Os gestos da barrinha do topo, para o painel poder ser encolhido.
   *
   * Vêm do `DraggableSheet` — ver lá porque é que ficam só na barra e não no
   * painel inteiro.
   */
  dragHandlers?: GestureResponderHandlers;
  destination: Place;
  route: Route | null;
  loading: boolean;
  error: string | null;
  onClear: () => void;
  onShowSteps: () => void;
  onStart: () => void;
  favourite: boolean;
  onToggleFavourite: () => void;
  /** Se a pessoa pediu para evitar portagens, nas definições. */
  avoidTollsWanted: boolean;
  /** O meio de transporte em uso, e como o trocar. */
  travelMode: TravelMode;
  onChangeTravelMode: (mode: TravelMode) => void;
  /** Paragens pelo caminho, pela ordem por que se passa por elas. */
  waypoints: Place[];
  onRemoveWaypoint: (index: number) => void;
  /**
   * Trajetos de autocarro, quando o meio escolhido são os transportes.
   *
   * `null` quer dizer "não é este o meio"; uma lista vazia quer dizer que não se
   * encontrou nenhum — e são coisas diferentes de dizer.
   */
  busTrips: BusTrip[] | null;
  busTripIndex: number;
  onChooseBusTrip: (index: number) => void;
  /** Caminhos alternativos, e qual está escolhido. */
  options: Route[];
  optionIndex: number;
  onChooseOption: (index: number) => void;
}

/** `HH:MM` a partir de segundos desde 1970. */
function relogio(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * O tempo a pé para uma distância, igual ao que o planeamento usa.
 *
 * Repetido aqui de propósito e não importado do serviço: o serviço trabalha em
 * segundos e sem arredondamentos, isto só quer um número para escrever no ecrã.
 */
function walkSecondsEntre(meters: number): number {
  return (meters * WALK_DETOUR) / WALK_SPEED_MS;
}

/** Painel inferior com a informação do percurso. */
export function RoutePanel({
  destination,
  route,
  loading,
  error,
  onClear,
  onShowSteps,
  onStart,
  favourite,
  onToggleFavourite,
  avoidTollsWanted,
  travelMode,
  onChangeTravelMode,
  waypoints,
  onRemoveWaypoint,
  options,
  optionIndex,
  onChooseOption,
  dragHandlers,
  busTrips,
  busTripIndex,
  onChooseBusTrip,
}: RoutePanelProps) {
  const theme = useTheme();
  const timeFactor = useTimeFactor();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  return (
    <View style={styles.container}>
      <View style={styles.handleZone} {...dragHandlers}>
        <View style={styles.handle} />
      </View>

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>
            {destination.name}
          </Text>
          <Text style={styles.address} numberOfLines={1}>
            {destination.address}
          </Text>
        </View>
        <Pressable onPress={onToggleFavourite} hitSlop={12} style={styles.closeButton}>
          <MaterialCommunityIcons
            name={favourite ? 'star' : 'star-outline'}
            size={20}
            color={favourite ? theme.poi : theme.textMuted}
          />
        </Pressable>
        <Pressable onPress={onClear} hitSlop={12} style={styles.closeButton}>
          <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
        </Pressable>
      </View>

      {/*
        O meio de transporte, mesmo por cima do percurso.
        
        Está aqui e não só nas definições porque é aqui que a decisão se toma: a
        pessoa escolhe o destino e só então pensa se vai a pé ou de carro.
        Carregar recalcula na hora — e a escolha fica guardada para a próxima.
      */}
      <View style={styles.modos}>
        {TRAVEL_MODES.map((modo) => {
          const ativo = modo.id === travelMode;
          return (
            <Pressable
              key={modo.id}
              style={[styles.modo, ativo ? styles.modoAtivo : null]}
              onPress={() => onChangeTravelMode(modo.id)}
            >
              <MaterialCommunityIcons
                name={modo.icon as never}
                size={17}
                color={ativo ? theme.onAccent : theme.textMuted}
              />
              <Text style={[styles.modoTexto, ativo ? styles.modoTextoAtivo : null]}>
                {modo.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/*
        As paragens pelo caminho. Aparecem pela ordem por que se passa por elas,
        e cada uma sai com um toque — sem isto, uma paragem posta por engano
        obrigava a começar o percurso de novo.
      */}
      {waypoints.length > 0 ? (
        <View style={styles.paragens}>
          {waypoints.map((w, i) => (
            <View key={`${w.id}-${i}`} style={styles.paragem}>
              <MaterialCommunityIcons
                name="map-marker-path"
                size={16}
                color={theme.textMuted}
              />
              <Text style={styles.paragemNome} numberOfLines={1}>
                {w.name}
              </Text>
              <Pressable onPress={() => onRemoveWaypoint(i)} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={16} color={theme.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {loading ? (
        <View style={styles.status}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text style={styles.statusText}>A calcular o percurso…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.status}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={theme.danger} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      {/*
        Os trajetos de autocarro. Cada um é uma linha só, sem transbordos — ver
        `planBusTrips`, que explica porquê.

        O primeiro é o que chega mais cedo, e leva a marca de recomendado. Não é
        opinião: é o que põe a pessoa no destino primeiro, contando com o tempo
        a pé das duas pontas.
      */}
      {busTrips && !loading ? (
        <View style={styles.trajetos}>
          {busTrips.length === 0 && !error ? (
            <Text style={styles.avisoTexto}>
              Nenhum autocarro faz este caminho sem mudanças. Por agora só se procuram
              linhas diretas da Carris Metropolitana.
            </Text>
          ) : null}

          {busTrips.map((t, i) => {
            const ativo = i === busTripIndex;
            return (
              <Pressable
                key={t.tripId}
                style={[styles.trajeto, ativo ? styles.trajetoAtivo : null]}
                onPress={() => onChooseBusTrip(i)}
              >
                <View style={styles.trajetoTopo}>
                  <View style={styles.linhaBadge}>
                    <Text style={styles.linhaBadgeTexto}>{t.line}</Text>
                  </View>
                  <Text style={styles.trajetoDestino} numberOfLines={1}>
                    {t.headsign}
                  </Text>
                  {i === 0 ? (
                    <View style={styles.melhor}>
                      <Text style={styles.melhorTexto}>melhor</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.trajetoHoras}>
                  {relogio(t.departsAt)} – {relogio(t.arrivesAt)} ·{' '}
                  {formatDuration(t.reachAt - Math.max(t.leaveAt, Date.now() / 1000))}
                </Text>

                <Text style={styles.trajetoDetalhe} numberOfLines={2}>
                  {t.live ? '● ' : ''}
                  {formatDuration(walkSecondsEntre(t.from.meters))} a pé até {t.from.name}
                  {' · '}
                  {t.stops} paragens
                  {' · '}
                  {formatDuration(walkSecondsEntre(t.to.meters))} a pé de {t.to.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {route ? (
        <>
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{formatDuration(route.durationSeconds * timeFactor)}</Text>
              <Text style={styles.metricLabel}>tempo estimado</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{formatDistance(route.distanceMeters)}</Text>
              <Text style={styles.metricLabel}>distância</Text>
            </View>
          </View>

          {/*
            Os caminhos alternativos. O OSRM devolve dois ou três para o mesmo
            destino; o primeiro é o que ele prefere, mas quem conduz é que sabe.

            Não aparecem com paragens pelo caminho: o serviço só sabe procurar
            alternativas entre dois pontos.
          */}
          {options.length > 1 ? (
            <View style={styles.alternativas}>
              {options.map((op, i) => {
                const ativo = i === optionIndex;
                return (
                  <Pressable
                    key={i}
                    style={[styles.alternativa, ativo ? styles.alternativaAtiva : null]}
                    onPress={() => onChooseOption(i)}
                  >
                    <Text
                      style={[
                        styles.alternativaTempo,
                        ativo ? styles.alternativaTextoAtivo : null,
                      ]}
                    >
                      {formatDuration(op.durationSeconds * timeFactor)}
                    </Text>
                    <Text
                      style={[
                        styles.alternativaDistancia,
                        ativo ? styles.alternativaTextoAtivo : null,
                      ]}
                    >
                      {formatDistance(op.distanceMeters)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/*
            O percurso só pode começar numa estrada. Quem o pede de dentro de um
            aeroporto, de um centro comercial ou do meio do campo fica com o
            inicio a alguma distância — e às vezes do outro lado de uma vedação.
            Mais vale dizê-lo do que deixar a pessoa a olhar para um vazio entre
            ela e a linha.
          */}
          {route.startAwayMeters > 40 ? (
            <View style={styles.aviso}>
              <MaterialCommunityIcons
                name="map-marker-distance"
                size={16}
                color={theme.textMuted}
              />
              <Text style={styles.avisoTexto}>
                O percurso começa a {formatDistance(route.startAwayMeters)} de si, na estrada
                mais próxima. Esse bocado é a tracejado no mapa e fica por sua conta.
              </Text>
            </View>
          ) : null}

          {/*
            Quando a definição de evitar portagens está ligada mas o servidor não
            a soube cumprir, diz-se. **Só de carro**: a pé e de bicicleta a
            exclusão nem chega a ser pedida, e o aviso aparecia sempre. Prometer um caminho sem portagens e mandar a
            pessoa por uma autoestrada paga era o pior dos dois mundos.
          */}
          {avoidTollsWanted && travelMode === 'driving' && !route.avoidedTolls ? (
            <View style={styles.aviso}>
              <MaterialCommunityIcons
                name="cash-remove"
                size={16}
                color={theme.textMuted}
              />
              <Text style={styles.avisoTexto}>
                Não foi possível evitar as portagens: o serviço público de percursos não
                tem essa opção. Este caminho pode passar por autoestradas pagas.
              </Text>
            </View>
          ) : null}

          <Pressable style={styles.button} onPress={onStart}>
            <MaterialCommunityIcons name="navigation-variant" size={19} color={theme.onAccent} />
            <Text style={styles.buttonText}>Iniciar navegação</Text>
          </Pressable>

          {route.steps.length > 0 ? (
            <Pressable style={styles.secondaryButton} onPress={onShowSteps}>
              <MaterialCommunityIcons name="routes" size={18} color={theme.accent} />
              <Text style={styles.secondaryText}>Ver instruções</Text>
              <View style={styles.count}>
                <Text style={styles.countText}>{route.steps.length}</Text>
              </View>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      paddingHorizontal: 20,
      paddingTop: 10,
      // Acima da barra de navegação do sistema.
      paddingBottom: insets.bottom + 24,
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
    name: {
      fontSize: 19,
      fontWeight: '700',
      color: theme.text,
      letterSpacing: -0.3,
    },
    address: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 3,
    },
    closeButton: {
      padding: 4,
      borderRadius: 18,
      backgroundColor: theme.surfaceMuted,
    },
    status: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 16,
    },
    statusText: {
      fontSize: 14,
      color: theme.textMuted,
    },
    error: {
      flex: 1,
      fontSize: 14,
      color: theme.danger,
    },
    paragens: {
      marginTop: 12,
      gap: 6,
    },
    paragem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: theme.surfaceMuted,
    },
    paragemNome: {
      flex: 1,
      fontSize: 13,
      color: theme.text,
    },
    trajetos: {
      marginTop: 14,
      gap: 8,
    },
    trajeto: {
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 16,
      backgroundColor: theme.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    trajetoAtivo: {
      borderColor: theme.accent,
      borderWidth: 1.5,
    },
    trajetoTopo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    linhaBadge: {
      minWidth: 46,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: theme.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      alignItems: 'center',
    },
    linhaBadgeTexto: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.accent,
    },
    trajetoDestino: {
      flex: 1,
      fontSize: 13,
      color: theme.text,
    },
    melhor: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: theme.accent,
    },
    melhorTexto: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.onAccent,
    },
    trajetoHoras: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
      marginTop: 7,
    },
    trajetoDetalhe: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 3,
      lineHeight: 17,
    },
    alternativas: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 14,
    },
    alternativa: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 9,
      borderRadius: 14,
      backgroundColor: theme.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    alternativaAtiva: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    alternativaTempo: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.text,
    },
    alternativaDistancia: {
      fontSize: 11,
      color: theme.textMuted,
      marginTop: 1,
    },
    alternativaTextoAtivo: {
      color: theme.onAccent,
    },
    modos: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 14,
    },
    modo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      borderRadius: 14,
      backgroundColor: theme.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    modoAtivo: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    modoTexto: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textMuted,
    },
    modoTextoAtivo: {
      color: theme.onAccent,
    },
    aviso: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: theme.surfaceMuted,
    },
    avisoTexto: {
      flex: 1,
      fontSize: 12,
      lineHeight: 17,
      color: theme.textMuted,
    },
    metrics: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 18,
    },
    metric: {
      flex: 1,
    },
    separator: {
      width: StyleSheet.hairlineWidth,
      height: 34,
      backgroundColor: theme.border,
      marginHorizontal: 18,
    },
    metricValue: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.text,
      letterSpacing: -0.5,
    },
    metricLabel: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 3,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 20,
      backgroundColor: theme.accent,
      borderRadius: 18,
      paddingVertical: 15,
    },
    buttonText: {
      color: theme.onAccent,
      fontSize: 16,
      fontWeight: '700',
    },
    secondaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 10,
      borderRadius: 18,
      paddingVertical: 13,
      backgroundColor: theme.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    secondaryText: {
      color: theme.accent,
      fontSize: 15,
      fontWeight: '700',
    },
    count: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
    },
    countText: {
      color: theme.accent,
      fontSize: 12,
      fontWeight: '700',
    },
  });
}
