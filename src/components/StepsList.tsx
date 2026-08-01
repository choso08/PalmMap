import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { type Theme, useTheme } from '../theme';
import type { Route } from '../types/geo';
import { formatDistance, formatDuration } from '../utils/format';

interface StepsListProps {
  visible: boolean;
  route: Route | null;
  onClose: () => void;
}

/**
 * Lista com as instruções todas do percurso, de cima a baixo.
 *
 * É para consultar antes de arrancar — não segue a posição nem se atualiza
 * durante a viagem. Essa parte fica para uma versão seguinte.
 */
export function StepsList({ visible, route, onClose }: StepsListProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const steps = route?.steps ?? [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Instruções</Text>
            {route ? (
              <Text style={styles.subtitle}>
                {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSeconds)}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
            <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
          </Pressable>
        </View>

        <FlatList
          data={steps}
          keyExtractor={(_, index) => String(index)}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <View style={styles.step}>
              <View style={styles.iconWrap}>
                <MaterialCommunityIcons
                  name={item.icon as never}
                  size={20}
                  color={theme.accent}
                />
                {/* A linha vertical que liga as manobras umas às outras. */}
                {index < steps.length - 1 ? <View style={styles.thread} /> : null}
              </View>

              <View style={styles.stepText}>
                <Text style={styles.instruction}>{item.instruction}</Text>
                {/* O último passo é a chegada e não tem distância a percorrer. */}
                {item.distanceMeters > 0 ? (
                  <Text style={styles.distance}>{formatDistance(item.distanceMeters)}</Text>
                ) : null}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>Ainda não há instruções para mostrar.</Text>
          }
        />
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
      alignItems: 'flex-start',
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
    subtitle: {
      fontSize: 14,
      color: theme.textMuted,
      marginTop: 3,
    },
    closeButton: {
      padding: 6,
      borderRadius: 16,
      backgroundColor: theme.surfaceMuted,
    },
    list: {
      paddingVertical: 4,
    },
    step: {
      flexDirection: 'row',
      gap: 14,
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    iconWrap: {
      alignItems: 'center',
      width: 38,
    },
    thread: {
      flex: 1,
      width: 2,
      marginTop: 6,
      borderRadius: 1,
      backgroundColor: theme.border,
    },
    stepText: {
      flex: 1,
      paddingBottom: 16,
    },
    instruction: {
      fontSize: 16,
      color: theme.text,
      lineHeight: 22,
    },
    distance: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 4,
    },
    empty: {
      padding: 28,
      textAlign: 'center',
      color: theme.textMuted,
    },
  });
}
