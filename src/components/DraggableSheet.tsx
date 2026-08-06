import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  type GestureResponderHandlers,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface DraggableSheetProps {
  /**
   * O conteúdo do painel.
   *
   * Recebe os gestos para pôr na barrinha do topo. É uma função e não um
   * elemento porque só o painel sabe onde é que a barra dele está — e o gesto
   * tem de ficar **só** aí: se apanhasse o painel inteiro, arrastar uma lista
   * lá dentro puxava o painel para baixo em vez de deslizar a lista.
   */
  children: (dragHandlers: GestureResponderHandlers) => ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Quanto do painel fica à vista quando está encolhido.
   *
   * Dá para o título e para o botão de fechar — o suficiente para se saber o
   * que está aberto e para se poder voltar a puxá-lo para cima.
   */
  peek?: number;
}

/** Distância abaixo da qual se considera que foi um toque e não um arrasto. */
const TOQUE_MAX = 5;

/** Velocidade a partir da qual o puxão manda mais do que a posição. */
const PUXAO = 0.5;

/**
 * Faz um painel de baixo poder ser arrastado para o encolher.
 *
 * Serve para o mesmo que no Maps: ver o mapa sem perder o que está aberto.
 * Puxa-se a barrinha para baixo e o painel encolhe até só se ver o título;
 * puxa-se para cima e volta. Um toque simples na barra faz o mesmo, para quem
 * não quiser arrastar.
 *
 * A animação corre do lado nativo (`useNativeDriver`), por isso continua suave
 * mesmo quando o JavaScript está ocupado — que é precisamente o que acontece
 * enquanto se navega.
 */
export function DraggableSheet({ children, style, peek = 104 }: DraggableSheetProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const [height, setHeight] = useState(0);

  /** Onde o painel está pousado: 0 aberto, `maxDown` encolhido. */
  const base = useRef(0);
  const maxDown = Math.max(0, height - peek);

  // Se o conteúdo encolher enquanto o painel está em baixo, o sítio onde ele
  // estava pousado deixa de existir. Sem isto ficava uma faixa vazia no fundo.
  useEffect(() => {
    if (base.current > maxDown) {
      base.current = maxDown;
      translateY.setValue(maxDown);
    }
  }, [maxDown, translateY]);

  const responder = useMemo(() => {
    const pousar = (alvo: number) => {
      base.current = alvo;
      Animated.spring(translateY, {
        toValue: alvo,
        useNativeDriver: true,
        speed: 18,
        bounciness: 2,
      }).start();
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesto) => Math.abs(gesto.dy) > 3,
      onPanResponderMove: (_, gesto) => {
        // Preso entre os dois extremos: não sobe acima do aberto nem desce
        // abaixo do que se decidiu deixar à vista.
        translateY.setValue(Math.min(Math.max(base.current + gesto.dy, 0), maxDown));
      },
      onPanResponderRelease: (_, gesto) => {
        if (Math.abs(gesto.dy) < TOQUE_MAX) {
          // Foi um toque: troca entre aberto e encolhido.
          pousar(base.current > 0 ? 0 : maxDown);
          return;
        }

        const onde = Math.min(Math.max(base.current + gesto.dy, 0), maxDown);

        // A velocidade manda sobre a posição: um puxão decidido para baixo
        // encolhe mesmo que o dedo ainda vá a meio do caminho, que é o que se
        // espera de um gesto rápido.
        if (gesto.vy > PUXAO) {
          pousar(maxDown);
        } else if (gesto.vy < -PUXAO) {
          pousar(0);
        } else {
          pousar(onde > maxDown / 2 ? maxDown : 0);
        }
      },
      onPanResponderTerminate: () => pousar(base.current),
    });
  }, [maxDown, translateY]);

  return (
    <Animated.View
      style={[style, { transform: [{ translateY }] }]}
      onLayout={(event) => {
        const medida = event.nativeEvent.layout.height;
        setHeight((atual) => (Math.abs(medida - atual) > 1 ? medida : atual));
      }}
    >
      {children(responder.panHandlers)}
    </Animated.View>
  );
}
