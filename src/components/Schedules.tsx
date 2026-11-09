import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import {
  downloadFeed,
  isExpired,
  isInstalled,
  listFeeds,
  removeFeed,
  type ScheduleFeedInfo,
} from '../services/schedules';
import { STATION_ICONS, stationLabel, type StationKind } from '../services/transit';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

/**
 * Train, metro and boat timetables to keep on the phone.
 *
 * They are small files — hundreds of kilobytes, against the maps' hundreds of
 * megabytes — so they get no progress bar: they download in an instant.
 *
 * **This is not the same as the buses.** Carris Metropolitana's buses have
 * real time through an API and need nothing downloaded. These operators only
 * publish the timetable, and the timetable is what is kept here.
 */

/** Bytes em texto: 320 KB / 2,1 MB. */
function formatBytes(bytes: number): string {
  const kb = bytes / 1024;
  return kb < 1000
    ? `${Math.round(kb)} KB`
    : `${(kb / 1024).toFixed(1).replace('.', t().units.decimal)} MB`;
}

/** `20261005` written each language's way. */
function formatDate(aaaammdd: string): string {
  if (typeof aaaammdd !== 'string' || aaaammdd.length !== 8) {
    return '';
  }
  return t().schedules.date(Number(aaaammdd.slice(6, 8)), Number(aaaammdd.slice(4, 6)));
}

export function Schedules() {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [feeds, setFeeds] = useState<ScheduleFeedInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * Os horários a descarregar neste momento.
   *
   * Several at once, as with the maps: they are small files, but waiting for
   * the first before asking for the second made no sense at all.
   */
  const [busy, setBusy] = useState<string[]>([]);
  /** Changes on every download or delete, so the list redraws. */
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        setFeeds(await listFeeds());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : t().common.listFailed);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggle = useCallback(async (info: ScheduleFeedInfo) => {
    if (isInstalled(info)) {
      removeFeed(info);
      setRevision((n) => n + 1);
      return;
    }

    setBusy((atuais) => (atuais.includes(info.id) ? atuais : [...atuais, info.id]));
    setError(null);
    try {
      await downloadFeed(info);
      setRevision((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t().common.failed);
    } finally {
      setBusy((atuais) => atuais.filter((id) => id !== info.id));
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={theme.accent} />
        <Text style={styles.loadingText}>{strings.schedules.loading}</Text>
      </View>
    );
  }

  return (
    <View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {feeds.length === 0 && !error ? (
        <Text style={styles.error}>
          {strings.schedules.empty}
        </Text>
      ) : null}

      {feeds.map((info) => {
        // `revision` is here so the state is read again after the files change.
        const guardado = revision >= 0 && isInstalled(info);
        const ocupado = busy.includes(info.id);
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
                {stationLabel(info.kind as StationKind)} · {formatBytes(info.bytes)} ·{' '}
                {strings.schedules.stationCount(info.estacoes)}
                {/*
                  The expiry date has to be visible. An expired timetable gives
                  no answers, and without this one would not know why.
                */}
                {fora
                  ? ` · ${strings.schedules.expired}`
                  : info.fim
                    ? ` · ${strings.schedules.until(formatDate(info.fim))}`
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

      <Text style={styles.nota}>{strings.schedules.note}</Text>
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
