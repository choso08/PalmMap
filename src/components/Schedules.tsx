import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { t } from '../i18n';
import { timetableName } from '../utils/catalogueName';
import {
  downloadFeed,
  feedBytes,
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

/** No accents, no capitals: "chequia" finds "Chéquia". */
function simplify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
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
  /** Text to filter the list: operator, country or kind. */
  const [filtro, setFiltro] = useState('');
  /** The countries whose timetables are shown; Portugal's open at first. */
  const [abertos, setAbertos] = useState<string[]>(['PT']);
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

  const countryName = (code: string) => strings.schedules.countries[code] ?? code;
  const procurado = simplify(filtro.trim());
  // Each country's timetables together; Portugal first, the others by name.
  const porPais = new Map<string, ScheduleFeedInfo[]>();
  for (const info of feeds) {
    const pais = info.pais ?? 'PT';
    if (
      procurado &&
      !simplify(
        `${info.nome} ${timetableName(info)} ${countryName(pais)} ${pais} ${stationLabel(info.kind as StationKind)}`,
      ).includes(procurado)
    ) {
      continue;
    }
    const lista = porPais.get(pais) ?? [];
    lista.push(info);
    porPais.set(pais, lista);
  }
  const grupos = [...porPais.entries()]
    .map(
      ([pais, lista]) =>
        [
          pais,
          lista.slice().sort((a, b) => timetableName(a).localeCompare(timetableName(b))),
        ] as const,
    )
    .sort(([a], [b]) =>
      a === 'PT' ? -1 : b === 'PT' ? 1 : countryName(a).localeCompare(countryName(b)),
    );
  const variosPaises = new Set(feeds.map((f) => f.pais ?? 'PT')).size > 1;

  const renderRow = (info: ScheduleFeedInfo) => {
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
          <Text style={styles.name}>{timetableName(info)}</Text>
          <Text style={[styles.size, fora ? styles.expirado : null]}>
            {stationLabel(info.kind as StationKind)} · {formatBytes(feedBytes(info))} ·{' '}
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
  };

  return (
    <View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {feeds.length === 0 && !error ? (
        <Text style={styles.error}>{strings.schedules.empty}</Text>
      ) : null}

      {feeds.length > 8 ? (
        <View style={styles.search}>
          <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={filtro}
            onChangeText={setFiltro}
            placeholder={strings.schedules.searchIn(feeds.length)}
            placeholderTextColor={theme.placeholder}
            autoCorrect={false}
          />
          {filtro.length > 0 ? (
            <Pressable onPress={() => setFiltro('')} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {procurado && grupos.length === 0 ? (
        <Text style={styles.vazio}>{strings.schedules.noMatch}</Text>
      ) : null}

      {grupos.map(([pais, lista]) => {
        // One country alone is a plain list; several are drop-downs, as the
        // country maps (author's request, 20 November 2026). Open while
        // searching, so a match is seen; otherwise as the person left it.
        if (!variosPaises) {
          return <View key={pais}>{lista.map(renderRow)}</View>;
        }
        const aberto = procurado.length > 0 || abertos.includes(pais);
        const guardados = lista.filter((f) => revision >= 0 && isInstalled(f)).length;
        const aDescarregar = lista.some((f) => busy.includes(f.id));
        return (
          <View key={pais}>
            <Pressable
              style={styles.row}
              onPress={() =>
                setAbertos((atuais) =>
                  atuais.includes(pais) ? atuais.filter((p) => p !== pais) : [...atuais, pais],
                )
              }
              accessibilityRole="button"
              accessibilityState={{ expanded: aberto }}
            >
              <MaterialCommunityIcons
                name={guardados > 0 ? 'clock-check-outline' : 'clock-outline'}
                size={22}
                color={guardados > 0 ? theme.accent : theme.textMuted}
              />
              <View style={styles.rowText}>
                <Text style={styles.name}>{countryName(pais)}</Text>
                <Text style={styles.size}>
                  {strings.schedules.feedCount(lista.length)}
                  {guardados > 0 ? ` · ${strings.schedules.feedsSaved(guardados)}` : ''}
                </Text>
              </View>
              {aDescarregar ? <ActivityIndicator size="small" color={theme.accent} /> : null}
              <MaterialCommunityIcons
                name={aberto ? 'chevron-up' : 'chevron-down'}
                size={22}
                color={theme.textMuted}
              />
            </Pressable>
            {aberto ? <View style={styles.zonas}>{lista.map(renderRow)}</View> : null}
          </View>
        );
      })}

      <Text style={styles.nota}>{strings.schedules.note}</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 12,
      paddingHorizontal: 14,
      borderRadius: 18,
      backgroundColor: theme.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 10,
      fontSize: 15,
      color: theme.text,
    },
    vazio: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 14,
    },
    zonas: {
      paddingLeft: 24,
    },
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
