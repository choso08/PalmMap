import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  useSafeAreaInsets,
  type EdgeInsets,
} from "react-native-safe-area-context";

import { SPEED_OVER_LIMIT_KMH } from "../services/config";
import { SpeedBadge } from "./SpeedBadge";
import { useEta, useTheme, useT } from "../settings";
import type { Theme } from "../theme";
import type { Lane, RouteStep } from "../types/geo";
import { formatDistance, formatDuration } from "../utils/format";

interface NavigationPanelProps {
  /** A manobra que vem a seguir. */
  step: RouteStep | null;
  /** The one after it, when the two come close together. */
  thenStep: RouteStep | null;
  /** The limit of the road being driven (OSM), or `null` when not known. */
  roadLimit: number | null;
  /** The camera has let go of the car: show "Re-centre". */
  cameraFree: boolean;
  onRecenter: () => void;
  /** Frame the rest of the route. */
  onOverview: () => void;
  /** Distância até essa manobra, em metros. */
  distanceToStep: number;
  /** Quanto falta até ao destino. */
  remainingMeters: number;
  remainingSeconds: number;
  /** Verdadeiro enquanto se recalcula o percurso por se ter saído dele. */
  recalculating: boolean;
  /** Radar à frente, quando já está perto o suficiente para avisar. */
  camera: {
    label: string;
    icon: string;
    maxspeed: number | null;
    meters: number;
  } | null;
  /**
   * A que velocidade se vai, já em km/h, ou `null` quando não se sabe.
   *
   * `null` é mesmo "não sei" e não "parado": o velocímetro desaparece em vez de
   * mostrar zero. Num túnel, mostrar zero a quem vai a 100 seria pior do que
   * não mostrar nada.
   */
  speedKmh: number | null;
  /**
   * O ritmo medido nesta viagem, ou `null` enquanto ainda não se andou o
   * suficiente para o medir. Ver `useEta`.
   */
  pace: number | null;
  onStop: () => void;
}

/**
 * Ecrã de navegação: a manobra seguinte em grande, com a distância a que está.
 *
 * A barra de cima é o que se lê a conduzir, por isso é o maior elemento da
 * aplicação toda. A de baixo tem o que falta e o botão de terminar.
 */
/** How far before a manoeuvre its lanes are shown. */
const LANES_SHOW_METERS = 1500;

/**
 * The arrow for a lane — `shown`, picked in `osrm.ts`: of the arrows painted
 * on it, the one the route uses.
 */
function laneIcon(lane: Lane): string {
  switch (lane.shown) {
    case "left":
      return "arrow-left-top-bold";
    case "right":
      return "arrow-right-top-bold";
    case "slight left":
      return "arrow-top-left-thick";
    case "slight right":
      return "arrow-top-right-thick";
    case "sharp left":
      return "arrow-bottom-left";
    case "sharp right":
      return "arrow-bottom-right";
    case "uturn":
      return "arrow-u-left-top-bold";
    default:
      return "arrow-up-bold";
  }
}

