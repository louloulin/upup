import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileMarketQuoteTrendStore, NativeMarketQuoteClient } from './quote.js';
import { JsonFileProviderSlaStore, providerSla, runProviderSlaJob, type ProviderSlaJob } from './provider-sla.js';
import { startProviderSlaRunner } from './provider-sla-runner.js';

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
});
