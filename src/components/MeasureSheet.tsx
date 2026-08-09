import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GestureResponderHandlers } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import type { Coordinates } from '../types/geo';
import { formatArea, formatDistance } from '../utils/format';
import { pathLengthMeters, perimeterMeters, polygonAreaM2 } from '../utils/geometry';

/** Medir ao longo de uma linha, ou medir uma forma fechada. */
export type MeasureMode = 'linha' | 'area';

interface MeasureSheetProps {
  /**
   * Os gestos da barrinha do topo, para o painel poder ser encolhido.
   *
   * Vêm do `DraggableSheet` — ver lá porque é que ficam só na barra e não no
   * painel inteiro.
   */
  dragHandlers?: GestureResponderHandlers;
  points: Coordinates[];
  mode: MeasureMode;
  onChangeMode: (mode: MeasureMode) => void;
  onUndo: () => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * Fita métrica: mede distâncias e áreas tocando no mapa.
 *
 * Cada toque põe um ponto. Dois pontos dão uma distância; três ou mais fecham
 * uma forma e dão também a área — que é o que interessa a quem está a medir um
 * terreno, um telhado ou um campo.
 *
 * **Não é topografia.** A precisão é a do mapa e a do dedo: um toque no ecrã, a
 * um zoom normal, vale alguns metros. Serve para ter uma ideia, não para marcar
 * uma estrema. Isso está dito no painel, para ninguém se enganar.
 */
export function MeasureSheet({
  points,
  mode,
  onChangeMode,
  onUndo,
  onClear,
  onClose,
  dragHandlers,
}: MeasureSheetProps) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  const comprimento = useMemo(() => pathLengthMeters(points), [points]);
  const perimetro = useMemo(() => perimeterMeters(points), [points]);
  const area = useMemo(() => polygonAreaM2(points), [points]);

  /** A forma só existe a partir de três pontos. */
  const fechada = mode === 'area' && points.length >= 3;

  return (
    <View style={styles.container}>
      <View style={styles.handleZone} {...dragHandlers}>
        <View style={styles.handle} />
      </View>

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{strings.measure.title}</Text>
          <Text style={styles.subtitle}>
            {points.length === 0
              ? strings.measure.firstPoint
              : points.length === 1
                ? strings.measure.secondPoint
                : mode === 'area' && points.length === 2
                  ? strings.measure.needThird
                  : strings.measure.pointCount(points.length)}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
          <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
        </Pressable>
      </View>

      {/*
        Linha ou área, como no Google Earth — e pela mesma razão: medir o caminho
        de casa ao trabalho e medir um terreno são duas coisas diferentes, e a
        primeira não se fecha. Fechar sozinho dava um número errado a quem estava
        só a medir um percurso.
      */}
      <View style={styles.modos}>
        {(['linha', 'area'] as const).map((m) => {
          const ativo = m === mode;
          return (
            <Pressable
              key={m}
              style={[styles.modo, ativo ? styles.modoAtivo : null]}
              onPress={() => onChangeMode(m)}
            >
              <MaterialCommunityIcons
                name={m === 'linha' ? 'vector-polyline' : 'vector-square'}
                size={17}
                color={ativo ? theme.onAccent : theme.textMuted}
              />
              <Text style={[styles.modoTexto, ativo ? styles.modoTextoAtivo : null]}>
                {m === 'linha' ? strings.measure.distance : strings.measure.area}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.medidas}>
        <View style={styles.medida}>
          <Text style={styles.valor}>
            {points.length >= 2 ? formatDistance(fechada ? perimetro : comprimento) : '—'}
          </Text>
          <Text style={styles.etiqueta}>
            {fechada ? strings.measure.perimeterLabel : strings.measure.distanceLabel}
          </Text>
        </View>

        {/*
          A área só existe a partir de três pontos. Com dois, mostrar "0 m²" era
          só ruído.
        */}
        {fechada ? (
          <>
            <View style={styles.separador} />
            <View style={styles.medida}>
              <Text style={styles.valor}>{formatArea(area)}</Text>
              <Text style={styles.etiqueta}>{strings.measure.areaLabel}</Text>
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.acoes}>
        <Pressable
          style={[styles.acao, points.length === 0 ? styles.acaoInativa : null]}
          onPress={onUndo}
          disabled={points.length === 0}
        >
          <MaterialCommunityIcons name="undo-variant" size={18} color={theme.accent} />
          <Text style={styles.acaoTexto}>{strings.common.undo}</Text>
        </Pressable>

        <Pressable
          style={[styles.acao, points.length === 0 ? styles.acaoInativa : null]}
          onPress={onClear}
          disabled={points.length === 0}
        >
          <MaterialCommunityIcons name="broom" size={18} color={theme.accent} />
          <Text style={styles.acaoTexto}>{strings.common.clear}</Text>
        </Pressable>
      </View>

      <Text style={styles.nota}>{strings.measure.accuracy}</Text>
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
    modos: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 16,
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
    medidas: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 16,
    },
    medida: {
      flex: 1,
    },
    valor: {
      fontSize: 26,
      fontWeight: '700',
      color: theme.text,
      letterSpacing: -0.5,
    },
    etiqueta: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2,
    },
    separador: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: theme.border,
      marginHorizontal: 16,
    },
    acoes: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 18,
    },
    acao: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: theme.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    acaoInativa: {
      opacity: 0.4,
    },
    acaoTexto: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.accent,
    },
    nota: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 14,
      lineHeight: 17,
    },
  });
}
