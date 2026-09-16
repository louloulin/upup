/**
 * Per-host request gate for public data endpoints that answer a burst with a
 * dropped TCP connection instead of an HTTP error.
 *
 * Measured on 2026-09-17 against `push2.eastmoney.com`: eight concurrent quote
 * requests tripped the limiter, after which every request to that host failed
 * for ~140s — while a sibling host (`push2his`) kept answering, so the block is
 * host-scoped. A gate serializes requests per host, spaces their starts, and
 * after two consecutive resets opens a cooldown that fails fast with an
 * actionable error: retrying into a two-minute block only turns one provider
 * error into three.
 */
export interface HostRequestGateOptions {
  /** Label used in errors; defaults to the resolved host. */
  readonly host?: string;
  /** Minimum spacing between two request starts on the same host. */
  readonly minIntervalMs?: number;
  /** How long requests fail fast once the limiter is detected. */
  readonly cooldownMs?: number;
  /** Consecutive resets that arm the cooldown. */
  readonly resetsBeforeCooldown?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_HOST_MIN_INTERVAL_MS = 500;
export const DEFAULT_HOST_COOLDOWN_MS = 60_000;
export const DEFAULT_HOST_RESETS_BEFORE_COOLDOWN = 2;

export class HostThrottleError extends Error {
  readonly host: string;
  readonly retryAfterMs: number;

  constructor(host: string, retryAfterMs: number) {
    super(
      `${host} 已重置连接（请求过密触发该数据源的限流保护），约 ${Math.max(1, Math.ceil(retryAfterMs / 1000))} 秒后可重试。` +
      '请稍后重试，或改用该数据源的历史行情 / 公告类接口。',
    );
    this.name = 'HostThrottleError';
    this.host = host;
    this.retryAfterMs = retryAfterMs;
  }
}

export function isHostThrottleError(error: unknown): error is HostThrottleError {
  return error instanceof HostThrottleError;
}

/** Bun and Node report a connection the server dropped with these texts/codes. */
export function isSocketResetError(error: unknown): boolean {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message, current.name);
      const code = (current as { code?: unknown }).code;
      if (typeof code === 'string') parts.push(code);
      current = (current as { cause?: unknown }).cause;
      continue;
    }
    parts.push(String(current));
    break;
  }
  return /econnreset|socket connection was closed|socket hang up|connection reset|other side closed/i.test(parts.join(' '));
}

export interface HostRequestGate {
  /** Runs one request; only one runs per host at a time, spaced by the interval. */
  run<T>(operation: () => Promise<T>): Promise<T>;
  /** Milliseconds left in the current cooldown, 0 when the host is usable. */
  retryAfterMs(): number;
  /** Test/teardown hook. */
  reset(): void;
}

export function createHostRequestGate(options: HostRequestGateOptions = {}): HostRequestGate {
  const host = options.host ?? 'host';
  const minIntervalMs = Math.max(0, options.minIntervalMs ?? DEFAULT_HOST_MIN_INTERVAL_MS);
  const cooldownMs = Math.max(0, options.cooldownMs ?? DEFAULT_HOST_COOLDOWN_MS);
  const resetsBeforeCooldown = Math.max(1, options.resetsBeforeCooldown ?? DEFAULT_HOST_RESETS_BEFORE_COOLDOWN);
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }));
  let queue: Promise<void> = Promise.resolve();
  let nextStartAt = 0;
  let cooldownUntil = 0;
  let consecutiveResets = 0;
  const acquire = async (): Promise<void> => {
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const waitMs = nextStartAt - now();
    if (waitMs > 0) await sleep(waitMs);
    nextStartAt = now() + minIntervalMs;
    release();
  };
  return {
    async run<T>(operation: () => Promise<T>): Promise<T> {
      const remaining = cooldownUntil - now();
      if (remaining > 0) throw new HostThrottleError(host, remaining);
      await acquire();
      try {
        const value = await operation();
        consecutiveResets = 0;
        return value;
      } catch (error) {
        if (!isSocketResetError(error)) throw error;
        consecutiveResets += 1;
        if (consecutiveResets < resetsBeforeCooldown) throw error;
        cooldownUntil = now() + cooldownMs;
        throw new HostThrottleError(host, cooldownMs);
      }
    },
    retryAfterMs: () => Math.max(0, cooldownUntil - now()),
    reset: () => { cooldownUntil = 0; consecutiveResets = 0; nextStartAt = 0; queue = Promise.resolve(); },
  };
}

const hostGates = new Map<string, HostRequestGate>();

/** Shared per-host gate so every caller in the process paces itself. */
export function hostGateFor(input: RequestInfo | URL, fallbackHost?: string): HostRequestGate {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  let host = fallbackHost ?? 'host';
  try { host = new URL(raw).host; } catch { /* keep the fallback label */ }
  const existing = hostGates.get(host);
  if (existing) return existing;
  const created = createHostRequestGate({ host });
  hostGates.set(host, created);
  return created;
}

export function resetHostGates(): void {
  for (const gate of hostGates.values()) gate.reset();
  hostGates.clear();
}
