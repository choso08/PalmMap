/**
 * A queue that guarantees a minimum interval between requests to a service.
 *
 * Nominatim and Overpass are run by volunteers and have usage limits. This
 * makes sure that, however fast the app asks for things, the requests go out
 * spaced apart.
 */
export function createRateLimiter(
  minIntervalMs: number,
  {
    overlap = false,
  }: {
    /**
     * Lets the next request go out without waiting for this one's response —
     * the interval counts between **departures**, not between responses.
     *
     * By default the queue waits for the response, and for Nominatim and
     * Overpass that is what is wanted: one request at a time. For Carris it is
     * not: trip planning asks for a dozen stops, and queued up waiting for each
     * response it took more than ten seconds, measured against the real API.
     */
    overlap?: boolean;
  } = {},
) {
  let queue: Promise<unknown> = Promise.resolve();
  let lastRequestAt = 0;

  /**
   * `isWanted`, when given, is asked **at the moment of departure** — and if
   * nobody wants the response any more, the request does not go out.
   *
   * **Without this the queue delivered responses to callers who had already
   * left.** Dragging the map three times in a row left three requests queued,
   * each two seconds behind the other; the one that mattered, for the area on
   * screen, was the last, and only went out after the other two — for areas no
   * longer even on screen — had occupied the service. A skipped request does
   * not count towards the interval: it never went out, it weighed on nobody.
   */
  return function schedule<T>(task: () => Promise<T>, isWanted?: () => boolean): Promise<T> {
    if (overlap) {
      const turn = queue.then(async () => {
        if (isWanted && !isWanted()) {
          throw new SupersededError();
        }
        const waitFor = lastRequestAt + minIntervalMs - Date.now();
        if (waitFor > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitFor));
        }
        lastRequestAt = Date.now();
      });
      queue = turn.catch(() => undefined);
      return turn.then(task);
    }

    const result = queue.then(async () => {
      if (isWanted && !isWanted()) {
        throw new SupersededError();
      }
      const waitFor = lastRequestAt + minIntervalMs - Date.now();
      if (waitFor > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitFor));
      }
      // Ask again after the wait: that is usually when callers give up.
      if (isWanted && !isWanted()) {
        throw new SupersededError();
      }
      lastRequestAt = Date.now();
      return task();
    });

    // The queue carries on even if this request fails, or it would block the
    // following ones.
    queue = result.catch(() => undefined);
    return result;
  };
}

/** A request that never went out because nobody wanted the response any more. */
export class SupersededError extends Error {}
