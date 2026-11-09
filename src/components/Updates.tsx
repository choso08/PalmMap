import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import { checkForUpdate, currentVersion, type UpdateInfo } from '../services/update';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import { useUpdateDownload } from '../useUpdateDownload';

/** Megabytes as text, written the current language's way. */
function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb < 10 ? 1 : 0).replace('.', t().units.decimal)} MB`;
}

interface UpdatesProps {
  /**
   * The update the automatic check already found, if it found one.
   *
   * It comes from outside because the app checks on its own at startup — and
   * the result also marks the Settings button. Two copies of the same answer
   * would end up drifting apart.
   */
  found: UpdateInfo | null;
  onFound: (info: UpdateInfo | null) => void;
}

/**
 * Check for, download and install new versions without leaving the app.
 *
 * **The last step is always the person's.** Android does not let an app
 * install itself silently; what this does is bring the file to the
 * installer's door. Android's own "Install" button makes that obvious.
 */
export function Updates({ found, onFound }: UpdatesProps) {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [checking, setChecking] = useState(false);
  /** Already checked this session, and there was nothing new. */
  const [upToDate, setUpToDate] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  // Downloading and installing is the same here and in the startup notice.
  const descarga = useUpdateDownload();

  const handleCheck = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    setUpToDate(false);
    try {
      const nova = await checkForUpdate();
      onFound(nova);
      setUpToDate(nova === null);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : t().common.failed);
    } finally {
      setChecking(false);
    }
  }, [onFound]);



  const aDescarregar = descarga.downloading;
  const progress = descarga.progress ?? 0;
  const ready = descarga.ready;
  const error = checkError ?? descarga.error;

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
            The Release text says what changed. It is written by whoever built
            it and is not translated: it is this version's list of commits.
          */}
          {found.notes.length > 0 && !aDescarregar ? (
            <>
              <Text style={styles.notesTitle}>{strings.settings.whatsNew}</Text>
              {found.notes.slice(0, 10).map((note, i) => (
                <View key={i} style={styles.noteRow}>
                  <Text style={styles.noteDot}>•</Text>
                  <Text style={styles.notes}>{note}</Text>
                </View>
              ))}
            </>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            disabled={aDescarregar}
            onPress={() => void (ready ? descarga.install() : descarga.start(found))}
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
    noteRow: {
      flexDirection: 'row',
      gap: 6,
    },
    noteDot: {
      fontSize: 12,
      lineHeight: 18,
      color: theme.accent,
    },
    notes: {
      flex: 1,
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
  });
}
