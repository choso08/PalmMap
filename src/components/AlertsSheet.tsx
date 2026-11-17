import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useState } from 'react';
import { Animated, ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSwipeToClose } from '../useSwipeToClose';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { serviceAlerts, type ServiceAlert } from '../services/alerts';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Every service alert in force — strikes, diversions, works — in one list,
 * as Moovit has (author's request, November 2026). Each shows its lines and
 * when it ends; a tap unfolds the whole text. Carris Metropolitana's alerts,
 * the only open source of them today.
 */
export function AlertsSheet({ visible, onClose }: Props) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const [alerts, setAlerts] = useState<ServiceAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    serviceAlerts()
      .then((list) => {
        if (!cancelled) {
          setAlerts(list);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : strings.nearby.alertsFailed);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, strings]);

  const until = (unix: number) => {
    const d = new Date(unix * 1000);
    return strings.nearby.until(`${d.getDate()}/${d.getMonth() + 1}`);
  };

  // Pull the header down to close (`useSwipeToClose`).
  const swipe = useSwipeToClose(onClose, visible);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Animated.View style={[styles.screen, swipe.sheetStyle]}>
        <View style={styles.header} {...swipe.headerHandlers}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={strings.common.close}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          <Text style={styles.title}>{strings.nearby.alerts}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.list}>
          {alerts === null && !error ? <ActivityIndicator color={theme.accent} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {alerts?.length === 0 ? <Text style={styles.muted}>{strings.nearby.noAlerts}</Text> : null}
          {(alerts ?? []).map((a) => {
            const unfolded = open === a.id;
            return (
              <Pressable
                key={a.id}
                style={styles.card}
                onPress={() => setOpen(unfolded ? null : a.id)}
              >
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons
                    name={a.effect === 'NO_SERVICE' ? 'alert-octagon' : 'alert'}
                    size={18}
                    color={theme.closingSoon}
                  />
                  <Text style={styles.cardTitle} numberOfLines={unfolded ? undefined : 2}>
                    {a.title}
                  </Text>
                </View>
                <View style={styles.badges}>
                  {a.lines.slice(0, 12).map((l) => (
                    <Text key={l} style={styles.badge}>
                      {l}
                    </Text>
                  ))}
                  {a.until ? <Text style={styles.muted}>{until(a.until)}</Text> : null}
                </View>
                {unfolded && a.description ? (
                  <Text style={styles.description}>{a.description}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
      paddingTop: insets.top + 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
    },
    list: {
      padding: 12,
      gap: 10,
      paddingBottom: insets.bottom + 24,
    },
    error: {
      color: theme.danger,
      fontSize: 14,
    },
    muted: {
      fontSize: 13,
      color: theme.textMuted,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 14,
      gap: 8,
    },
    cardHeader: {
      flexDirection: 'row',
      gap: 10,
    },
    cardTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
    },
    badges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
    },
    badge: {
      fontSize: 12,
      fontWeight: '800',
      color: theme.onAccent,
      backgroundColor: theme.vehicle,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
      overflow: 'hidden',
    },
    description: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.textMuted,
    },
  });
}
