import type { MarketHistoryProvider } from './history';
import { createDefaultMarketQuoteClient, type NativeMarketQuoteClient, type NativeMarketQuoteTrendStore } from './quote';
import { JsonFileProviderSlaStore, runProviderSlaJob, type ProviderSlaRunResult, type ProviderSlaStore } from './provider-sla';

export interface ProviderSlaRunner {
  runDue(signal?: AbortSignal): Promise<readonly ProviderSlaRunResult[]>;
  stop(): void;
}

export interface ProviderSlaRunnerOptions {
  readonly store?: ProviderSlaStore;
  readonly trendStore?: NativeMarketQuoteTrendStore;
  readonly createClient?: (provider: MarketHistoryProvider) => NativeMarketQuoteClient;
  readonly maxTimerDelayMs?: number;
}

export function startProviderSlaRunner(options: ProviderSlaRunnerOptions = {}): ProviderSlaRunner {
  const store = options.store ?? new JsonFileProviderSlaStore();
  const maxTimerDelayMs = options.maxTimerDelayMs ?? 60_000;
  const clients = new Map<MarketHistoryProvider, NativeMarketQuoteClient>();
  const createClient = options.createClient ?? ((provider) => createDefaultMarketQuoteClient({ provider, ...(options.trendStore ? { trendStore: options.trendStore } : {}) }));
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clientFor = (provider: MarketHistoryProvider): NativeMarketQuoteClient => {
    const existing = clients.get(provider);
    if (existing) return existing;
    const created = createClient(provider);
    clients.set(provider, created);
    return created;
  };

  const scheduleNext = (): void => {
    if (stopped) return;
    const now = Date.now();
    const next = store.load().filter((job) => job.enabled && job.state.nextRunAtMs !== undefined).reduce((earliest, job) => Math.min(earliest, job.state.nextRunAtMs!), Number.POSITIVE_INFINITY);
    const delay = next === Number.POSITIVE_INFINITY ? maxTimerDelayMs : Math.min(Math.max(0, next - now), maxTimerDelayMs);
    timer = setTimeout(() => { void tick(); }, delay);
    timer.unref();
  };

  const runDue = async (signal?: AbortSignal): Promise<readonly ProviderSlaRunResult[]> => {
    if (stopped || running) return [];
    running = true;
    const results: ProviderSlaRunResult[] = [];
    try {
      const now = Date.now();
      const due = store.load().filter((job) => job.enabled && job.state.nextRunAtMs !== undefined && job.state.nextRunAtMs <= now);
      const grouped = new Map<MarketHistoryProvider, typeof due>();
      for (const job of due) {
        const bucket = grouped.get(job.provider) ?? [];
        bucket.push(job);
        grouped.set(job.provider, bucket);
      }
      for (const group of grouped.values()) {
        if (stopped) break;
        for (const job of group) {
          if (stopped || (signal?.aborted ?? false)) break;
          results.push(await runProviderSlaJob(job.id, clientFor(job.provider), store, signal, now));
        }
      }
      return results;
    } finally {
      running = false;
      scheduleNext();
    }
  };

  const tick = async (): Promise<void> => { await runDue(); };

  for (const job of store.load()) {
    if (!job.enabled || job.state.nextRunAtMs !== undefined) continue;
    const now = Date.now();
    const jobs = store.load().map((candidate) => candidate.id === job.id ? { ...candidate, state: { ...candidate.state, nextRunAtMs: now + candidate.everyMs } } : candidate);
    store.save(jobs);
  }
  scheduleNext();
  return {
    runDue,
    stop(): void {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
