import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { File } from 'expo-file-system';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import {
  checkForUpdate,
  currentVersion,
  downloadUpdate,
  installUpdate,
  type UpdateInfo,
} from '../services/update';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

/** Megabytes em texto, na forma da língua atual. */
function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb < 10 ? 1 : 0).replace('.', t().units.decimal)} MB`;
}

interface UpdatesProps {
  /**
   * A atualização que a procura automática já encontrou, se encontrou alguma.
   *
   * Vem de fora porque quem procura sozinho é a aplicação, ao arrancar — e o
   * resultado também serve para marcar o botão das definições. Duas cópias da
   * mesma resposta acabariam por divergir.
   */
  found: UpdateInfo | null;
  onFound: (info: UpdateInfo | null) => void;
}

/**
 * Procurar, descarregar e instalar versões novas, sem sair da aplicação.
 *
 * **O último passo é sempre da pessoa.** O Android não deixa uma aplicação
 * instalar-se a si própria em silêncio; o que se faz aqui é chegar com o
 * ficheiro à porta do instalador. Está escrito no ecrã, e deve continuar lá.
 */
export function Updates({ found, onFound }: UpdatesProps) {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [checking, setChecking] = useState(false);
  /** Já se procurou nesta sessão e não havia nada de novo. */
  const [upToDate, setUpToDate] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [ready, setReady] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    setError(null);
    setUpToDate(false);
    try {
      const nova = await checkForUpdate();
      onFound(nova);
      setUpToDate(nova === null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t().common.failed);
    } finally {
      setChecking(false);
    }
  }, [onFound]);

  const handleDownload = useCallback(async () => {
    if (!found) {
      return;
    }
    setProgress(0);
    setError(null);
    try {
      const ficheiro = await downloadUpdate(found, setProgress);
      setReady(ficheiro);
      // Abre-se o instalador logo a seguir: quem carregou em "descarregar e
      // instalar" não quer carregar noutro botão a seguir. Se fechar o
      // instalador sem instalar, o botão fica lá para voltar a abri-lo.
      await installUpdate(ficheiro);
    } catch (err) {
      setError(err instanceof Error ? err.message : t().common.failed);
    } finally {
      setProgress(null);
    }
  }, [found]);

  const handleInstall = useCallback(async () => {
    if (!ready) {
      return;
    }
    setError(null);
    try {
      await installUpdate(ready);
    } catch (err) {
      setError(err instanceof Error ? err.message : t().common.failed);
    }
  }, [ready]);

  const aDescarregar = progress !== null;

  return (
    <View>
      <Text style={styles.version}>
        {strings.settings.currentVersion(currentVersion())}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {found ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons
              name="package-down"
              size={20}
              color={theme.accent}
            />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>
                {strings.settings.updateAvailable(found.version)}
              </Text>
              <Text style={styles.cardSize}>
                {aDescarregar
                  ? `${strings.settings.downloadingUpdate} ${Math.round(progress * 100)}%`
                  : ready
                    ? strings.settings.updateReady
                    : strings.settings.updateSize(formatBytes(found.bytes))}
              </Text>
            </View>
          </View>

          {aDescarregar ? (
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          ) : null}

          {/*
            O texto da Release diz o que mudou. Vem escrito por quem compilou e
            não é traduzido: é a lista dos commits desta versão.
          */}
          {found.notes && !aDescarregar ? (
            <>
              <Text style={styles.notesTitle}>{strings.settings.whatsNew}</Text>
              <Text style={styles.notes} numberOfLines={8}>
                {found.notes}
              </Text>
            </>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            disabled={aDescarregar}
            onPress={() => void (ready ? handleInstall() : handleDownload())}
          >
            {aDescarregar ? (
              <ActivityIndicator size="small" color={theme.onAccent} />
            ) : (
              <MaterialCommunityIcons
                name={ready ? 'cellphone-arrow-down' : 'download'}
                size={18}
                color={theme.onAccent}
              />
            )}
            <Text style={styles.buttonText}>
              {aDescarregar
                ? strings.settings.downloadingUpdate
                : ready
                  ? strings.settings.installUpdate
                  : strings.settings.downloadUpdate}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.check, pressed && styles.buttonPressed]}
          disabled={checking}
          onPress={() => void handleCheck()}
        >
          {checking ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <MaterialCommunityIcons name="refresh" size={18} color={theme.accent} />
          )}
          <Text style={styles.checkText}>
            {checking ? strings.settings.checking : strings.settings.checkUpdates}
          </Text>
        </Pressable>
      )}

      {upToDate && !found ? (
        <Text style={styles.upToDate}>{strings.settings.upToDate}</Text>
      ) : null}

      <Text style={styles.note}>{strings.settings.updateManualNote}</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    version: {
      fontSize: 13,
      color: theme.textMuted,
      marginBottom: 10,
    },
    card: {
      backgroundColor: theme.surfaceMuted,
      borderRadius: 16,
      padding: 14,
      gap: 12,
      borderWidth: 1,
      borderColor: theme.accent,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    cardText: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.text,
    },
    cardSize: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2,
    },
    track: {
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      overflow: 'hidden',
    },
    fill: {
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.accent,
    },
    notesTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    notes: {
      fontSize: 12,
      lineHeight: 18,
      color: theme.textMuted,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.accent,
      borderRadius: 14,
      paddingVertical: 12,
    },
    buttonText: {
      color: theme.onAccent,
      fontSize: 14,
      fontWeight: '700',
    },
    check: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      paddingVertical: 12,
    },
    checkText: {
      color: theme.accent,
      fontSize: 14,
      fontWeight: '700',
    },
    buttonPressed: {
      opacity: 0.85,
    },
    upToDate: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 8,
    },
    error: {
      fontSize: 12,
      color: theme.danger,
      marginBottom: 8,
    },
    note: {
      fontSize: 11,
      lineHeight: 16,
      color: theme.textMuted,
      marginTop: 12,
    },
  });
}
