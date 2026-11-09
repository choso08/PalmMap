import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { recordCrash } from '../services/crash';

/**
 * Catches the errors that happen while drawing the screen.
 *
 * **In a compiled app, an error like this closes the app without a word.** In
 * development the red screen explains it; in the APK the app just vanishes,
 * and whoever was using it has no way of saying what happened — the worst case
 * for whoever has to fix it.
 *
 * This fixes nothing: it fixes the **report**. Instead of the app closing,
 * what went wrong stays on screen, to be read and passed on. No outside
 * service is needed and nothing leaves the phone.
 *
 * **It only catches drawing errors.** An error inside a promise, or a fault on
 * the native side, goes past it — a React limitation, not a choice. It covers
 * the most common kind of error, not all of them. What escapes it is kept by
 * `installCrashHandler()` and shows in Settings the next time the app opens —
 * see `src/services/crash.ts`.
 *
 * The texts here skip the language table on purpose: if what blew up was the
 * drawing of the screen, the context that serves the texts may be exactly
 * what is missing.
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
    // It goes to the system log, for whoever can plug the phone into a
    // computer. Whoever cannot has the text on screen, which is what matters.
    console.error('PalmMap: erro a desenhar o ecrã', error, info.componentStack);
    // And it is kept on the phone, in case the person closes the app without
    // photographing this screen. It can be read later in Settings.
    recordCrash(error, 'render');
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
 * The colours are written by hand, unlike everywhere else in the app. It is
 * the only exception, and for a reason: this screen has to be able to draw
 * itself when the rest has failed — including the context the theme comes from.
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
