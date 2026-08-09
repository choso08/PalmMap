import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { useTheme, useTimeFactor, useT } from '../settings';
import type { Theme } from '../theme';
import type { RouteStep } from '../types/geo';
import { formatDistance, formatDuration } from '../utils/format';

interface NavigationPanelProps {
  /** A manobra que vem a seguir. */
  step: RouteStep | null;
  /** Distância até essa manobra, em metros. */
  distanceToStep: number;
  /** Quanto falta até ao destino. */
  remainingMeters: number;
  remainingSeconds: number;
  /** Verdadeiro enquanto se recalcula o percurso por se ter saído dele. */
  recalculating: boolean;
  /** Radar à frente, quando já está perto o suficiente para avisar. */
  camera: { label: string; icon: string; maxspeed: number | null; meters: number } | null;
  onStop: () => void;
}

/**
 * Ecrã de navegação: a manobra seguinte em grande, com a distância a que está.
 *
 * A barra de cima é o que se lê a conduzir, por isso é o maior elemento da
 * aplicação toda. A de baixo tem o que falta e o botão de terminar.
 */
export function NavigationPanel({
  step,
  distanceToStep,
  remainingMeters,
  remainingSeconds,
  recalculating,
  camera,
  onStop,
}: NavigationPanelProps) {
  const theme = useTheme();
  const strings = useT();
  const timeFactor = useTimeFactor();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  return (
    <>
      <View style={styles.banner}>
        {recalculating ? (
          <View style={styles.recalculating}>
            <MaterialCommunityIcons name="sync" size={26} color={theme.onAccent} />
            <Text style={styles.recalculatingText}>{strings.navigation.recalculating}</Text>
          </View>
        ) : step ? (
          <View style={styles.bannerRow}>
            <MaterialCommunityIcons
              name={step.icon as never}
              size={44}
              color={theme.onAccent}
            />
            <View style={styles.bannerText}>
              <Text style={styles.distance}>{formatDistance(distanceToStep)}</Text>
              <Text style={styles.instruction} numberOfLines={2}>
                {step.instruction}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.instruction}>{strings.navigation.following}</Text>
        )}
      </View>

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

      <View style={styles.footer}>
        <View>
          <Text style={styles.remaining}>
            {formatDuration(remainingSeconds * timeFactor)} · {formatDistance(remainingMeters)}
          </Text>
          <Text style={styles.remainingLabel}>{strings.navigation.toDestination}</Text>
        </View>

        <Pressable style={styles.stopButton} onPress={onStop}>
          <MaterialCommunityIcons name="close" size={20} color={theme.onAccent} />
          <Text style={styles.stopText}>{strings.navigation.finish}</Text>
        </Pressable>
      </View>
    </>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    banner: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: theme.accent,
      paddingTop: insets.top + 14,
      paddingBottom: 20,
      paddingHorizontal: 20,
      borderBottomLeftRadius: 22,
      borderBottomRightRadius: 22,
      elevation: 10,
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
    },
    bannerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 18,
    },
    bannerText: {
      flex: 1,
    },
    distance: {
      fontSize: 32,
      fontWeight: '800',
      color: theme.onAccent,
      letterSpacing: -0.8,
    },
    instruction: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.onAccent,
      marginTop: 2,
    },
    recalculating: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    recalculatingText: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.onAccent,
    },
    camera: {
      position: 'absolute',
      left: 16,
      right: 16,
      // Logo abaixo da barra da manobra, que ocupa o topo do ecrã.
      top: insets.top + 132,
      flexDirection: 'row',
      alignItems: 'center',
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
      fontWeight: '600',
    },
    limite: {
      minWidth: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.signFace,
      borderWidth: 3,
      // O vermelho do sinal de limite de velocidade, que se lê num instante.
      borderColor: theme.signEdge,
    },
    limiteText: {
      color: theme.signInk,
      fontSize: 14,
      fontWeight: '800',
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      backgroundColor: theme.surface,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: insets.bottom + 20,
      elevation: 12,
      shadowColor: '#000000',
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: -3 },
    },
    remaining: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
      letterSpacing: -0.4,
    },
    remainingLabel: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2,
    },
    stopButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      backgroundColor: theme.danger,
      borderRadius: 18,
      paddingVertical: 13,
      paddingHorizontal: 18,
    },
    stopText: {
      color: theme.onAccent,
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
