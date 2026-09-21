import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { t } from '../i18n';
import type { UpdateInfo } from '../services/update';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import { useUpdateDownload } from '../useUpdateDownload';

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb < 10 ? 1 : 0).replace('.', t().units.decimal)} MB`;
}

interface UpdateSplashProps {
  /** A versão nova, ou `null` quando não há nada a anunciar. */
  info: UpdateInfo | null;
  /**
   * Se se pode descarregar sozinha, sem ninguém carregar em nada.
   *
   * É verdade em Wi-Fi e falso nos dados móveis — ver `onWifi`. São dezenas de
   * megabytes, e gastá-los no plafond de alguém sem perguntar é exatamente o
   * que já se decidiu não fazer com os mapas dos países.
   */
  autoDownload: boolean;
  /** Adiar: fecha e não volta a aparecer para esta versão. */
  onDismiss: () => void;
}

/**
 * O aviso que aparece ao abrir a aplicação quando saiu versão nova.
 *
 * **Aparece uma vez por versão.** Quem carregar em "agora não" não volta a vê-lo
 * para aquela versão — fica só o ponto no botão das definições. Um aviso que
 * reaparece a cada arranque deixa de ser lido ao fim de dois dias, que é a mesma
 * lição dos avisos de radar.
 *
 * Tudo acontece aqui dentro: carregar em atualizar descarrega e abre o
 * instalador, sem sair da aplicação e sem ir ao GitHub. O que o Android não
 * deixa é instalar em silêncio — o último toque é sempre da pessoa.
 */
export function UpdateSplash({ info, autoDownload, onDismiss }: UpdateSplashProps) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const descarga = useUpdateDownload();

  /**
   * A descarga automática arranca sozinha, uma vez.
   *
   * A `ref` é o que a impede de voltar a arrancar: este componente redesenha-se
   * a cada avanço da barra, e sem ela cada avanço mandava começar outra vez.
   */
  const jaComecou = useRef(false);

  useEffect(() => {
    if (!info || !autoDownload || jaComecou.current) {
      return;
    }
    jaComecou.current = true;
    void descarga.start(info);
    // Só o `start`, que é estável: o objeto do gancho é novo a cada desenho, e
    // com ele nas dependências isto corria a cada avanço da barra.
  }, [info, autoDownload, descarga.start]);

  if (!info) {
    return null;
  }

  /**
   * Quem não pediu nada tem de poder sair.
   *
   * Numa descarga que a pessoa mandou fazer, o "agora não" desaparece: fechar a
   * meio deixava um ficheiro incompleto e ninguém a saber se tinha atualizado.
   * **Numa descarga automática é ao contrário** — ela começou sem lhe
   * perguntarem, e sem saída ficava presa ao aviso até o instalador lhe saltar à
   * frente. Desistir não cancela a descarga: só impede o instalador de abrir.
   */
  const podeAdiar = !descarga.downloading || autoDownload;

  return (
    <Modal
      visible
      animationType="fade"
      transparent
      // Sem isto a margem dependia de o ecrã desenhar ou não por baixo das
      // barras do sistema, que varia de telemóvel para telemóvel.
      statusBarTranslucent
      navigationBarTranslucent
      // Adiar com o botão de voltar do Android é o que se espera de um aviso.
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

          <Text style={styles.title}>{strings.settings.updateTitle}</Text>
          <Text style={styles.version}>
            {info.version} · {formatBytes(info.bytes)}
          </Text>

          {/*
            O que mudou, curto. O texto da Release é escrito por quem compilou e
            não é traduzido: é a lista dos commits desta versão.
          */}
          {info.notes && !descarga.downloading ? (
            <Text style={styles.notes} numberOfLines={4}>
              {info.notes}
            </Text>
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
                : descarga.ready
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

          <Text style={styles.note}>{strings.settings.updateManualNote}</Text>
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
    notes: {
      fontSize: 12,
      lineHeight: 18,
      color: theme.textMuted,
      textAlign: 'center',
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
    note: {
      fontSize: 11,
      lineHeight: 15,
      color: theme.textMuted,
      textAlign: 'center',
    },
  });
}
