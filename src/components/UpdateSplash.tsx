import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { t } from '../i18n';
import { RELEASE_PAGE_URL } from '../services/config';
import type { UpdateInfo } from '../services/update';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import { useUpdateDownload } from '../useUpdateDownload';

/** How many changes fit on the popup; the rest are in Settings → Updates. */
const SPLASH_NOTES = 3;

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb < 10 ? 1 : 0).replace('.', t().units.decimal)} MB`;
}

interface UpdateSplashProps {
  /** The new version, or `null` when there is nothing to announce. */
  info: UpdateInfo | null;
  /**
   * Whether it may download by itself, without anyone tapping anything.
   *
   * True on Wi-Fi and false on mobile data — see `onWifi`. It is tens of
   * megabytes, and spending someone's data allowance without asking is exactly
   * what was already ruled out for the country maps.
   */
  autoDownload: boolean;
  /** Postpone: closes and does not show again for this version. */
  onDismiss: () => void;
  /**
   * The installer was opened for this version and it is still not the one
   * running: the install did not finish. The APK is usually still in the
   * cache, so the button goes straight to the installer.
   */
  unfinished?: boolean;
}

/**
 * The notice shown when the app opens and a new version is out.
 *
 * **Once per version.** Whoever taps "not now" does not see it again for that
 * version — only the dot on the Settings button stays. A notice that comes back
 * at every start stops being read after two days, the same lesson as the
 * camera warnings.
 *
 * It all happens in here: tapping update downloads and opens the installer,
 * without leaving the app or going to GitHub. What Android does not allow is a
 * silent install — the last tap is always the person's.
 */
export function UpdateSplash({ info, autoDownload, onDismiss, unfinished = false }: UpdateSplashProps) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const descarga = useUpdateDownload();

  /**
   * The automatic download starts by itself, once.
   *
   * The `ref` stops it starting again: this component redraws on every step of
   * the bar, and without it each step would start it over.
   */
  const jaComecou = useRef(false);

  useEffect(() => {
    if (!info || !autoDownload || jaComecou.current) {
      return;
    }
    jaComecou.current = true;
    void descarga.start(info);
    // Only `start`, which is stable: the hook's object is new on every render,
    // and with it in the dependencies this ran on every step of the bar.
  }, [info, autoDownload, descarga.start]);

  if (!info) {
    return null;
  }

  /**
   * Whoever asked for nothing must be able to leave.
   *
   * On a download the person started, "not now" goes away: closing halfway
   * left a partial file and nobody knowing whether it had updated. **On an
   * automatic download it is the other way round** — it started without asking,
   * and with no way out they were stuck on the notice until the installer
   * jumped in front. Giving up does not cancel the download: it only stops the
   * installer from opening.
   */
  const podeAdiar = !descarga.downloading || autoDownload;

  return (
    <Modal
      visible
      animationType="fade"
      transparent
      // Without this the margin depended on whether the screen draws under the
      // system bars, which varies from phone to phone.
      statusBarTranslucent
      navigationBarTranslucent
      // Postponing with Android's back button is what one expects of a notice.
      onRequestClose={
        podeAdiar
          ? () => {
              descarga.cancel();
              onDismiss();
            }
          : undefined
      }
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.icon}>
            <MaterialCommunityIcons
              name="package-down"
              size={30}
              color={theme.onAccent}
            />
          </View>

          <Text style={styles.title}>
            {unfinished ? strings.settings.installUnfinished : strings.settings.updateTitle}
          </Text>
          <Text style={styles.version}>
            {info.version} · {formatBytes(info.bytes)}
          </Text>

          {/*
            What changed, briefly. The Release text is written by whoever built
            it and is not translated: it is this version's list of commits.
          */}
          {info.notes.length > 0 && !descarga.downloading ? (
            <View style={styles.notesBox}>
              {info.notes.slice(0, SPLASH_NOTES).map((note, i) => (
                <View key={i} style={styles.noteRow}>
                  <Text style={styles.noteDot}>•</Text>
                  <Text style={styles.notes} numberOfLines={2}>
                    {note}
                  </Text>
                </View>
              ))}
              {info.notes.length > SPLASH_NOTES ? (
                // The rest is on the Release's page: the whole changelog.
                <Pressable
                  hitSlop={8}
                  onPress={() => void Linking.openURL(RELEASE_PAGE_URL(info.build))}
                >
                  <Text style={styles.notesMore}>
                    {strings.settings.moreChanges(info.notes.length - SPLASH_NOTES)} ·{' '}
                    <Text style={styles.notesLink}>{strings.settings.fullChangelog}</Text>
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {descarga.downloading ? (
            <View style={styles.track}>
              <View
                style={[styles.fill, { width: `${Math.round((descarga.progress ?? 0) * 100)}%` }]}
              />
            </View>
          ) : null}

          {descarga.error ? <Text style={styles.error}>{descarga.error}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            disabled={descarga.downloading}
            onPress={() =>
              void (descarga.ready ? descarga.install() : descarga.start(info))
            }
          >
            {descarga.downloading ? (
              <ActivityIndicator size="small" color={theme.onAccent} />
            ) : (
              <MaterialCommunityIcons
                name={descarga.ready ? 'cellphone-arrow-down' : 'download'}
                size={18}
                color={theme.onAccent}
              />
            )}
            <Text style={styles.primaryText}>
              {descarga.downloading
                ? `${strings.settings.downloadingUpdate} ${Math.round((descarga.progress ?? 0) * 100)}%`
                : descarga.ready || unfinished
                  ? strings.settings.installUpdate
                  : strings.settings.updateNow}
            </Text>
          </Pressable>

          {podeAdiar ? (
            <Pressable
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
              onPress={() => {
                descarga.cancel();
                onDismiss();
              }}
            >
              <Text style={styles.secondaryText}>{strings.settings.updateLater}</Text>
            </Pressable>
          ) : null}

        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'center',
      paddingHorizontal: 22,
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 26,
      padding: 24,
      gap: 12,
      alignItems: 'center',
      elevation: 14,
      shadowColor: '#000000',
      shadowOpacity: 0.3,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 6 },
    },
    icon: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    title: {
      fontSize: 19,
      fontWeight: '800',
      color: theme.text,
      textAlign: 'center',
    },
    version: {
      fontSize: 13,
      color: theme.textMuted,
      textAlign: 'center',
      marginTop: -6,
    },
    notesBox: {
      alignSelf: 'stretch',
      gap: 4,
    },
    noteRow: {
      flexDirection: 'row',
      gap: 6,
    },
    noteDot: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.accent,
    },
    notes: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      color: theme.textMuted,
    },
    notesMore: {
      fontSize: 12,
      color: theme.textMuted,
      marginLeft: 13,
    },
    notesLink: {
      color: theme.accent,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    track: {
      alignSelf: 'stretch',
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
    error: {
      fontSize: 12,
      color: theme.danger,
      textAlign: 'center',
    },
    primary: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.accent,
      borderRadius: 16,
      paddingVertical: 14,
      marginTop: 4,
    },
    primaryText: {
      color: theme.onAccent,
      fontSize: 15,
      fontWeight: '700',
    },
    secondary: {
      alignSelf: 'stretch',
      alignItems: 'center',
      paddingVertical: 10,
    },
    secondaryText: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: '600',
    },
    pressed: {
      opacity: 0.85,
    },
  });
}
