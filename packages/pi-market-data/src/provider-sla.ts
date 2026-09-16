import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { MarketHistoryProvider } from './history';
import type { NativeMarketQuoteClient } from './quote';

export type ProviderSlaRunStatus = 'ok' | 'error' | 'disabled';
export type ProviderSlaProbe = 'default' | 'us' | 'cn' | 'hk';

function isProviderSlaProbe(value: unknown): value is ProviderSlaProbe {
  return value === 'default' || value === 'us' || value === 'cn' || value === 'hk';
}

export interface ProviderSlaJob {
  readonly id: string;
  readonly name: string;
  readonly provider: MarketHistoryProvider;
  readonly probe: ProviderSlaProbe;
  readonly everyMs: number;
  readonly enabled: boolean;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly state: {
    readonly nextRunAtMs?: number;
    readonly lastRunAtMs?: number;
    readonly lastRunStatus?: ProviderSlaRunStatus;
    readonly lastErrorClass?: string;
    readonly lastLatencyMs?: number;
    readonly consecutiveErrors: number;
  };
}

export interface ProviderSlaStore {
  load(): readonly ProviderSlaJob[];
  save(jobs: readonly ProviderSlaJob[]): void;
}

interface PersistedProviderSlaFile {
  readonly schema: 2;
  readonly jobs: readonly ProviderSlaJob[];
}

function rootDirectory(): string {
  return process.env.UPUP_HOME?.trim() || join(process.env.HOME || homedir(), '.upup');
}

export function getProviderSlaStorePath(): string {
  return process.env.UPUP_PROVIDER_SLA_STORE?.trim() || join(rootDirectory(), 'metrics', 'provider-sla-jobs.json');
}

function validJob(value: unknown): value is ProviderSlaJob {
  if (!value || typeof value !== 'object') return false;
  const job = value as Partial<ProviderSlaJob>;
  const state = job.state;
  return typeof job.id === 'string'
    && typeof job.name === 'string'
    && (job.provider === 'auto' || job.provider === 'yahoo' || job.provider === 'tushare' || job.provider === 'eastmoney')
    && isProviderSlaProbe(job.probe)
    && typeof job.everyMs === 'number' && Number.isInteger(job.everyMs) && job.everyMs >= 60_000
    && typeof job.enabled === 'boolean'
    && Number.isFinite(job.createdAtMs) && Number.isFinite(job.updatedAtMs)
    && Boolean(state) && typeof state === 'object'
    && Number.isInteger(state.consecutiveErrors) && state.consecutiveErrors >= 0;
}

export class JsonFileProviderSlaStore implements ProviderSlaStore {
  constructor(private readonly filePath = getProviderSlaStorePath()) {}

  load(): readonly ProviderSlaJob[] {
    if (!existsSync(this.filePath)) return [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || (parsed as { schema?: unknown }).schema !== 2) return [];
      const jobs = (parsed as { jobs?: unknown }).jobs;
      return Array.isArray(jobs) ? jobs.filter(validJob) : [];
    } catch {
      return [];
    }
  }

  save(jobs: readonly ProviderSlaJob[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
    try {
      writeFileSync(temporary, JSON.stringify({ schema: 2, jobs } satisfies PersistedProviderSlaFile));
      renameSync(temporary, this.filePath);
    } catch (error) {
      try { unlinkSync(temporary); } catch { }
      throw error;
    }
  }
}

export function loadProviderSlaStore(): readonly ProviderSlaJob[] {
  return new JsonFileProviderSlaStore().load();
}

export interface ProviderSlaRunResult {
  readonly jobId: string;
  readonly name: string;
  readonly provider: MarketHistoryProvider;
  readonly status: 'ok' | 'error';
  readonly latencyMs: number;
  readonly errorClass?: string;
  readonly nextRunAtMs?: number;
  readonly policy: 'no-synthetic-fallback';
}

function errorClass(metrics: ReturnType<NativeMarketQuoteClient['getMetrics']>): string {
  return metrics.lastErrorClass ?? 'unknown';
}

function backoffMs(everyMs: number, consecutiveErrors: number): number {
  if (consecutiveErrors <= 0) return everyMs;
  const multiplier = Math.min(32, 2 ** consecutiveErrors);
  return Math.min(everyMs * 32, everyMs * multiplier);
}

function probeInstrument(provider: MarketHistoryProvider, probe: ProviderSlaProbe): { symbol: string; market: string } {
  if (probe === 'us') return { symbol: 'AAPL', market: 'us' };
  if (probe === 'cn') return { symbol: '600519.SH', market: 'cn' };
  if (probe === 'hk') return { symbol: '00700.HK', market: 'hk' };
  return provider === 'tushare' ? { symbol: '600519.SH', market: 'cn' } : { symbol: 'AAPL', market: 'us' };
}

