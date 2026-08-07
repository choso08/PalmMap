import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  downloadFeed,
  isExpired,
  isInstalled,
  listFeeds,
  removeFeed,
  type ScheduleFeedInfo,
} from '../services/schedules';
import { STATION_ICONS, STATION_LABELS, type StationKind } from '../services/transit';
import { useTheme } from '../settings';
import type { Theme } from '../theme';

/**
 * Horários de comboio, metro e barco para guardar no telemóvel.
 *
 * São ficheiros pequenos — centenas de kilobytes, contra os centenas de
 * megabytes dos mapas — por isso não levam barra de progresso: descarregam num
 * instante.
 *
 * **Isto não é o mesmo que os autocarros.** Os autocarros da Carris
 * Metropolitana têm tempo real por API e não precisam de descarregar nada. Estes
 * operadores só publicam o horário, e é o horário que fica aqui guardado.
 */

/** Bytes em texto: 320 KB / 2,1 MB. */
function formatBytes(bytes: number): string {
  const kb = bytes / 1024;
  return kb < 1000
    ? `${Math.round(kb)} KB`
    : `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** `20261005` como `5 de outubro`. */
const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function formatDate(aaaammdd: string): string {
  if (typeof aaaammdd !== 'string' || aaaammdd.length !== 8) {
    return '';
  }
  const mes = MESES[Number(aaaammdd.slice(4, 6)) - 1];
  return mes ? `${Number(aaaammdd.slice(6, 8))} de ${mes}` : '';
}

export function Schedules() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [feeds, setFeeds] = useState<ScheduleFeedInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** Muda sempre que se descarrega ou apaga, para a lista se redesenhar. */
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        setFeeds(await listFeeds());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível obter a lista.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggle = useCallback(async (info: ScheduleFeedInfo) => {
    setBusy(info.id);
    setError(null);
    try {
      if (isInstalled(info)) {
        removeFeed(info);
      } else {
        await downloadFeed(info);
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
        <Text style={styles.loadingText}>A obter a lista de horários…</Text>
      </View>
    );
  }

  return (
    <View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {feeds.length === 0 && !error ? (
        <Text style={styles.error}>
          Ainda não há horários publicados. Corra o workflow "Gerar horários" no GitHub.
        </Text>
      ) : null}

      {feeds.map((info) => {
        // `revision` entra aqui para o estado ser relido depois de mexer nos ficheiros.
        const guardado = revision >= 0 && isInstalled(info);
        const ocupado = busy === info.id;
        const fora = isExpired(info);
        const icone = STATION_ICONS[info.kind as StationKind] ?? 'clock-outline';

        return (
          <Pressable
            key={info.id}
            style={styles.row}
            disabled={ocupado}
            onPress={() => void handleToggle(info)}
          >
            <MaterialCommunityIcons
              name={icone as never}
              size={22}
              color={guardado && !fora ? theme.accent : theme.textMuted}
            />

            <View style={styles.rowText}>
              <Text style={styles.name}>{info.nome}</Text>
              <Text style={[styles.size, fora ? styles.expirado : null]}>
                {STATION_LABELS[info.kind as StationKind] ?? 'Horário'} ·{' '}
                {formatBytes(info.bytes)} · {info.estacoes} estações
                {/*
                  A validade tem de estar à vista. Um horário fora de prazo não
                  responde, e sem isto escrito ficava-se sem perceber porquê.
                */}
                {fora
                  ? ' · fora de prazo, descarregue outra vez'
                  : info.fim
                    ? ` · até ${formatDate(info.fim)}`
                    : ''}
              </Text>
            </View>

            {ocupado ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : guardado ? (
              <MaterialCommunityIcons name="delete-outline" size={20} color={theme.danger} />
            ) : (
              <MaterialCommunityIcons name="download" size={20} color={theme.textMuted} />
            )}
          </Pressable>
        );
      })}

      <Text style={styles.nota}>
        Estes operadores só publicam o horário, não o tempo real: as horas são as
        previstas, e um atraso não aparece aqui. Depois de descarregados funcionam sem
        rede. Os autocarros da Carris Metropolitana não precisam disto — esses têm tempo
        real.
      </Text>
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
    expirado: {
      color: theme.danger,
    },
    nota: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 14,
      lineHeight: 18,
    },
  });
}
