import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileMarketQuoteTrendStore, NativeMarketQuoteClient } from './quote';
import { JsonFileProviderSlaStore, providerSla, runProviderSlaJob, __test__ as providerSlaTest, type ProviderSlaJob } from './provider-sla';
import { startProviderSlaRunner } from './provider-sla-runner';
import { TelemetryRecorder } from '@upup/pi-observability';

describe('provider SLA exponential backoff helper', () => {
  test('returns base everyMs when there are no errors', () => {
    expect(providerSlaTest.backoffMs(60_000, 0)).toBe(60_000);
  });
  test('doubles per consecutive error and caps at 32x', () => {
    expect(providerSlaTest.backoffMs(60_000, 1)).toBe(120_000);
    expect(providerSlaTest.backoffMs(60_000, 2)).toBe(240_000);
    expect(providerSlaTest.backoffMs(60_000, 5)).toBe(60_000 * 32);
    expect(providerSlaTest.backoffMs(60_000, 100)).toBe(60_000 * 32);
  });
});

describe('native provider retry integration', () => {
  test('retries transient quote responses and does not retry forbidden responses', async () => {
    const recorder = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: await mkdtemp(join(tmpdir(), 'upup-market-retry-')), flushEveryNEvents: 1 } });
    let calls = 0;
    const client = new NativeMarketQuoteClient({
      retry: { maxAttempts: 3, baseDelayMs: 1, sleep: async () => {} , recorder },
      fetcher: async () => {
        calls++;
        if (calls < 3) return new Response('upstream unavailable', { status: 503 });
        return new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: 'AAPL', regularMarketPrice: 200, regularMarketTime: 1_757_808_000 } }] } }), { status: 200 });
      },
    });
    await expect(client.getQuote('AAPL', 'us')).resolves.toMatchObject({ value: { last: 200 } });
    expect(calls).toBe(3);

    let yahooCalls = 0;
    let eastmoneyCalls = 0;
    const forbidden = new NativeMarketQuoteClient({
      retry: { maxAttempts: 3, baseDelayMs: 1, sleep: async () => {}, recorder },
      fetcher: async (input) => {
        const url = String(input);
        if (url.includes('query1.finance.yahoo.com')) { yahooCalls++; return new Response('forbidden', { status: 403 }); }
        if (url.includes('searchapi.eastmoney.com')) return new Response(JSON.stringify({ QuotationCodeTable: { Data: [] } }), { status: 200 });
        eastmoneyCalls++;
        return new Response('forbidden', { status: 403 });
      },
    });
    await expect(forbidden.getQuote('AAPL', 'us')).rejects.toThrow(/403/);
    // Yahoo is not retried on a 403; the run then falls through to the 东方财富
    // US fallback (which also answers 403 in this fixture).
    expect(yahooCalls).toBe(1);
    expect(eastmoneyCalls).toBe(1);
    await recorder.flush();
  });
});

function job(id = 'sla-1'): ProviderSlaJob {
  return {
    id,
    name: 'Yahoo probe',
    provider: 'yahoo',
    probe: 'us',
    everyMs: 60_000,
    enabled: true,
    createdAtMs: 1_000,
    updatedAtMs: 1_000,
    state: { nextRunAtMs: 1_000, consecutiveErrors: 0 },
  };
}

