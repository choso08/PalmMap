import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * Apanha os erros que acontecem a desenhar o ecrã.
 *
 * **Numa aplicação compilada, um erro destes fecha a aplicação sem dizer nada.**
 * Em desenvolvimento aparece o ecrã vermelho com a explicação; no APK a
 * aplicação simplesmente desaparece, e quem estava a usá-la fica sem forma de
 * dizer o que aconteceu — que é exatamente o pior caso para quem a tem de
 * arranjar.
 *
 * Isto não conserta nada: conserta o **relato**. Em vez de a aplicação fechar,
 * fica no ecrã o que correu mal, para se poder ler e contar. Não é preciso
 * nenhum serviço de fora nem nada que saia do telemóvel.
 *
 * **Só apanha erros de desenho.** Um erro dentro de uma promessa, ou uma avaria
 * do lado nativo, passa ao lado disto — é uma limitação do React e não uma
 * escolha. Serve para a classe de erro mais comum, não para todas.
 *
 * Os textos aqui não passam pela tabela das línguas de propósito: se o que
 * rebentou foi o desenho do ecrã, o contexto que serve os textos pode ser
 * precisamente o que está em falta.
 */

interface Props {
  children: ReactNode;
}

interface State {
  message: string | null;
  stack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null, stack: null };

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return {
      message,
      stack: error instanceof Error ? (error.stack ?? null) : null,
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Fica no registo do sistema, para quem conseguir ligar o telemóvel ao
    // computador. Quem não conseguir tem o texto no ecrã, que é o essencial.
    console.error('PalmMap: erro a desenhar o ecrã', error, info.componentStack);
  }

  render() {
    if (this.state.message === null) {
      return this.props.children;
    }

    return (
      <View style={styles.screen}>
        <Text style={styles.title}>O PalmMap encontrou um erro</Text>
        <Text style={styles.lead}>
          Em vez de fechar, fica aqui o que aconteceu. Se puder, tire uma
          fotografia a este ecrã — é o que permite corrigir o problema.
        </Text>

        <ScrollView style={styles.box} contentContainerStyle={styles.boxInner}>
          <Text style={styles.message}>{this.state.message}</Text>
          {this.state.stack ? (
            <Text style={styles.stack}>{this.state.stack}</Text>
          ) : null}
        </ScrollView>

        <Pressable
          style={styles.button}
          onPress={() => this.setState({ message: null, stack: null })}
        >
          <Text style={styles.buttonText}>Tentar outra vez</Text>
        </Pressable>
      </View>
    );
  }
}

/*
 * As cores estão escritas à mão, ao contrário de toda a restante aplicação.
 * É a única exceção, e por uma razão: este ecrã tem de conseguir desenhar-se
 * quando o resto falhou — incluindo o contexto de onde vem o tema.
 */
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#12181B',
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 40,
    gap: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  lead: {
    color: '#B6C2C7',
    fontSize: 14,
    lineHeight: 20,
  },
  box: {
    flex: 1,
    backgroundColor: '#0A0E10',
    borderRadius: 14,
  },
  boxInner: {
    padding: 14,
    gap: 12,
  },
  message: {
    color: '#F08A72',
    fontSize: 13,
    fontWeight: '700',
  },
  stack: {
    color: '#8FA0A7',
    fontSize: 11,
    lineHeight: 16,
  },
  button: {
    backgroundColor: '#2E7D8F',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
