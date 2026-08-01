import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Place, Route } from '../types/geo';
import { formatDistance, formatDuration } from '../utils/format';

interface RoutePanelProps {
  destination: Place;
  route: Route | null;
  loading: boolean;
  error: string | null;
  onClear: () => void;
}

/** Painel inferior com a informação do percurso. */
export function RoutePanel({
  destination,
  route,
  loading,
  error,
  onClear,
}: RoutePanelProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>
            {destination.name}
          </Text>
          <Text style={styles.address} numberOfLines={1}>
            {destination.address}
          </Text>
        </View>
        <Pressable onPress={onClear} hitSlop={12}>
          <Text style={styles.clear}>Limpar</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.status}>
          <ActivityIndicator size="small" color="#1d4ed8" />
          <Text style={styles.statusText}>A calcular o percurso…</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {route ? (
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{formatDistance(route.distanceMeters)}</Text>
            <Text style={styles.metricLabel}>distância</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{formatDuration(route.durationSeconds)}</Text>
            <Text style={styles.metricLabel}>tempo estimado</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 24,
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
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
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  address: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  clear: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  statusText: {
    fontSize: 14,
    color: '#6b7280',
  },
  error: {
    marginTop: 14,
    fontSize: 14,
    color: '#b91c1c',
  },
  metrics: {
    flexDirection: 'row',
    gap: 32,
    marginTop: 16,
  },
  metric: {
    alignItems: 'flex-start',
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  metricLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
});
