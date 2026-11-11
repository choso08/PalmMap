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

import { t } from '../i18n';
import { ARRIVALS_REFRESH_MS } from '../services/config';
import {
  departuresAtStop,
  departuresNear,
  hasCoverage,
  type ScheduleDeparture,
} from '../services/schedules';
import {
  STATION_ICONS,
  stationLabel,
  arrivalsAt,
  lineJourney,
  TransitError,
  type LineJourney as Journey,
  type TransitArrival,
  type TransitStation,
  type TransitStop,
} from '../services/transit';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import { formatDistance } from '../utils/format';
import { useAppActive } from '../useAppActive';
import type { Coordinates } from '../types/geo';
import { LineJourney } from './LineJourney';

interface TransitSheetProps {
  /**
   * The gestures of the handle at the top, so the panel can be shrunk.
   *
   * They come from `DraggableSheet` — see there why they live on the handle
   * only and not on the whole panel.
   */
  dragHandlers?: GestureResponderHandlers;
  /** Stops nearby, already found by `App`. */
  stops: TransitStop[];
  /** Train, metro, light-rail and boat stations nearby. */
  stations: TransitStation[];
  loading: boolean;
  error: string | null;
  /** Outside the area served: not an error, a lack of open data. */
  outside: boolean;
  /** No GPS permission, or no position yet. */
  semPosicao: boolean;
  onClose: () => void;
  /** Draw the walking route to the stop. */
  onGoToStop: (stop: TransitStop) => void;
  onSelectedStopChange: (stopId: string | null) => void;
  /** The stop chosen on the map, so the list opens the same one. */
  selectedStopId: string | null;
  /** The station tapped on the map, whose departures the panel shows. */
  selectedStationId: string | null;
  /** Where the person is going, if anywhere: a line's journey ends there. */
  destination: Coordinates | null;
  /** The line journey open in the list, for the map to draw; null when closed. */
  onJourneyChange: (journey: Journey | null) => void;
}

/** A station's departures: a timetable-only bus stop by its own id, the rest by place. */
function departuresOf(estacao: TransitStation): ScheduleDeparture[] {
  return estacao.kind === 'bus' ? departuresAtStop(estacao.id) : departuresNear(estacao.coordinates);
}

/** "now" when it is arriving, otherwise "4 min". */
function formatWait(minutes: number): string {
  return minutes <= 0 ? t().transit.now : t().transit.inMinutes(minutes);
}

