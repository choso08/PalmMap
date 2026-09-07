import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { t } from '../i18n';
import {
  downloadRegion,
  isDownloaded,
  listRegions,
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
 * Lista de países com mapa disponível para guardar no telemóvel, com o tamanho
 * de cada um à frente.
 *
 * Ao contrário da cache, isto é mesmo offline: uma vez descarregado, o país
 * inteiro funciona sem rede, a qualquer zoom e sem ter sido visto antes.
 */
export function OfflineMaps() {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [regions, setRegions] = useState<OfflineRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * As descargas a decorrer: id da região → quanto já vai, de 0 a 1.
   *
   * São várias ao mesmo tempo de propósito. Antes só cabia uma, e quem quisesse
   * três países tinha de ficar a olhar para o primeiro até ao fim — sendo que o
   * que demora é a rede, não a aplicação, e a rede aguenta bem as três.
   */
  const [downloads, setDownloads] = useState<Record<string, number>>({});
  /**
   * As mesmas, numa `ref`.
   *
   * Serve só para saber se já se está a descarregar aquela região sem pôr o
   * `downloads` nas dependências: com ele lá, a função mudava de identidade a
   * cada avanço da barra e as linhas todas voltavam a desenhar-se.
   */
  const emCurso = useRef<Set<string>>(new Set());
  /** Muda sempre que se descarrega ou apaga, para a lista se redesenhar. */
  const [revision, setRevision] = useState(0);
  /** Texto para filtrar a lista. Com dezenas de países, procurar é mais rápido
   * do que percorrer. */
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        setRegions(await listRegions());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : t().common.listFailed);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggle = useCallback(async (region: OfflineRegion) => {
    // Já está a descarregar: um segundo toque não recomeça do princípio.
    if (emCurso.current.has(region.id)) {
      return;
    }

    if (isDownloaded(region)) {
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
      setRevision((n) => n + 1);
    } catch (err) {
      // A mensagem já diz de que país se trata — com várias a descarregar ao
      // mesmo tempo, um "não foi possível" sem nome não servia de nada.
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

  // Sem acentos e sem maiúsculas: procurar "acores" tem de encontrar "Açores".
  const simplificar = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const procurado = simplificar(filtro.trim());
  const visiveis = procurado
    ? regions.filter((r) => simplificar(r.nome).includes(procurado))
    : regions;

  return (
    <View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {regions.length === 0 && !error ? (
        <Text style={styles.error}>
          {strings.offline.empty}
        </Text>
      ) : null}

      {/* A caixa de procura só aparece quando a lista é grande ao ponto de
          fazer falta. Com meia dúzia de países, seria só mais uma coisa no ecrã. */}
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
        // `revision` entra aqui para o estado ser relido depois de mexer nos ficheiros.
        const guardado = revision >= 0 && isDownloaded(region);
        const progresso = downloads[region.id];
        const aDescarregar = progresso !== undefined;

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
                  : guardado
                    ? ` · ${strings.common.saved}`
                    : ''}
              </Text>

              {/*
                A barra só aparece durante o descarregamento. Num ficheiro de
                centenas de megabytes é o que distingue "está a andar" de
                "bloqueou" — sem ela só se via um indicador a rodar.
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
