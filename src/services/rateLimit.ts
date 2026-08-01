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

  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(async () => {
      const waitFor = lastRequestAt + minIntervalMs - Date.now();
      if (waitFor > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitFor));
      }
      lastRequestAt = Date.now();
      return task();
    });

    // A fila continua mesmo que este pedido falhe, senão bloqueava os seguintes.
    queue = result.catch(() => undefined);
    return result;
  };
}