/**
 * Stops nearby, with when the next of each line comes.
 *
 * The source is Carris Metropolitana, which covers the Lisbon Metropolitan
 * Area. Outside it there are no open timetables in Portugal — the panel says so
 * instead of showing an empty list.
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
  selectedStationId,
  destination,
  onJourneyChange,
  dragHandlers,
}: TransitSheetProps) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  /**
   * The open stop lives in `App`, not here, because it also opens by tapping
   * its pin on the map. Two copies of the same state would drift apart.
   *
   * The stop list lives there too, for the same reason and another: the pins
   * have to show on the map **without** this panel open.
   */
  const openStop = selectedStopId;
  const focusStop = stops.find((s) => s.id === openStop) ?? null;
  const focusStation = stations.find((e) => e.id === selectedStationId) ?? null;
  const [arrivals, setArrivals] = useState<TransitArrival[] | null>(null);
  const [arrivalsError, setArrivalsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * The line tapped in the arrivals list: its stops from here, as Maps shows
   * them (`lineJourney`). Keyed by pattern and timetable time, which survive
   * the thirty-second refresh — the list's order and minutes do not.
   */
  const [journeyKey, setJourneyKey] = useState<string | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyError, setJourneyError] = useState<string | null>(null);
  const journeyRequest = useRef(0);

  const closeJourney = useCallback(() => {
    journeyRequest.current += 1;
    setJourneyKey(null);
    setJourney(null);
    setJourneyLoading(false);
    setJourneyError(null);
    onJourneyChange(null);
  }, [onJourneyChange]);

  const toggleJourney = useCallback(
    async (arrival: TransitArrival, stopId: string) => {
      const key = `${arrival.patternId}|${arrival.scheduledText}`;
      if (key === journeyKey) {
        closeJourney();
        return;
      }
      const request = journeyRequest.current + 1;
      journeyRequest.current = request;
      setJourneyKey(key);
      setJourney(null);
      setJourneyError(null);
      setJourneyLoading(true);
      onJourneyChange(null);
      try {
        const found = await lineJourney(arrival, stopId, destination);
        if (journeyRequest.current !== request) {
          return;
        }
        setJourney(found);
        onJourneyChange(found);
      } catch (error) {
        if (journeyRequest.current === request) {
          setJourneyError(
            error instanceof TransitError ? error.message : t().transit.journeyUnavailable,
          );
        }
      } finally {
        if (journeyRequest.current === request) {
          setJourneyLoading(false);
        }
      }
    },
    [journeyKey, closeJourney, onJourneyChange, destination],
  );

  // Another stop, or none: the journey belonged to the one before.
  useEffect(() => {
    closeJourney();
  }, [openStop]);

  /**
   * The open stop's arrivals.
   *
   * `silencioso` keeps the automatic refreshes from spinning the indicator
   * every thirty seconds — the panel would never stop flickering.
   */
  /** Marks the latest request, to ignore late answers. */
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
      // Switching stops while the previous one was queued put one stop's times
      // under the other's name.
      if (ultimoPedido.current !== pedido) {
        return;
      }
      setArrivals(horas);
      setArrivalsError(null);
    } catch {
      if (ultimoPedido.current === pedido) {
        setArrivalsError(t().transit.timesFailed);
      }
    } finally {
      if (ultimoPedido.current === pedido) {
        setRefreshing(false);
      }
    }
  }, []);

  /**
   * The open station, and its times.
   *
   * Unlike bus stops, this asks the Internet for nothing: it reads the
   * timetable kept on the phone, so it answers at once and works offline.
   * `temHorario` tells apart the two reasons for having no times — no file, or
   * nothing passing in the next two hours.
   */
  const [openStation, setOpenStation] = useState<string | null>(null);
  const [departures, setDepartures] = useState<ScheduleDeparture[]>([]);
  const [temHorario, setTemHorario] = useState(false);
  const estacaoAberta = useRef<TransitStation | null>(null);

  const abrirEstacao = useCallback((estacao: TransitStation | null) => {
    estacaoAberta.current = estacao;
    setOpenStation(estacao?.id ?? null);
    if (!estacao) {
      setDepartures([]);
      return;
    }
    setTemHorario(hasCoverage(estacao.coordinates));
    setDepartures(departuresOf(estacao));
  }, []);

  // The station tapped on the map opens straight away.
  useEffect(() => {
    abrirEstacao(stations.find((e) => e.id === selectedStationId) ?? null);
  }, [selectedStationId, stations, abrirEstacao]);

  // The minutes left are counted from the clock, so they need recounting now
  // and then — otherwise it would say "8 min" forever.
  // Not in the background: nobody reads the minutes there (`useAppActive`).
  const appActive = useAppActive();
  useEffect(() => {
    if (!openStation || !appActive) {
      return;
    }
    const timer = setInterval(() => {
      const estacao = estacaoAberta.current;
      if (estacao) {
        setDepartures(departuresOf(estacao));
      }
    }, ARRIVALS_REFRESH_MS);

    return () => clearInterval(timer);
  }, [openStation, appActive]);

  // While a stop is open, the minutes keep themselves up to date. Without
  // this it said "4 min" for a quarter of an hour.
  useEffect(() => {
    if (!openStop || !appActive) {
      return;
    }
    // Also on coming back to the screen: the minutes shown are old by then.
    void carregarPassagens(openStop);

    const timer = setInterval(
      () => void carregarPassagens(openStop, true),
      ARRIVALS_REFRESH_MS,
    );

    return () => clearInterval(timer);
  }, [openStop, carregarPassagens, appActive]);

  return (
    <View style={styles.container}>
      <View style={styles.handleZone} {...dragHandlers}>
        <View style={styles.handle} />
      </View>

      {/*
        The panel is about the one stop or station tapped on the map (author's
        request, November 2026: the list of everything nearby, behind a clock
        button, was not used). Its name is the title; no list row to open.
      */}
      <View style={styles.header}>
        <MaterialCommunityIcons
          name={(focusStation ? STATION_ICONS[focusStation.kind] : 'bus-stop') as never}
          size={24}
          color={theme.accent}
          style={styles.headerIcon}
        />
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={2}>
            {focusStop?.name ?? focusStation?.name ?? strings.transit.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {focusStop
              ? [
                  focusStop.locality,
                  focusStop.lines.slice(0, 8).join(', '),
                ]
                  .filter(Boolean)
                  .join(' · ')
              : focusStation
                ? [stationLabel(focusStation.kind), focusStation.locality]
                    .filter(Boolean)
                    .join(' · ')
                : strings.transit.subtitle}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
          <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
        </Pressable>
      </View>

      {loading && !focusStop && !focusStation ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text style={styles.loadingText}>{strings.transit.searching}</Text>
        </View>
      ) : null}

      {!loading && semPosicao && !focusStop && !focusStation ? (
        <Text style={styles.aviso}>{strings.transit.noPosition}</Text>
      ) : null}

      {error ? <Text style={styles.erro}>{error}</Text> : null}

      {outside && !focusStop && !focusStation ? (
        <Text style={styles.aviso}>{strings.transit.outsideArea}</Text>
      ) : null}

      <ScrollView style={styles.lista} keyboardShouldPersistTaps="handled">
        {stops.map((stop) => {
          const aberta = openStop === stop.id;

          return (
            <View key={stop.id}>

              {aberta ? (
                <View style={styles.passagens}>
                  {arrivals === null && !arrivalsError ? (
                    <View style={styles.loading}>
                      <ActivityIndicator size="small" color={theme.accent} />
                      <Text style={styles.loadingText}>{strings.transit.loadingTimes}</Text>
                    </View>
                  ) : null}

                  {arrivalsError ? <Text style={styles.erro}>{arrivalsError}</Text> : null}

                  {arrivals?.length === 0 ? (
                    <Text style={styles.aviso}>
                      {strings.transit.noneSoon}
                    </Text>
                  ) : null}

                  {(arrivals ?? []).map((a, i) => {
                    const key = `${a.patternId}|${a.scheduledText}`;
                    const open = key === journeyKey;
                    return (
                    <View key={`${a.line}-${a.time}-${i}`}>
                    <Pressable
                      style={styles.passagem}
                      onPress={() => void toggleJourney(a, stop.id)}
                      disabled={!a.patternId}
                    >
                      <View style={styles.linhaBadge}>
                        <Text style={styles.linhaBadgeTexto}>{a.line}</Text>
                      </View>
                      <Text style={styles.destino} numberOfLines={1}>
                        {a.destination}
                      </Text>
                      <View style={styles.espera}>
                        <Text style={styles.esperaTexto}>{formatWait(a.minutes)}</Text>
                        {/*
                          The green dot tells real time from timetable. Without
                          it, "4 min" could be the bus arriving or a paper
                          forecast — and that is the whole difference.
                        */}
                        <Text style={styles.esperaHora}>
                          {a.live ? '● ' : ''}
                          {a.time}
                        </Text>
                      </View>
                    </Pressable>
                    {open ? (
                      <LineJourney
                        journey={journey}
                        loading={journeyLoading}
                        error={journeyError}
                      />
                    ) : null}
                    </View>
                    );
                  })}

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
                      <Text style={styles.acaoTexto}>{strings.common.refresh}</Text>
                    </Pressable>

                    <Pressable style={styles.acao} onPress={() => onGoToStop(stop)}>
                      <MaterialCommunityIcons
                        name="walk"
                        size={16}
                        color={theme.accent}
                      />
                      <Text style={styles.acaoTexto}>{strings.transit.goToStop}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
        {/*
          Train, metro, light-rail and boat stations.

          The locations always come from the Carris API. **Times only show if
          that operator's timetable is downloaded** — they come from the
          converted static GTFS kept on the phone. Without it, the station shows
          with the reason there are no times, instead of an empty list.
        */}
        {stations.length > 0 ? (
          <>
            {stations.map((estacao) => {
              const aberta = openStation === estacao.id;

              return (
                <View key={estacao.id}>

                  {aberta ? (
                    <View style={styles.passagens}>
                      {departures.length === 0 ? (
                        <Text style={styles.aviso}>
                          {temHorario
                            ? strings.transit.noneSoon
                            : strings.transit.noScheduleHere}
                        </Text>
                      ) : null}

                      {departures.map((d) => (
                        <View key={d.key} style={styles.passagem}>
                          <View style={styles.linhaBadge}>
                            <Text style={styles.linhaBadgeTexto}>{d.line}</Text>
                          </View>
                          <Text style={styles.destino} numberOfLines={1}>
                            {d.destination}
                          </Text>
                          <View style={styles.espera}>
                            <Text style={styles.esperaTexto}>{formatWait(d.minutes)}</Text>
                            <Text style={styles.esperaHora}>{d.time}</Text>
                          </View>
                        </View>
                      ))}

                      {/*
                        Always say this is the timetable and not the train. The
                        buses above get a green dot because they are real time;
                        these do not, and that is the whole difference.
                      */}
                      {departures.length > 0 ? (
                        <Text style={styles.aviso}>
                          {strings.transit.scheduleOnly}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </>
        ) : null}
      </ScrollView>
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
      paddingBottom: insets.bottom + 20,
      // In points, not a percentage: the panel is absolutely positioned, and
      // then the parent has no defined height to measure a percentage against.
      maxHeight: Dimensions.get('window').height * 0.72,
      elevation: 12,
      shadowColor: '#000000',
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: -3 },
    },
    handleZone: {
      // A generous touch area around the handle: the visible target is 4 points
      // tall and nobody hits that with a thumb.
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
    headerIcon: {
      marginRight: 10,
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
