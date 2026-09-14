/**
 * Shared capacity-wake primitive for bridge poll loops.
 *
 * Bridge poll loops (repl-bridge, multi-session bridge) need to sleep while
 * "at capacity" but wake early when either (a) the outer loop signal aborts
 * (shutdown), or (b) capacity frees up (session done / transport lost).
 * This module encapsulates the mutable wake-controller + two-signal merger
 * that poll loops would otherwise duplicate.
 *
 * Pattern:
 *   const wake = createCapacityWake(outerAbortSignal);
 *   while (running) {
 *     const { signal, cleanup } = wake.signal();
 *     try {
 *       await sleepUntilWork(POLL_AT_CAPACITY, signal);
 *     } finally { cleanup(); }
 *     // ... poll for new work ...
 *     wake.wake();  // when capacity frees
 *   }
 */

export interface CapacitySignal {
  signal: AbortSignal;
  cleanup: () => void;
}

export interface CapacityWake {
  /**
   * Create a signal that aborts when either the outer loop signal or the
   * capacity-wake controller fires. Returns the merged signal and a cleanup
   * function that removes listeners when the sleep resolves normally
   * (without abort).
   */
  signal(): CapacitySignal;
  /**
   * Abort the current at-capacity sleep and arm a fresh controller so the
   * poll loop immediately re-checks for new work.
   */
  wake(): void;
}

export function createCapacityWake(outerSignal: AbortSignal): CapacityWake {
  let wakeController = new AbortController();

  function wake(): void {
    wakeController.abort();
    wakeController = new AbortController();
  }

  function signal(): CapacitySignal {
    const merged = new AbortController();
    const abort = (): void => merged.abort();
    if (outerSignal.aborted || wakeController.signal.aborted) {
      merged.abort();
      return { signal: merged.signal, cleanup: () => {} };
    }
    outerSignal.addEventListener('abort', abort, { once: true });
    const capSig = wakeController.signal;
    capSig.addEventListener('abort', abort, { once: true });
    return {
      signal: merged.signal,
      cleanup: () => {
        outerSignal.removeEventListener('abort', abort);
        capSig.removeEventListener('abort', abort);
      },
    };
  }

  return { signal, wake };
}
