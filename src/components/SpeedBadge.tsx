import { StyleSheet, Text, View } from 'react-native';

import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

interface SpeedBadgeProps {
  /**
   * A velocidade em km/h, ou `null` quando não se sabe.
   *
   * `null` é mesmo "não sei" e não "parado": o velocímetro desaparece em vez de
   * mostrar zero. Num túnel, mostrar zero a quem vai a 100 seria pior do que não
   * mostrar nada.
   */
  kmh: number | null;
  /** Vai-se acima do limite conhecido. Pinta o número de vermelho. */
  overLimit?: boolean;
  /** Onde fica, em pontos a contar da borda de baixo do ecrã. */
  bottom: number;
}

/**
 * O velocímetro.
 *
 * Vive à parte porque aparece em **dois sítios**: dentro do ecrã de navegação e
 * por cima do mapa a andar de carro sem navegar. Duas cópias do mesmo desenho
 * acabariam por divergir — e o que divergiria era o alinhamento, que é o que se
 * nota a conduzir.
 */
export function SpeedBadge({ kmh, overLimit = false, bottom }: SpeedBadgeProps) {
  const theme = useTheme();
  const strings = useT();

  if (kmh === null) {
    return null;
  }

  const styles = makeStyles(theme, bottom);

  return (
    <View style={[styles.box, overLimit && styles.over]}>
      <Text style={[styles.value, overLimit && styles.valueOver]}>{kmh}</Text>
      <Text style={[styles.unit, overLimit && styles.unitOver]}>
        {strings.navigation.speedUnit}
      </Text>
    </View>
  );
}

function makeStyles(theme: Theme, bottom: number) {
  return StyleSheet.create({
    box: {
      position: 'absolute',
      left: 16,
      bottom,
      minWidth: 64,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
      elevation: 6,
      shadowColor: '#000000',
      shadowOpacity: 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
    },
    over: {
      backgroundColor: theme.danger,
    },
    value: {
      fontSize: 26,
      fontWeight: '800',
      color: theme.text,
      letterSpacing: -0.8,
      // Sem isto a caixa mudava de altura entre "9" e "90", e o velocímetro
      // dava um salto de cada vez que se passava uma dezena.
      lineHeight: 30,
    },
    valueOver: {
      color: theme.onAccent,
    },
    unit: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.textMuted,
      marginTop: 1,
    },
    unitOver: {
      color: theme.onAccent,
    },
  });
}
