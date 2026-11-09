import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { GestureResponderHandlers } from 'react-native';

import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { TRAVEL_MODES, useEta, useT, useTheme, type TravelMode } from '../settings';
import type { Theme } from '../theme';
import type { Place, Route } from '../types/geo';
import { WALK_DETOUR, WALK_SPEED_MS } from '../services/config';
import type { TransitTrip } from '../services/transit';

/** Each mode's icon, so trips can be told apart at a glance. */
const MEIOS: Record<string, string> = {
  bus: 'bus',
  train: 'train',
  subway: 'subway-variant',
  light_rail: 'tram',
  boat: 'ferry',
};
import { formatDistance, formatDuration } from '../utils/format';

interface RoutePanelProps {
  /**
   * The gestures of the handle at the top, so the panel can be shrunk.
   *
   * They come from `DraggableSheet` — see there why they live on the handle
   * only and not on the whole panel.
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
  /** Whether the person asked to avoid tolls, in Settings. */
  avoidTollsWanted: boolean;
  /** The travel mode in use, and how to change it. */
  travelMode: TravelMode;
  onChangeTravelMode: (mode: TravelMode) => void;
  /** How long the other modes take, for the time on each chip. `null` = no route. */
  modeTimes?: Partial<Record<TravelMode, { distanceMeters: number; durationSeconds: number } | null>>;
  /** Where the route starts, as text ("My location" or a place's name). */
  fromLabel?: string;
  /** Opens the Directions screen to change the start or the destination. */
  onOpenDirections?: () => void;
  /** Stops along the way, in the order they are passed. */
  waypoints: Place[];
  onRemoveWaypoint: (index: number) => void;
  /**
   * Bus trips, when public transport is the chosen mode.
   *
   * `null` means "not this mode"; an empty list means none was found — and
   * those are different things to say.
   */
  transitTrips: TransitTrip[] | null;
  transitTripIndex: number;
  onChooseTransitTrip: (index: number) => void;
  /** Alternative routes, and which one is chosen. */
  options: Route[];
  optionIndex: number;
  onChooseOption: (index: number) => void;
}

