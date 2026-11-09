import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { t } from '../i18n';
import {
  downloadRegion,
  isDownloaded,
  listRegions,
  outdatedRegions,
  removeRegion,
  type OfflineRegion,
} from '../services/offlineMap';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

/** Bytes em texto: 2,1 MB / 1,4 GB. */
function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1000) {
    return `${mb.toFixed(mb < 10 ? 1 : 0).replace('.', t().units.decimal)} MB`;
  }
  return `${(mb / 1024).toFixed(1).replace('.', t().units.decimal)} GB`;
}

/**
 * The countries with a map available to keep on the phone, each with its size.
 *
 * Unlike the cache, this really is offline: once downloaded, the whole country
 * works without a network, at any zoom, without having been seen before.
 */
export function OfflineMaps() {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [regions, setRegions] = useState<OfflineRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * The downloads in progress: region id → how far along, from 0 to 1.
   *
   * Several at once on purpose. It used to be one, and whoever wanted three
   * countries had to watch the first to the end — when what takes the time is
   * the network, not the app, and the network copes fine with three.
   */
  const [downloads, setDownloads] = useState<Record<string, number>>({});
  /** Those with a newer version published than the one kept. */
  const [desatualizados, setDesatualizados] = useState<Set<string>>(new Set());
  const desatualizadosRef = useRef<Set<string>>(new Set());
  /**
   * The same, in a `ref`.
   *
   * Only to know whether a region is already downloading without putting
   * `downloads` in the dependencies: with it there, the function changed
   * identity on every step of the bar and every row redrew.
   */
  const emCurso = useRef<Set<string>>(new Set());
  /** Changes on every download or delete, so the list redraws. */
  const [revision, setRevision] = useState(0);
  /** Text to filter the list. With dozens of countries, searching beats scrolling. */
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const lista = await listRegions();
        setRegions(lista);
        const velhos = new Set(outdatedRegions(lista).map((r) => r.id));
        desatualizadosRef.current = velhos;
        setDesatualizados(velhos);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : t().common.listFailed);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggle = useCallback(async (region: OfflineRegion) => {
    // Already downloading: a second tap does not start over.
    if (emCurso.current.has(region.id)) {
      return;
    }

    // On an outdated map a tap **renews instead of deleting**. Deleting was the
    // opposite of what the person wants, and irreversible without a network.
    if (isDownloaded(region) && !desatualizadosRef.current.has(region.id)) {
      removeRegion(region);
      setRevision((n) => n + 1);
      return;
    }

    emCurso.current.add(region.id);
    setDownloads((atuais) => ({ ...atuais, [region.id]: 0 }));
    setError(null);

    try {
      await downloadRegion(region, (fracao) => {
        setDownloads((atuais) => ({ ...atuais, [region.id]: fracao }));
      });
      desatualizadosRef.current.delete(region.id);
      setDesatualizados((atuais) => {
        const resto = new Set(atuais);
        resto.delete(region.id);
        return resto;
      });
      setRevision((n) => n + 1);
    } catch (err) {
      // The message already names the country — with several downloading at
      // once, a nameless "could not" was useless.
      setError(err instanceof Error ? err.message : t().common.failed);
    } finally {
      emCurso.current.delete(region.id);
      setDownloads((atuais) => {
        const { [region.id]: _terminada, ...resto } = atuais;
        return resto;
      });
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={theme.accent} />
        <Text style={styles.loadingText}>{strings.offline.loading}</Text>
      </View>
    );
  }

  // No accents, no capitals: searching "acores" has to find "Açores".
  const simplificar = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const procurado = simplificar(filtro.trim());
  // Alphabetical: with dozens of countries, the manifest's order (the order
  // they happened to be generated in) made a country hard to find.
  const visiveis = (
    procurado ? regions.filter((r) => simplificar(r.nome).includes(procurado)) : regions
  )
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));

  return (
    <View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {regions.length === 0 && !error ? (
        <Text style={styles.error}>
          {strings.offline.empty}
        </Text>
      ) : null}

      {/* The search box only shows when the list is long enough to need it.
          With half a dozen countries it would just be one more thing on screen. */}
      {regions.length > 8 ? (
        <View style={styles.search}>
          <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={filtro}
            onChangeText={setFiltro}
            placeholder={strings.offline.searchIn(regions.length)}
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

      {procurado && visiveis.length === 0 ? (
        <Text style={styles.vazio}>{strings.offline.noMatch}</Text>
      ) : null}

      {visiveis.map((region) => {
        // `revision` is here so the state is read again after the files change.
        const guardado = revision >= 0 && isDownloaded(region);
        const progresso = downloads[region.id];
        const aDescarregar = progresso !== undefined;
        // A newer version is published than the one on the phone. On Wi-Fi
        // it renews by itself; this lets someone on mobile data do it by hand,
        // knowing what it will cost.
        const velho = guardado && desatualizados.has(region.id);

        return (
          <Pressable
            key={region.id}
            style={styles.row}
            disabled={aDescarregar}
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
                {aDescarregar
                  ? ` · ${Math.round(progresso * 100)}%`
                  : velho
                    ? ` · ${strings.offline.outdated}`
                    : guardado
                      ? ` · ${strings.common.saved}`
                      : ''}
              </Text>

              {/*
                The bar only shows while downloading. On a file of hundreds of
                megabytes it is what tells "moving" from "stuck" — without it
                there was only a spinner.
              */}
              {aDescarregar ? (
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.round(progresso * 100)}%` }]} />
                </View>
              ) : null}
            </View>

            {aDescarregar ? (
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
    track: {
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      marginTop: 8,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      borderRadius: 2,
      backgroundColor: theme.accent,
    },
  });
}
