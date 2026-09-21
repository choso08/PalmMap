import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Guarda o que fechou a aplicação, para se poder ler da próxima vez que abrir.
 *
 * **Isto existe por causa do buraco que o `ErrorBoundary` já declarava.** Ele
 * apanha os erros de desenho do ecrã e mostra-os — mas um erro dentro de uma
 * promessa, de um `setTimeout` ou de uma chamada vinda do lado nativo passa-lhe
 * ao lado. Numa aplicação compilada esses não dão ecrã vermelho nenhum: vão
 * direitos ao tratador global do React Native, que em versão de lançamento os
 * entrega ao Android como erro fatal. A aplicação desaparece, e quem a estava a
 * usar fica só com "a aplicação fechou-se".
 *
 * Isto não conserta nada — conserta o **relato**, que é a mesma decisão que já
 * se tomou nos erros dos horários: sem telemóvel à mão, uma mensagem numa
 * fotografia poupa várias rondas de adivinhação.
 *
 * **Guarda-se e deixa-se fechar.** Tentar manter viva uma aplicação cujo estado
 * já rebentou é como continuar a conduzir com o motor partido: o que vem a
 * seguir é pior de perceber do que o que aconteceu. O texto fica no telemóvel e
 * aparece nas definições ao abrir outra vez.
 *
 * Não sai nada daqui para lado nenhum: fica no `AsyncStorage`, como tudo o resto.
 */

const CRASH_KEY = 'palmmap.ultimaFalha';

export interface CrashReport {
  /** O que rebentou, já em texto. */
  message: string;
  /** Onde, se o motor de JavaScript soube dizer. */
  stack: string | null;
  /** Quando, em milissegundos desde 1970. */
  at: number;
  /** De onde veio: o desenho do ecrã, ou o tratador global. */
  origin: 'render' | 'fatal' | 'async';
}

function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return {
      message: `${error.name}: ${error.message}`,
      // A pilha inteira são dezenas de linhas de código empacotado, que num
      // ecrã de telemóvel não se lê nem se fotografa. As primeiras é que dizem
      // alguma coisa.
      stack: error.stack ? error.stack.split('\n').slice(0, 12).join('\n') : null,
    };
  }
  return { message: String(error), stack: null };
}

/** Escreve a falha no telemóvel. Nunca lança — é chamada de dentro de um erro. */
export function recordCrash(error: unknown, origin: CrashReport['origin']): void {
  try {
    const report: CrashReport = { ...describe(error), at: Date.now(), origin };
    void AsyncStorage.setItem(CRASH_KEY, JSON.stringify(report)).catch(() => undefined);
  } catch {
    // Falhar a guardar um erro não pode ser um erro.
  }
}

/** O que ficou guardado da última vez, ou `null` se não houve nenhuma. */
export async function lastCrash(): Promise<CrashReport | null> {
  try {
    const guardado = await AsyncStorage.getItem(CRASH_KEY);
    return guardado ? (JSON.parse(guardado) as CrashReport) : null;
  } catch {
    return null;
  }
}

/** Esquece a falha guardada. É o botão no ecrã de definições. */
export async function forgetCrash(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CRASH_KEY);
  } catch {
    // Nada a fazer.
  }
}

/**
 * Liga o registo das falhas. Chama-se uma vez, no arranque, antes de tudo.
 *
 * **Encadeia-se no tratador que já lá está em vez de o substituir.** O do React
 * Native é quem mostra o ecrã vermelho em desenvolvimento e quem entrega o erro
 * ao Android em versão de lançamento; tirá-lo do caminho trocaria um problema
 * por outro — deixávamos de ver o erro onde ele hoje se vê.
 */
export function installCrashHandler(): void {
  try {
    const global_ = globalThis as unknown as {
      ErrorUtils?: {
        getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
        setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => void;
      };
    };
    const utils = global_.ErrorUtils;
    if (!utils) {
      return;
    }

    const anterior = utils.getGlobalHandler();
    utils.setGlobalHandler((error, isFatal) => {
      recordCrash(error, isFatal ? 'fatal' : 'async');
      anterior?.(error, isFatal);
    });
  } catch {
    // Sem tratador global, fica-se pelo `ErrorBoundary`, como antes.
  }
}

/**
 * Embrulha uma função para que um erro lá dentro fique registado em vez de
 * fechar a aplicação.
 *
 * **É para as funções que o lado nativo chama**, e só para essas: o seguimento
 * da posição, que corre a cada segundo durante uma viagem inteira. Um erro numa
 * função destas não passa por nenhum `try` nosso nem pelo `ErrorBoundary` — vai
 * direito ao tratador global e, numa aplicação compilada, fecha-a. A meio de uma
 * estrada, isso é o pior sítio possível para a aplicação desaparecer.
 *
 * O que se perde é uma leitura do GPS, e a seguinte chega um segundo depois. O
 * que se ganha é a viagem continuar e ficar escrito o que rebentou — que é a
 * única forma de vir a ser corrigido.
 *
 * **Não se usa isto por todo o lado.** Engolir erros em código normal esconde
 * avarias; aqui a alternativa não é ver o erro, é a aplicação fechar-se.
 */
export function guarded<A extends unknown[]>(
  fn: (...args: A) => void,
): (...args: A) => void {
  return (...args: A) => {
    try {
      fn(...args);
    } catch (error) {
      recordCrash(error, 'async');
      console.error('PalmMap: erro numa leitura da posição', error);
    }
  };
}
