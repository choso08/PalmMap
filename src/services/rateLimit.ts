/**
 * Fila que garante um intervalo mínimo entre pedidos a um serviço.
 *
 * O Nominatim e a Overpass são mantidos por voluntários e têm limites de
 * utilização. Isto garante que, por mais depressa que a aplicação peça coisas,
 * os pedidos saem espaçados.
 */
export function createRateLimiter(minIntervalMs: number) {
  let queue: Promise<unknown> = Promise.resolve();
  let lastRequestAt = 0;

  /**
   * `isWanted`, quando existe, é perguntado **no momento de sair** — e se já
   * ninguém quiser a resposta, o pedido não sai.
   *
   * **Sem isto a fila entregava respostas a quem já tinha ido embora.** Arrastar
   * o mapa três vezes seguidas deixava três pedidos em fila, cada um dois
   * segundos atrás do outro; o que interessava, o da zona que se está a ver, era
   * o último, e só saía depois de os outros dois — para áreas que já nem estavam
   * no ecrã — terem ocupado o serviço. Um pedido saltado não conta para o
   * intervalo: não saiu, não pesou a ninguém.
   */
  return function schedule<T>(task: () => Promise<T>, isWanted?: () => boolean): Promise<T> {
    const result = queue.then(async () => {
      if (isWanted && !isWanted()) {
        throw new SupersededError();
      }
      const waitFor = lastRequestAt + minIntervalMs - Date.now();
      if (waitFor > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitFor));
      }
      // Pergunta-se outra vez depois da espera: é nela que se costuma desistir.
      if (isWanted && !isWanted()) {
        throw new SupersededError();
      }
      lastRequestAt = Date.now();
      return task();
    });

    // A fila continua mesmo que este pedido falhe, senão bloqueava os seguintes.
    queue = result.catch(() => undefined);
    return result;
  };
}

/** Um pedido que não chegou a sair porque já ninguém queria a resposta. */
export class SupersededError extends Error {}