export async function runProviderSlaJob(
  jobId: string,
  client: NativeMarketQuoteClient,
  store: ProviderSlaStore = new JsonFileProviderSlaStore(),
  signal?: AbortSignal,
  now = Date.now(),
): Promise<ProviderSlaRunResult> {
  const jobs = [...store.load()];
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index < 0) throw new Error(`provider SLA job ${jobId} not found`);
  const job = jobs[index]!;
  if (!job.enabled) {
    return { jobId: job.id, name: job.name, provider: job.provider, status: 'error', latencyMs: 0, errorClass: 'disabled', policy: 'no-synthetic-fallback' };
  }
  const startedAt = Date.now();
  const instrument = probeInstrument(job.provider, job.probe);
  try {
    await client.getQuote(instrument.symbol, instrument.market, signal, `provider-sla:${job.id}`);
    const latencyMs = Math.max(0, Date.now() - startedAt);
    const nextRunAtMs = now + job.everyMs;
    jobs[index] = { ...job, updatedAtMs: now, state: { ...job.state, nextRunAtMs, lastRunAtMs: now, lastRunStatus: 'ok', lastErrorClass: undefined, lastLatencyMs: latencyMs, consecutiveErrors: 0 } };
    store.save(jobs);
    return { jobId: job.id, name: job.name, provider: job.provider, status: 'ok', latencyMs, nextRunAtMs, policy: 'no-synthetic-fallback' };
  } catch (error) {
    const latencyMs = Math.max(0, Date.now() - startedAt);
    const nextRunAtMs = now + backoffMs(job.everyMs, job.state.consecutiveErrors + 1);
    const metrics = client.getMetrics();
    const classification = errorClass(metrics);
    jobs[index] = { ...job, updatedAtMs: now, state: { ...job.state, nextRunAtMs, lastRunAtMs: now, lastRunStatus: 'error', lastErrorClass: classification, lastLatencyMs: latencyMs, consecutiveErrors: job.state.consecutiveErrors + 1 } };
    store.save(jobs);
    return { jobId: job.id, name: job.name, provider: job.provider, status: 'error', latencyMs, errorClass: classification, nextRunAtMs, policy: 'no-synthetic-fallback' };
  }
}

export async function providerSla(
  input: {
    readonly action: 'list' | 'add' | 'update' | 'remove' | 'run';
    readonly jobId?: string;
    readonly name?: string;
    readonly provider?: MarketHistoryProvider;
    readonly probe?: ProviderSlaProbe;
    readonly everyMs?: number;
    readonly enabled?: boolean;
  },
  client: NativeMarketQuoteClient | ((provider: MarketHistoryProvider) => NativeMarketQuoteClient),
  store: ProviderSlaStore = new JsonFileProviderSlaStore(),
  signal?: AbortSignal,
): Promise<unknown> {
  const jobs = [...store.load()];
  if (input.action === 'list') return jobs;
  if (input.action === 'add') {
    const { name, provider, everyMs } = input;
    const probe = input.probe ?? 'default';
    if (!name || !provider || typeof everyMs !== 'number' || !Number.isInteger(everyMs) || everyMs < 60_000) throw new Error('name, provider, and everyMs >= 60000 are required');
    if (!isProviderSlaProbe(probe)) throw new Error('probe must be default, us, cn, or hk');
    const now = Date.now();
    const job: ProviderSlaJob = { id: randomBytes(8).toString('hex'), name, provider, probe, everyMs, enabled: true, createdAtMs: now, updatedAtMs: now, state: { nextRunAtMs: now + everyMs, consecutiveErrors: 0 } };
    store.save([...jobs, job]);
    return { jobId: job.id, status: 'created', nextRunAtMs: job.state.nextRunAtMs };
  }
  if (!input.jobId) throw new Error(`jobId is required for ${input.action}`);
  const index = jobs.findIndex((job) => job.id === input.jobId);
  if (index < 0) throw new Error(`provider SLA job ${input.jobId} not found`);
  const current = jobs[index]!;
  if (input.action === 'run') {
    const selectedClient = typeof client === 'function' ? client(current.provider) : client;
    return runProviderSlaJob(current.id, selectedClient, store, signal);
  }
  if (input.action === 'remove') { jobs.splice(index, 1); store.save(jobs); return { jobId: current.id, status: 'removed' }; }
  const now = Date.now();
  if (input.everyMs !== undefined && (!Number.isInteger(input.everyMs) || input.everyMs < 60_000)) throw new Error('everyMs must be an integer >= 60000');
  if (input.probe !== undefined && !isProviderSlaProbe(input.probe)) throw new Error('probe must be default, us, cn, or hk');
  const nextEveryMs = input.everyMs ?? current.everyMs;
  const nextState = input.enabled === undefined && input.everyMs === undefined
    ? current.state
    : {
      ...current.state,
      ...(input.everyMs === undefined ? {} : { nextRunAtMs: now + nextEveryMs }),
      ...(input.enabled === undefined ? {} : input.enabled
        ? { nextRunAtMs: current.state.nextRunAtMs ?? now + nextEveryMs }
        : { lastRunStatus: 'disabled' as const }),
    };
  const updated: ProviderSlaJob = { ...current, ...(input.name === undefined ? {} : { name: input.name }), ...(input.provider === undefined ? {} : { provider: input.provider }), ...(input.probe === undefined ? {} : { probe: input.probe }), everyMs: nextEveryMs, enabled: input.enabled ?? current.enabled, state: nextState, updatedAtMs: now };
  jobs[index] = updated;
  store.save(jobs);
  return { jobId: updated.id, status: 'updated', enabled: updated.enabled, nextRunAtMs: updated.state.nextRunAtMs };
}

export const __test__ = { backoffMs };