export function NavigationPanel({
  step,
  thenStep,
  roadLimit,
  cameraFree,
  onRecenter,
  onOverview,
  distanceToStep,
  remainingMeters,
  remainingSeconds,
  recalculating,
  camera,
  speedKmh,
  pace,
  onStop,
}: NavigationPanelProps) {
  const theme = useTheme();
  const strings = useT();
  const eta = useEta();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  /**
   * Vai-se depressa de mais?
   *
   * The limit is the camera's when one is close (it is the one being
   * enforced), otherwise the road's own from OSM's `maxspeed`. Where neither is
   * known the speedometer is just a number — painting it red against a guessed
   * limit would be promising what is not there.
   */
  const limit = camera?.maxspeed ?? roadLimit;
  const overLimit =
    speedKmh !== null &&
    limit != null &&
    speedKmh > limit + SPEED_OVER_LIMIT_KMH;

  const seconds = eta(remainingMeters, remainingSeconds, pace);
  const chegada = new Date(Date.now() + seconds * 1000);
  const arrival = `${chegada.getHours()}:${String(chegada.getMinutes()).padStart(2, "0")}`;

  return (
    <>
      {/* Banner, "Then" and the camera warning stack in one column. */}
      <View style={styles.top} pointerEvents="box-none">
        <View style={styles.banner}>
          {recalculating ? (
            <View style={styles.recalculating}>
              <MaterialCommunityIcons
                name="sync"
                size={26}
                color={theme.onAccent}
              />
              <Text style={styles.recalculatingText}>
                {strings.navigation.recalculating}
              </Text>
            </View>
          ) : step ? (
            <View style={styles.bannerRow}>
              <MaterialCommunityIcons
                name={step.icon as never}
                size={44}
                color={theme.onAccent}
              />
              <View style={styles.bannerText}>
                <Text style={styles.distance}>
                  {formatDistance(distanceToStep)}
                </Text>
                <Text style={styles.instruction} numberOfLines={2}>
                  {step.instruction}
                </Text>
              </View>
            </View>
          ) : null}
          {/*
            The lanes, as in the Maps and Waze: the arrows of each lane, with
            the ones that lead where the route goes lit. Only close to the
            manoeuvre — two kilometres out, which lane does not matter yet.
          */}
          {!recalculating && step?.lanes && step.lanes.length > 1 &&
          distanceToStep <= LANES_SHOW_METERS ? (
            <View style={styles.lanes}>
              {step.lanes.map((lane, i) => (
                <View
                  key={i}
                  style={[styles.lane, !lane.valid && styles.laneOff]}
                >
                  <MaterialCommunityIcons
                    name={laneIcon(lane) as never}
                    size={24}
                    color={theme.onAccent}
                  />
                </View>
              ))}
            </View>
          ) : null}
          {recalculating || step ? null : (
            <Text style={styles.instruction}>
              {strings.navigation.following}
            </Text>
          )}
        </View>

        {/*
        "Then", as in the Maps: a tab hanging under the banner with the
        manoeuvre straight after, so a roundabout right after a turn is not a
        surprise.
      */}
        {thenStep && !recalculating ? (
          <View style={styles.then}>
            <Text style={styles.thenText}>{strings.navigation.then}</Text>
            <MaterialCommunityIcons
              name={thenStep.icon as never}
              size={20}
              color={theme.onAccent}
            />
          </View>
        ) : null}

        {/*
        O aviso do radar fica logo por baixo da manobra, e não em cima dela: o
        que manda é sempre para onde se vira. Aparece só quando o radar já está
        perto, e desaparece assim que se passa por ele.
      */}
        {camera ? (
          <View style={styles.camera}>
            <MaterialCommunityIcons
              name={camera.icon as never}
              size={22}
              color={theme.onOverlay}
            />
            <Text style={styles.cameraText} numberOfLines={1}>
              {camera.label} a {formatDistance(camera.meters)}
            </Text>
            {camera.maxspeed ? (
              <View style={styles.limite}>
                <Text style={styles.limiteText}>{camera.maxspeed}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/*
        O velocímetro, do lado oposto ao botão de voltar à posição e à mesma
        altura. Fica fora do painel de baixo de propósito: aquele é informação da
        viagem, este é o instante — e a conduzir procura-se sempre no mesmo sítio.

        O desenho vive no `SpeedBadge` porque também aparece fora da navegação,
        a andar de carro sem destino escolhido.
      */}
      <SpeedBadge
        kmh={speedKmh}
        overLimit={overLimit}
        bottom={insets.bottom + 130}
      />

      {/*
        The road's limit, as a road sign beside the speedometer — Waze's most
        useful habit. Only when OSM has it for this road.
      */}
      {limit != null ? (
        <View style={styles.limitSign}>
          <Text style={styles.limiteText}>{limit}</Text>
        </View>
      ) : null}

      {cameraFree ? (
        <Pressable
          style={({ pressed }) => [styles.recenter, pressed && styles.pressed]}
          onPress={onRecenter}
        >
          <MaterialCommunityIcons
            name="navigation"
            size={18}
            color={theme.accent}
          />
          <Text style={styles.recenterText}>{strings.navigation.recenter}</Text>
        </Pressable>
      ) : null}

      {/*
        The footer as in the Maps: finish on the left, the time left in big
        green in the middle with the distance and the arrival time under it,
        and the whole route on the right.
      */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.roundButton,
            styles.stopButton,
            pressed && styles.pressed,
          ]}
          onPress={onStop}
          accessibilityLabel={strings.navigation.finish}
        >
          <MaterialCommunityIcons
            name="close"
            size={24}
            color={theme.onAccent}
          />
        </Pressable>

        <View style={styles.summary}>
          <Text style={styles.remaining}>{formatDuration(seconds)}</Text>
          <Text style={styles.remainingLabel}>
            {formatDistance(remainingMeters)} · {arrival}
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.roundButton,
            styles.overviewButton,
            pressed && styles.pressed,
          ]}
          onPress={onOverview}
          accessibilityLabel={strings.navigation.overview}
        >
          <MaterialCommunityIcons
            name="map-marker-path"
            size={24}
            color={theme.text}
          />
        </Pressable>
      </View>
    </>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    top: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
    },
    banner: {
      backgroundColor: theme.accent,
      paddingTop: insets.top + 14,
      paddingBottom: 20,
      paddingHorizontal: 20,
      borderBottomLeftRadius: 22,
      borderBottomRightRadius: 22,
      elevation: 10,
      shadowColor: "#000000",
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
    },
    bannerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
    },
    bannerText: {
      flex: 1,
    },
    distance: {
      fontSize: 32,
      fontWeight: "800",
      color: theme.onAccent,
      letterSpacing: -0.8,
    },
    instruction: {
      fontSize: 17,
      fontWeight: "600",
      color: theme.onAccent,
      marginTop: 2,
    },
    recalculating: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    recalculatingText: {
      fontSize: 17,
      fontWeight: "600",
      color: theme.onAccent,
    },
    camera: {
      // Logo abaixo da barra da manobra (e do "Depois", quando há).
      marginHorizontal: 16,
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: theme.overlay,
    },
    cameraText: {
      flex: 1,
      color: theme.onOverlay,
      fontSize: 14,
      fontWeight: "600",
    },
    lanes: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 4,
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.onAccent,
    },
    lane: {
      width: 36,
      height: 34,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    laneOff: {
      opacity: 0.35,
    },
    limitSign: {
      position: "absolute",
      // Beside the speedometer (64 wide at left 16), level with it.
      left: 16 + 64 + 8,
      bottom: insets.bottom + 138,
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.signFace,
      borderWidth: 4,
      borderColor: theme.signEdge,
      elevation: 6,
    },
    limite: {
      minWidth: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.signFace,
      borderWidth: 3,
      // O vermelho do sinal de limite de velocidade, que se lê num instante.
      borderColor: theme.signEdge,
    },
    limiteText: {
      color: theme.signInk,
      fontSize: 14,
      fontWeight: "800",
    },
    then: {
      // Just under the banner, like a tab hanging from it.
      alignSelf: "flex-start",
      marginLeft: 24,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderBottomLeftRadius: 14,
      borderBottomRightRadius: 14,
      backgroundColor: theme.accentDeep,
      elevation: 9,
    },
    thenText: {
      color: theme.onAccent,
      fontSize: 15,
      fontWeight: "600",
    },
    recenter: {
      position: "absolute",
      right: 16,
      bottom: insets.bottom + 130,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 24,
      backgroundColor: theme.surface,
      elevation: 6,
      shadowColor: "#000000",
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    recenterText: {
      color: theme.accent,
      fontSize: 15,
      fontWeight: "700",
    },
    footer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: theme.surface,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: insets.bottom + 16,
      elevation: 12,
      shadowColor: "#000000",
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: -3 },
    },
    summary: {
      flex: 1,
      alignItems: "center",
    },
    remaining: {
      fontSize: 24,
      fontWeight: "800",
      color: theme.open,
      letterSpacing: -0.5,
    },
    remainingLabel: {
      fontSize: 14,
      color: theme.textMuted,
      marginTop: 2,
    },
    roundButton: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: "center",
      justifyContent: "center",
    },
    stopButton: {
      backgroundColor: theme.danger,
    },
    overviewButton: {
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
    },
    pressed: {
      opacity: 0.7,
    },
  });
}
