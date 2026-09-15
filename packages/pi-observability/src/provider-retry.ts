import type {
  ProviderRetryClassification,
  ProviderRetryEvent,
  ProviderRetryOutcome,
} from './types';
import { telemetry, type TelemetryRecorder } from './recorder';

export interface ProviderRetryError {
  classification: ProviderRetryClassification;
  code: string;
}

export interface ProviderRetryPolicy {
  provider: string;
  operation: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterFraction?: number;
  classify?: (error: unknown) => ProviderRetryError;
  signal?: AbortSignal;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  recorder?: TelemetryRecorder;
}

export interface ProviderRetryResult<T> {
  value: T;
  attempts: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const DEFAULT_MAX_DELAY_MS = 2_000;

function errorCode(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return 'aborted';
  if (error instanceof Error && error.message) {
    const status = error.message.match(/\b(?:408|425|429|5\d\d)\b/)?.[0];
    if (status) return `http_${status}`;
    return error.message.split(/[\s:]/, 1)[0]!.toLowerCase().slice(0, 64) || 'provider_error';
  }
  return 'provider_error';
}

export function classifyProviderError(error: unknown, signal?: AbortSignal): ProviderRetryError {
  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return { classification: 'abort', code: 'aborted' };
  }
  const status = error instanceof Response ? error.status :
    (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : undefined);
  if (status !== undefined && (status === 408 || status === 425 || status === 429 || status >= 500)) {
    return { classification: 'transient', code: `http_${status}` };
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (/\b(?:408|425|429|5\d\d)\b|timeout|timed out|temporar|rate limit|econnreset|socket hang up|network/.test(message)) {
    return { classification: 'transient', code: errorCode(error) };
  }
  return { classification: 'permanent', code: errorCode(error) };
}

function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number, jitterFraction: number): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  if (jitterFraction <= 0) return exponential;
  const jitter = exponential * jitterFraction * Math.random();
  return Math.min(maxDelayMs, Math.round(exponential + jitter));
}

async function defaultSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    const abort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('Operation aborted'), { name: 'AbortError' }));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function emitRetry(
  recorder: TelemetryRecorder,
  values: Omit<ProviderRetryEvent, 'ts' | 'sessionId' | 'runId' | 'kind'>,
): void {
  recorder.recordProviderRetry(values);
}

export async function executeWithProviderRetry<T>(
  operation: (attempt: number, signal?: AbortSignal) => Promise<T>,
  policy: ProviderRetryPolicy,
): Promise<ProviderRetryResult<T>> {
  const maxAttempts = Math.max(1, Math.floor(policy.maxAttempts ?? DEFAULT_MAX_ATTEMPTS));
  const baseDelayMs = Math.max(0, policy.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const maxDelayMs = Math.max(baseDelayMs, policy.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
  const jitterFraction = Math.min(1, Math.max(0, policy.jitterFraction ?? 0));
  const recorder = policy.recorder ?? telemetry;
  const classify = policy.classify ?? ((error: unknown) => classifyProviderError(error, policy.signal));
  const sleep = policy.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (policy.signal?.aborted) {
      const error = Object.assign(new Error('Operation aborted'), { name: 'AbortError' });
      emitRetry(recorder, eventValues(policy, attempt, maxAttempts, 'abort', 'aborted', 0, 'aborted'));
      throw error;
    }
    try {
      const value = await operation(attempt, policy.signal);
      if (attempt > 1) emitRetry(recorder, eventValues(policy, attempt, maxAttempts, 'transient', 'succeeded', 0));
      return { value, attempts: attempt };
    } catch (error) {
      const result = classify(error);
      if (result.classification === 'abort') {
        emitRetry(recorder, eventValues(policy, attempt, maxAttempts, result.classification, 'aborted', 0, result.code));
        throw error;
      }
      const canRetry = result.classification === 'transient' && attempt < maxAttempts;
      const delayMs = canRetry ? backoffDelay(attempt, baseDelayMs, maxDelayMs, jitterFraction) : 0;
      emitRetry(recorder, eventValues(policy, attempt, maxAttempts, result.classification, canRetry ? 'retry_scheduled' : 'failed', delayMs, result.code));
      if (!canRetry) throw error;
      try {
        await sleep(delayMs, policy.signal);
      } catch (sleepError) {
        const abort = policy.signal?.aborted || (sleepError instanceof Error && sleepError.name === 'AbortError');
        if (abort) {
          emitRetry(recorder, eventValues(policy, attempt, maxAttempts, 'abort', 'aborted', 0, 'aborted'));
        }
        throw sleepError;
      }
    }
  }
  throw new Error('Provider retry exhausted without an attempt');
}

function eventValues(
  policy: ProviderRetryPolicy,
  attempt: number,
  maxAttempts: number,
  classification: ProviderRetryClassification,
  outcome: ProviderRetryOutcome,
  delayMs: number,
  code?: string,
): Omit<ProviderRetryEvent, 'ts' | 'sessionId' | 'runId' | 'kind'> {
  return {
    schema: 'upup.pi.provider-retry.v1',
    provider: policy.provider,
    operation: policy.operation,
    attempt,
    maxAttempts,
    classification,
    outcome,
    delayMs,
    ...(code ? { errorCode: code } : {}),
  };
}
