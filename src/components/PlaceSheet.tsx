import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../settings';
import type { Theme } from '../theme';
import type { Place } from '../types/geo';

interface PlaceSheetProps {
  place: Place;
  onRoute: () => void;
  onClose: () => void;
}

/** Uma linha de detalhe com ícone à esquerda. */
function DetailRow({
  icon,
  children,
  onPress,
  styles,
  color,
}: {
  icon: string;
  children: string;
  onPress?: () => void;
  styles: ReturnType<typeof makeStyles>;
  color: string;
}) {
  const content = (
    <View style={styles.detailRow}>
      <MaterialCommunityIcons name={icon as never} size={17} color={color} />
      <Text style={[styles.detailText, onPress && styles.link]} numberOfLines={2}>
        {children}
      </Text>
    </View>
  );

  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

/**
 * Ficha de um negócio: nome, tipo, morada e o que o OpenStreetMap souber sobre
 * horário, telefone e sítio na Internet. Daqui traça-se o percurso.
 */
export function PlaceSheet({ place, onRoute, onClose }: PlaceSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const { phone, website, openingHours } = place.details ?? {};

  return (
    <View style={styles.container}>
      <View style={styles.handle} />

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={2}>
            {place.name}
          </Text>
          {place.category ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{place.category}</Text>
            </View>
          ) : null}
        </View>
        <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
          <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
        </Pressable>
      </View>

      <View style={styles.details}>
        {place.address ? (
          <DetailRow icon="map-marker" styles={styles} color={theme.textMuted}>
            {place.address}
          </DetailRow>
        ) : null}

        {openingHours ? (
          <DetailRow icon="clock-outline" styles={styles} color={theme.textMuted}>
            {openingHours}
          </DetailRow>
        ) : null}

        {phone ? (
          <DetailRow
            icon="phone"
            styles={styles}
            color={theme.accent}
            onPress={() => void Linking.openURL(`tel:${phone}`)}
          >
            {phone}
          </DetailRow>
        ) : null}

        {website ? (
          <DetailRow
            icon="web"
            styles={styles}
            color={theme.accent}
            onPress={() => void Linking.openURL(website)}
          >
            {website}
          </DetailRow>
        ) : null}
      </View>

      <Pressable style={styles.button} onPress={onRoute}>
        <MaterialCommunityIcons name="directions" size={19} color={theme.onAccent} />
        <Text style={styles.buttonText}>Traçar percurso</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 28,
      elevation: 12,
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: -3 },
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      marginBottom: 14,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    headerText: {
      flex: 1,
    },
    name: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
      letterSpacing: -0.3,
    },
    badge: {
      alignSelf: 'flex-start',
      marginTop: 6,
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: theme.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.accent,
    },
    closeButton: {
      padding: 4,
      borderRadius: 14,
      backgroundColor: theme.surfaceMuted,
    },
    details: {
      marginTop: 16,
      gap: 11,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    detailText: {
      flex: 1,
      fontSize: 14,
      color: theme.textMuted,
    },
    link: {
      color: theme.accent,
      fontWeight: '600',
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 20,
      backgroundColor: theme.accent,
      borderRadius: 14,
      paddingVertical: 15,
    },
    buttonText: {
      color: theme.onAccent,
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