describe('provider SLA package runtime', () => {
  test('creates and runs a real provider probe without synthetic fallback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upup-provider-sla-test-'));
    const jobPath = join(root, 'jobs.json');
    const trendPath = join(root, 'trend.json');
    try {
      const store = new JsonFileProviderSlaStore(jobPath);
      const client = new NativeMarketQuoteClient({
        trendStore: new JsonFileMarketQuoteTrendStore(trendPath),
        fetcher: async () => new Response('forbidden', { status: 403 }),
      });
      const added = await providerSla({ action: 'add', name: 'Yahoo probe', provider: 'yahoo', probe: 'us', everyMs: 60_000 }, client, store);
      const jobId = String((added as { jobId: string }).jobId);
      const persistedJobs = await readFile(jobPath, 'utf8');
      expect(persistedJobs).toContain('"probe":"us"');
      expect(persistedJobs).not.toContain('AAPL');
      const output = await providerSla({ action: 'run', jobId }, client, store);
      expect(output).toMatchObject({ jobId, status: 'error', errorClass: 'forbidden', policy: 'no-synthetic-fallback' });
      expect(await providerSla({ action: 'list' }, client, store)).toMatchObject([{ id: jobId, enabled: true, state: { lastRunStatus: 'error', lastErrorClass: 'forbidden', consecutiveErrors: 1 } }]);
      expect(await readFile(trendPath, 'utf8')).not.toContain('AAPL');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('records successful probes, supports disable, and keeps job state atomic', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upup-provider-sla-test-'));
    const jobPath = join(root, 'jobs.json');
    try {
      const store = new JsonFileProviderSlaStore(jobPath);
      store.save([job()]);
      const client = new NativeMarketQuoteClient({ fetcher: async () => new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: 'AAPL', regularMarketPrice: 200, regularMarketTime: 1_757_808_000 } }] } }), { status: 200 }) });
      const output = await runProviderSlaJob('sla-1', client, store, undefined, 2_000);
      expect(output).toMatchObject({ jobId: 'sla-1', status: 'ok', policy: 'no-synthetic-fallback' });
      const updated = await providerSla({ action: 'update', jobId: 'sla-1', enabled: false }, client, store);
      expect(updated).toMatchObject({ jobId: 'sla-1', enabled: false });
      const disabled = await providerSla({ action: 'run', jobId: 'sla-1' }, client, store);
      expect(disabled).toMatchObject({ jobId: 'sla-1', status: 'error', errorClass: 'disabled' });
      expect(JSON.parse(await readFile(jobPath, 'utf8')).jobs[0].state.lastRunStatus).toBe('disabled');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('runs only due enabled jobs and never sends a message', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upup-provider-sla-runner-'));
    try {
      const store = new JsonFileProviderSlaStore(join(root, 'jobs.json'));
      store.save([{ ...job(), state: { nextRunAtMs: Date.now() - 1, consecutiveErrors: 0 } }]);
      const client = new NativeMarketQuoteClient({ fetcher: async () => new Response('forbidden', { status: 403 }) });
      const runner = startProviderSlaRunner({ store, maxTimerDelayMs: 60_000, createClient: () => client });
      try {
        const results = await runner.runDue();
        expect(results).toMatchObject([{ jobId: 'sla-1', status: 'error', errorClass: 'forbidden' }]);
      } finally {
        runner.stop();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('applies exponential backoff on consecutive failures and recovers after a success', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upup-provider-sla-backoff-'));
    try {
      const store = new JsonFileProviderSlaStore(join(root, 'jobs.json'));
      const failing = new NativeMarketQuoteClient({ fetcher: async () => new Response('forbidden', { status: 403 }) });
      const ok = new NativeMarketQuoteClient({ fetcher: async () => new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: 'AAPL', regularMarketPrice: 200, regularMarketTime: 1_757_808_000 } }] } }), { status: 200 }) });
      const failingJob: ProviderSlaJob = { ...job('sla-fail'), state: { nextRunAtMs: 1_000, consecutiveErrors: 0 } };
      store.save([failingJob]);
      const first = await runProviderSlaJob('sla-fail', failing, store, undefined, 1_000);
      expect(first).toMatchObject({ status: 'error', errorClass: 'forbidden' });
      const afterFirst = store.load()[0]!;
      expect(afterFirst.state.consecutiveErrors).toBe(1);
      expect(afterFirst.state.nextRunAtMs).toBe(1_000 + 60_000 * 2);
      const second = await runProviderSlaJob('sla-fail', failing, store, undefined, 1_000);
      const afterSecond = store.load()[0]!;
      expect(afterSecond.state.consecutiveErrors).toBe(2);
      expect(afterSecond.state.nextRunAtMs).toBe(1_000 + 60_000 * 4);
      await runProviderSlaJob('sla-fail', ok, store, undefined, 1_000);
      const recovered = store.load()[0]!;
      expect(recovered.state.consecutiveErrors).toBe(0);
      expect(recovered.state.lastRunStatus).toBe('ok');
      expect(recovered.state.nextRunAtMs).toBe(1_000 + 60_000);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('runner groups due jobs by provider without interleaving quotes on the same client', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upup-provider-sla-grouping-'));
    try {
      const store = new JsonFileProviderSlaStore(join(root, 'jobs.json'));
      const now = Date.now();
      store.save([
        { ...job('sla-yahoo-1'), state: { nextRunAtMs: now - 5, consecutiveErrors: 0 } },
        { ...job('sla-yahoo-2'), state: { nextRunAtMs: now - 3, consecutiveErrors: 0 } },
      ]);
      let active = 0;
      let peak = 0;
      const client = new NativeMarketQuoteClient({ fetcher: async () => { active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 5)); active -= 1; return new Response('forbidden', { status: 403 }); } });
      const runner = startProviderSlaRunner({ store, maxTimerDelayMs: 60_000, createClient: () => client });
      try {
        const results = await runner.runDue();
        expect(results).toHaveLength(2);
        expect(peak).toBe(1);
      } finally {
        runner.stop();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
