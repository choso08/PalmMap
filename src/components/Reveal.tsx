import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

interface RevealProps {
  children: ReactNode;
  /**
   * Se o conteúdo deve estar à vista.
   *
   * Ao passar a falso, o conteúdo **não desaparece de repente**: desvanece e só
   * então sai do ecrã. É o que separa uma aplicação que parece acabada de uma
   * onde as coisas piscam.
   */
  visible?: boolean;
  /** De quantos pontos sobe ao aparecer. Negativo faz descer. */
  from?: number;
  style?: StyleProp<ViewStyle>;
}

/** Quanto tempo demora a aparecer. Curto de propósito: isto é uma aplicação de
 * mapas, não uma apresentação — uma animação lenta atrasa quem quer é o mapa. */
const IN_MS = 240;
const OUT_MS = 160;

/**
 * Faz o conteúdo aparecer a subir e a ganhar cor, em vez de surgir de repente.
 *
 * Usa o `Animated` do React Native com `useNativeDriver`, ou seja a animação
 * corre do lado nativo e não trava se o JavaScript estiver ocupado — o que
 * acontece exatamente quando isto aparece, que é quando se acabou de receber
 * uma resposta da Internet.
 */
export function Reveal({ children, visible = true, from = 22, style }: RevealProps) {
  const progress = useRef(new Animated.Value(0)).current;
  /** Fica montado enquanto sai do ecrã, senão não havia nada para animar. */
  const [presente, setPresente] = useState(visible);

  useEffect(() => {
    if (visible) {
      setPresente(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: OUT_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setPresente(false);
      }
    });
  }, [visible, progress]);

  if (!presente) {
    return null;
  }

  return (
    <Animated.View
      // `box-none`: o invólucro nunca apanha toques, só o que está lá dentro.
      // É o que permite tocar no mapa por baixo quando o painel foi encolhido —
      // a caixa deste elemento continua onde estava, mas deixa passar.
      //
      // Enquanto está a desvanecer não apanha nada; sem isto, apanhava toques
      // que já não são para ele.
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [from, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
