import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { useEta, useTheme, useT } from '../settings';
import type { Theme } from '../theme';
import type { Route } from '../types/geo';
import { formatDistance, formatDuration } from '../utils/format';

interface StepsListProps {
  visible: boolean;
  route: Route | null;
  onClose: () => void;
}

/**
 * Every instruction of the route, top to bottom.
 *
 * It is for reading before setting off — it does not follow the position or
 * update during the trip. That is left for a later version.
 */
export function StepsList({ visible, route, onClose }: StepsListProps) {
  const theme = useTheme();
  const strings = useT();
  const eta = useEta();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  const steps = route?.steps ?? [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      // Without this, the top margin would depend on whether the screen draws
      // under the status bar, which varies. This way it always does, and our
      // margin is the one that counts.
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{strings.steps.title}</Text>
            {route ? (
              <Text style={styles.subtitle}>
                {formatDistance(route.distanceMeters)} ·{' '}
                {formatDuration(eta(route.distanceMeters, route.durationSeconds))}
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
                {/* The vertical line joining the manoeuvres. */}
                {index < steps.length - 1 ? <View style={styles.thread} /> : null}
              </View>

              <View style={styles.stepText}>
                <Text style={styles.instruction}>{item.instruction}</Text>
                {/* The last step is the arrival and has no distance to cover. */}
                {item.distanceMeters > 0 ? (
                  <Text style={styles.distance}>{formatDistance(item.distanceMeters)}</Text>
                ) : null}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>{strings.steps.empty}</Text>
          }
        />
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.surface,
      // Below the status bar and the camera cut-out.
      paddingTop: insets.top + 14,
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
      borderRadius: 20,
      backgroundColor: theme.surfaceMuted,
    },
    list: {
      paddingTop: 4,
      // So the last step does not end up under the navigation bar.
      paddingBottom: insets.bottom + 24,
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
