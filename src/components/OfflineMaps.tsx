import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  downloadRegion,
  isDownloaded,
  listRegions,
  removeRegion,
  type OfflineRegion,
} from '../services/offlineMap';
import { useTheme } from '../settings';
import type { Theme } from '../theme';

/** Bytes em texto: 2,1 MB / 1,4 GB. */
function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1000) {
    return `${mb.toFixed(mb < 10 ? 1 : 0).replace('.', ',')} MB`;
  }
  return `${(mb / 1024).toFixed(1).replace('.', ',')} GB`;
}

/**
 * Lista de países com mapa disponível para guardar no telemóvel, com o tamanho
 * de cada um à frente.
 *
 * Ao contrário da cache, isto é mesmo offline: uma vez descarregado, o país
 * inteiro funciona sem rede, a qualquer zoom e sem ter sido visto antes.
 */
export function OfflineMaps() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [regions, setRegions] = useState<OfflineRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Que região está a ser descarregada ou apagada neste momento. */
  const [busy, setBusy] = useState<string | null>(null);
  /** Muda sempre que se descarrega ou apaga, para a lista se redesenhar. */
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        setRegions(await listRegions());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível obter a lista.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggle = useCallback(async (region: OfflineRegion) => {
    setBusy(region.id);
    setError(null);
    try {
      if (isDownloaded(region)) {
        removeRegion(region);
      } else {
        await downloadRegion(region);
      }
      setRevision((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível.');
    } finally {
      setBusy(null);
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={theme.accent} />
        <Text style={styles.loadingText}>A obter a lista de mapas…</Text>
      </View>
    );
  }

  return (
    <View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {regions.length === 0 && !error ? (
        <Text style={styles.error}>
          Ainda não há mapas publicados. Corra o workflow "Gerar mapa offline" no GitHub.
        </Text>
      ) : null}

      {regions.map((region) => {
        // `revision` entra aqui para o estado ser relido depois de mexer nos ficheiros.
        const guardado = revision >= 0 && isDownloaded(region);
        const ocupado = busy === region.id;

        return (
          <Pressable
            key={region.id}
            style={styles.row}
            disabled={ocupado}
            onPress={() => void handleToggle(region)}
          >
            <MaterialCommunityIcons
              name={guardado ? 'check-circle' : 'download'}
              size={22}
              color={guardado ? theme.accent : theme.textMuted}
            />

            <View style={styles.rowText}>
              <Text style={styles.name}>{region.nome}</Text>
              <Text style={styles.size}>
                {formatBytes(region.bytes)}
                {guardado ? ' · guardado' : ''}
              </Text>
            </View>

            {ocupado ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : guardado ? (
              <MaterialCommunityIcons
                name="delete-outline"
                size={20}
                color={theme.danger}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    loading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 16,
    },
    loadingText: {
      fontSize: 14,
      color: theme.textMuted,
    },
    error: {
      fontSize: 13,
      color: theme.danger,
      marginTop: 12,
      lineHeight: 18,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    rowText: {
      flex: 1,
    },
    name: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
    },
    size: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2,
    },
  });
}
