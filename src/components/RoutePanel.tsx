import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { useTheme, useTimeFactor } from '../settings';
import type { Theme } from '../theme';
import type { Place, Route } from '../types/geo';
import { formatDistance, formatDuration } from '../utils/format';

interface RoutePanelProps {
  destination: Place;
  route: Route | null;
  loading: boolean;
  error: string | null;
  onClear: () => void;
  onShowSteps: () => void;
  onStart: () => void;
  favourite: boolean;
  onToggleFavourite: () => void;
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
}: RoutePanelProps) {
  const theme = useTheme();
  const timeFactor = useTimeFactor();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  return (
    <View style={styles.container}>
      <View style={styles.handle} />

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