/** `HH:MM` from seconds since 1970. */
function relogio(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The walking time for a distance, the same as trip planning uses.
 *
 * Repeated here on purpose rather than imported from the service: the service
 * works in unrounded seconds, this only wants a number to write on screen.
 */
function walkSecondsEntre(meters: number): number {
  return (meters * WALK_DETOUR) / WALK_SPEED_MS;
}

/** The bottom panel with the route's information. */
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
  modeTimes = {},
  fromLabel,
  onOpenDirections,
  waypoints,
  onRemoveWaypoint,
  options,
  optionIndex,
  onChooseOption,
  dragHandlers,
  transitTrips,
  transitTripIndex,
  onChooseTransitTrip,
}: RoutePanelProps) {
  const theme = useTheme();
  const strings = useT();
  const eta = useEta();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  /** The time to show on a mode chip, or `null` while it is not known. */
  const timeFor = (mode: TravelMode): string | null => {
    if (mode === travelMode) {
      if (mode === 'transit') {
        const first = transitTrips?.[0];
        return first
          ? formatDuration(first.reachAt - Math.max(first.leaveAt, Date.now() / 1000))
          : null;
      }
      return route ? formatDuration(eta(route.distanceMeters, route.durationSeconds)) : null;
    }
    const known = modeTimes[mode];
    return known ? formatDuration(eta(known.distanceMeters, known.durationSeconds, null, mode)) : null;
  };

  // The fastest alternative gets the tag, whatever OSRM's order.
  const fastest = options.reduce(
    (best, op, i) =>
      eta(op.distanceMeters, op.durationSeconds) <
      eta(options[best].distanceMeters, options[best].durationSeconds)
        ? i
        : best,
    0,
  );

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
        The travel mode, right above the route.

        It lives here because this is where the decision is made: one picks the
        destination and only then thinks about walking or driving. Tapping
        recalculates at once — and the choice is kept for next time.
      */}
      {fromLabel ? (
        <Pressable style={styles.fromRow} onPress={onOpenDirections} hitSlop={6}>
          <MaterialCommunityIcons name="circle-outline" size={14} color={theme.textMuted} />
          <Text style={styles.fromText} numberOfLines={1}>
            {strings.directions.fromLabel(fromLabel)}
          </Text>
          <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.textMuted} />
        </Pressable>
      ) : null}

      <View style={styles.modos}>
        {TRAVEL_MODES.map((modo) => {
          const ativo = modo.id === travelMode;
          return (
            <Pressable
              key={modo.id}
              style={[styles.modo, ativo ? styles.modoAtivo : null]}
              onPress={() => onChangeTravelMode(modo.id)}
              accessibilityLabel={strings.settings.travelModes[modo.id]}
            >
              <MaterialCommunityIcons
                name={modo.icon as never}
                size={17}
                color={ativo ? theme.onAccent : theme.textMuted}
              />
              <Text
                style={[styles.modoTexto, ativo ? styles.modoTextoAtivo : null]}
                numberOfLines={1}
              >
                {timeFor(modo.id) ?? strings.settings.travelModes[modo.id]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/*
        The stops along the way, in the order they are passed, each removed
        with a tap — otherwise a stop added by mistake meant starting the route
        over.
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
          <Text style={styles.statusText}>{strings.route.calculating}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.status}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={theme.danger} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      {/*
        The bus trips: a single line, or two with one change — see
        `planBusTrips`.

        The first is the one that arrives earliest and carries the recommended
        mark. That is not an opinion: it gets the person there first, counting
        the walk at both ends.
      */}
      {transitTrips && !loading ? (
        <View style={styles.trajetos}>
          {transitTrips.length === 0 && !error ? (
            <Text style={styles.avisoTexto}>{strings.route.noDirectTransit}</Text>
          ) : null}

          {transitTrips.map((t, i) => {
            const ativo = i === transitTripIndex;
            return (
              <Pressable
                key={t.tripId}
                style={[styles.trajeto, ativo ? styles.trajetoAtivo : null]}
                onPress={() => onChooseTransitTrip(i)}
              >
                <View style={styles.trajetoTopo}>
                  {/*
                    The mode's icon. In a list mixing buses and trains, the
                    line number alone does not say what one is getting on.
                  */}
                  <MaterialCommunityIcons
                    name={(MEIOS[t.kind] ?? 'bus') as never}
                    size={16}
                    color={theme.textMuted}
                  />
                  <View style={styles.linhaBadge}>
                    <Text style={styles.linhaBadgeTexto}>{t.line}</Text>
                  </View>
                  {t.change ? (
                    <>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={16}
                        color={theme.textMuted}
                      />
                      {t.change.kind && t.change.kind !== t.kind ? (
                        <MaterialCommunityIcons
                          name={(MEIOS[t.change.kind] ?? 'bus') as never}
                          size={16}
                          color={theme.textMuted}
                        />
                      ) : null}
                      <View style={styles.linhaBadge}>
                        <Text style={styles.linhaBadgeTexto}>{t.change.line}</Text>
                      </View>
                    </>
                  ) : null}
                  <Text style={styles.trajetoDestino} numberOfLines={1}>
                    {t.change ? t.change.headsign : t.headsign}
                  </Text>
                  {i === 0 ? (
                    <View style={styles.melhor}>
                      <Text style={styles.melhorTexto}>{strings.route.best}</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.trajetoHoras}>
                  {relogio(t.departsAt)} – {relogio(t.arrivesAt)} ·{' '}
                  {formatDuration(t.reachAt - Math.max(t.leaveAt, Date.now() / 1000))}
                </Text>

                <Text style={styles.trajetoDetalhe} numberOfLines={3}>
                  {t.live ? '● ' : ''}
                  {strings.route.walkTo(
                    formatDuration(walkSecondsEntre(t.from.meters)),
                    t.from.name,
                  )}
                  {' · '}
                  {strings.route.stopCount(t.stops)}
                  {' · '}
                  {t.change
                    ? `${strings.route.changeAt(
                        t.change.boardAt.id === t.change.at.id
                          ? t.change.at.name
                          : `${t.change.at.name} → ${t.change.boardAt.name}`,
                        formatDuration(t.change.departsAt - t.change.arrivesAt),
                      )} · `
                    : ''}
                  {strings.route.walkFrom(
                    formatDuration(walkSecondsEntre(t.to.meters)),
                    t.to.name,
                  )}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {route ? (
        <>
          {/*
            The routes as a list, as in the maps everyone knows: the time in big
            type, the distance and the main roads underneath. OSRM returns two
            or three for the same destination (with no stops in between — with
            stops it knows only one); the fastest gets the label, and the choice
            is the driver's.
          */}
          <View style={styles.caminhos}>
            {(options.length > 0 ? options : [route]).map((op, i) => {
              const ativo = options.length <= 1 || i === optionIndex;
              return (
                <Pressable
                  key={i}
                  style={[styles.caminho, ativo ? styles.caminhoAtivo : null]}
                  onPress={() => onChooseOption(i)}
                  disabled={options.length <= 1}
                >
                  <View style={styles.caminhoTexto}>
                    <Text style={[styles.caminhoTempo, ativo ? styles.caminhoTempoAtivo : null]}>
                      {formatDuration(eta(op.distanceMeters, op.durationSeconds))}
                    </Text>
                    <Text style={styles.caminhoDetalhe} numberOfLines={1}>
                      {[formatDistance(op.distanceMeters), op.via ? strings.route.via(op.via) : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  {options.length > 1 && i === fastest ? (
                    <View style={styles.melhor}>
                      <Text style={styles.melhorTexto}>{strings.route.fastest}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/*
            A route can only start on a road. Asked from inside an airport, a
            shopping centre or the middle of a field, it starts some way off —
            sometimes on the other side of a fence. Better to say so than leave
            the person staring at a gap between them and the line.
          */}
          {route.startAwayMeters > 40 ? (
            <View style={styles.aviso}>
              <MaterialCommunityIcons
                name="map-marker-distance"
                size={16}
                color={theme.textMuted}
              />
              <Text style={styles.avisoTexto}>
                {strings.route.startsAway(formatDistance(route.startAwayMeters))}
              </Text>
            </View>
          ) : null}

          {/*
            When "avoid tolls" is on but the server could not honour it, say so.
            **Driving only**: walking and cycling never ask for the exclusion,
            and the notice showed every time. Promising a toll-free route and
            sending the person down a paid motorway was the worst of both.
          */}
          {avoidTollsWanted && travelMode === 'driving' && !route.avoidedTolls ? (
            <View style={styles.aviso}>
              <MaterialCommunityIcons
                name="cash-remove"
                size={16}
                color={theme.textMuted}
              />
              <Text style={styles.avisoTexto}>{strings.route.tollsNotAvoided}</Text>
            </View>
          ) : null}

          <View style={styles.botoes}>
            <Pressable style={[styles.button, styles.buttonMain]} onPress={onStart}>
              <MaterialCommunityIcons name="navigation-variant" size={19} color={theme.onAccent} />
              <Text style={styles.buttonText}>{strings.route.start}</Text>
            </Pressable>
            {route.steps.length > 0 ? (
              <Pressable style={[styles.secondaryButton, styles.buttonSide]} onPress={onShowSteps}>
                <MaterialCommunityIcons name="format-list-bulleted" size={18} color={theme.accent} />
                <Text style={styles.secondaryText}>{strings.route.steps}</Text>
              </Pressable>
            ) : null}
          </View>
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
      // Above the system navigation bar.
      paddingBottom: insets.bottom + 24,
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
    caminhos: {
      marginTop: 14,
      gap: 8,
    },
    caminho: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    caminhoAtivo: {
      borderColor: theme.accent,
      borderWidth: 2,
    },
    caminhoTexto: {
      flex: 1,
    },
    caminhoTempo: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
      letterSpacing: -0.4,
    },
    caminhoTempoAtivo: {
      color: theme.open,
    },
    caminhoDetalhe: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 1,
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
    botoes: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 16,
    },
    buttonMain: {
      flex: 1.5,
    },
    buttonSide: {
      flex: 1,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
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
    fromRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
    },
    fromText: {
      flexShrink: 1,
      fontSize: 13,
      color: theme.textMuted,
    },
  });
}
