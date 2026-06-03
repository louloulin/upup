/**
 * Worker Resume — failure recovery for Worker tasks.
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/design.md (D2)
 *      + analysis-comprehensive.md (Sprint 2.1.4)
 *
 * When a Worker fails, the loucode-style protocol is:
 *   1. Coordinator issues TaskStop to the Worker (clean shutdown).
 *   2. Coordinator inspects the failure to decide if a retry is worth it.
 *   3. If yes, Coordinator issues SendMessage with a revised directive
 *      (a `retry-directive` block that includes the prior error).
 *   4. Worker retries; if it succeeds, normal flow continues.
 *   5. After `maxAttempts`, Coordinator marks the task as `failed` and
 *      surfaces an `escalated` event so the main Agent can take over.
 *
 * For upup, the Worker is the injected `WorkerExecutor.runResearch` /
 * `implement` / `verify` call. The "TaskStop" + "SendMessage" are emitted
 * as `WorkerResumeEvent`s the caller can wire to the event bus or to the
 * task list (`taskList.update({ notes })`). The actual retry just calls
 * `fn()` again with exponential backoff.
 */

export type WorkerResumeEventType = 'retry' | 'exhausted' | 'escalated';

export interface WorkerResumeEvent {
  type: WorkerResumeEventType;
  /** 1-indexed attempt number that just produced this event. */
  attempt: number;
  /** The error from the failed attempt (always set). */
  error: Error;
  /** Delay before the next attempt (only set for type='retry'). */
  nextDelayMs?: number;
  /** Human-readable directive the caller can write to the task notes. */
  directive?: string;
}

export interface WorkerResumePolicy {
  /**
   * Total attempts including the first try. Default 3 = 1 initial + 2 retries.
   * Set to 1 to disable retries.
   */
  maxAttempts: number;
  /** Initial backoff in ms before the first retry. Default 100. */
  initialBackoffMs: number;
  /** Multiplier applied to backoff on each subsequent retry. Default 2. */
  backoffFactor: number;
  /** Cap on backoff to keep waits bounded. Default 2000. */
  maxBackoffMs: number;
  /**
   * Optional predicate to decide whether a given error is retryable. Default
   * returns true for any non-null error. Use to skip retries on logic bugs
   * (e.g. Error('bad config')) and only retry on transient failures
   * (network / timeout / 5xx).
   */
  shouldRetry?: (err: Error, attempt: number) => boolean;
  /**
   * Sleep function, injected for tests. Default uses setTimeout. Tests can
   * pass an in-memory `async () => {}` to skip the wait.
   */
  sleep?: (ms: number) => Promise<void>;
  /** Clock for tests. */
  now?: () => number;
}

export const DEFAULT_WORKER_RESUME_POLICY: WorkerResumePolicy = {
  maxAttempts: 3,
  initialBackoffMs: 100,
  backoffFactor: 2,
  maxBackoffMs: 2000,
  shouldRetry: () => true,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
};

export interface WorkerResumeResult<T> {
  /** The successful return value (only set on success). */
  result?: T;
  /** Number of attempts actually made (1..maxAttempts). */
  attempts: number;
  /** The last error (only set on exhaustion). */
  finalError?: Error;
}

function defaultPolicy(p: Partial<WorkerResumePolicy>): WorkerResumePolicy {
  return { ...DEFAULT_WORKER_RESUME_POLICY, ...p };
}

function backoffMs(attempt: number, p: WorkerResumePolicy): number {
  // attempt is 1-indexed: attempt 1 fails → wait initialBackoffMs.
  // attempt 2 fails → wait initialBackoffMs * backoffFactor.
  const base = p.initialBackoffMs * Math.pow(p.backoffFactor, attempt - 1);
  return Math.min(base, p.maxBackoffMs);
}

/**
 * Build a human-readable retry directive suitable for `taskList.update({ notes })`.
 * Includes the prior error so the next attempt can see what went wrong.
 */
export function buildRetryDirective(err: Error, attempt: number, nextDelayMs: number): string {
  return [
    `retry-attempt=${attempt} next-delay=${nextDelayMs}ms`,
    `prior-error: ${err.message}`,
  ].join(' | ');
}

/**
 * Run `fn` with up to `maxAttempts` attempts. Emits events via `onEvent`
 * (TaskStop → SendMessage → retry; or escalated on exhaustion).
 *
 * @param fn - The async work to retry. Each call is a fresh attempt.
 * @param policy - Resume policy (defaults filled in for missing fields).
 * @param onEvent - Observer for retry / exhausted / escalated events.
 * @returns The first successful result, or `{ finalError, attempts }` on
 *          exhaustion.
 */
export async function runWithResume<T>(
  fn: () => Promise<T>,
  policy: Partial<WorkerResumePolicy> = {},
  onEvent: (e: WorkerResumeEvent) => void = () => {},
): Promise<WorkerResumeResult<T>> {
  const p = defaultPolicy(policy);
  const shouldRetry = p.shouldRetry ?? (() => true);
  const sleep = p.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= p.maxAttempts; attempt++) {
    try {
      const result = await fn();
      return { result, attempts: attempt };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;

      const isLast = attempt >= p.maxAttempts;
      const retryable = shouldRetry(error, attempt);
      if (isLast || !retryable) {
        onEvent({
          type: isLast ? 'exhausted' : 'escalated',
          attempt,
          error,
          directive: isLast
            ? `escalated: ${p.maxAttempts} attempts exhausted, last error: ${error.message}`
            : `escalated: error not retryable at attempt ${attempt}: ${error.message}`,
        });
        return { finalError: error, attempts: attempt };
      }

      const delay = backoffMs(attempt, p);
      onEvent({
        type: 'retry',
        attempt,
        error,
        nextDelayMs: delay,
        directive: buildRetryDirective(error, attempt, delay),
      });
      await sleep(delay);
    }
  }
  // Unreachable, but TypeScript needs a return path.
  return { finalError: lastError ?? new Error('runWithResume: unknown failure'), attempts: p.maxAttempts };
}
