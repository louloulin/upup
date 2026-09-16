import { describe, expect, test } from 'bun:test';
import {
  DRY_RUN_FRESHNESS,
  DRY_RUN_SOURCE_HISTORY,
  DRY_RUN_SOURCE_QUOTE,
  DryRunMarketHistoryClient,
  DryRunMarketQuoteClient,
  isDryRunSource,
  makeDryRunHistoryResult,
  makeDryRunQuoteResult,
  quoteMarketFromSymbol,
  resolveDryRunActivation,
  resolveMarketHistoryClient,
  resolveMarketQuoteClient,
  shouldAutoActivateDryRun,
} from './dry-run';

describe('pi-market-data dry-run smoke', () => {
  test('dry-run quote returns deterministic fixture with offline freshness', () => {
    const fixedNow = () => '2026-09-13T08:00:00.000Z';
    const first = makeDryRunQuoteResult('600519.SH', 'cn', 'audit-A', { seed: 1234, now: fixedNow });
    const second = makeDryRunQuoteResult('600519.SH', 'cn', 'audit-A', { seed: 1234, now: fixedNow });
    expect(first.value.price).toBeGreaterThan(0);
    expect(second.value.price).toBe(first.value.price);
    expect(first.evidence.source).toBe(DRY_RUN_SOURCE_QUOTE);
    expect(second.evidence.source).toBe(DRY_RUN_SOURCE_QUOTE);
    expect(first.evidence.dataFreshness).toBe(DRY_RUN_FRESHNESS);
    expect(first.value.freshness).toBe(DRY_RUN_FRESHNESS);
    expect(first.value.market).toBe('cn');
    expect(first.value.currency).toBe('CNY');
    expect(first.value.asOf).toBe('2026-09-13');
  });

  test('dry-run quote infers market from symbol suffix when market not provided', () => {
    expect(quoteMarketFromSymbol('600519.SH')).toBe('cn');
    expect(quoteMarketFromSymbol('00700.HK')).toBe('hk');
    expect(quoteMarketFromSymbol('AAPL')).toBe('us');
    expect(quoteMarketFromSymbol('BTC-USD')).toBe('crypto');
    const cn = makeDryRunQuoteResult('600519.SH', undefined, 'audit-cn', { seed: 7 });
    const hk = makeDryRunQuoteResult('00700.HK', undefined, 'audit-hk', { seed: 7 });
    const us = makeDryRunQuoteResult('AAPL', undefined, 'audit-us', { seed: 7 });
    expect(cn.value.currency).toBe('CNY');
    expect(hk.value.currency).toBe('HKD');
    expect(us.value.currency).toBe('USD');
  });

  test('dry-run history produces trading-day bars only and at least 2', () => {
    const result = makeDryRunHistoryResult('600519.SH', '2026-09-07', '2026-09-13', 'audit-h', { seed: 1 });
    expect(result.value.length).toBeGreaterThanOrEqual(2);
    for (const bar of result.value) {
      const weekday = new Date(`${bar.date}T00:00:00Z`).getUTCDay();
      expect(weekday).not.toBe(0);
      expect(weekday).not.toBe(6);
      expect(bar.high).toBeGreaterThanOrEqual(bar.low);
      expect(bar.close).toBeGreaterThan(0);
      expect(bar.volume).toBeGreaterThan(0);
    }
    expect(result.evidence.source).toBe(DRY_RUN_SOURCE_HISTORY);
    expect(result.evidence.dataFreshness).toBe(DRY_RUN_FRESHNESS);
  });

  test('dry-run history rejects invalid input', () => {
    expect(() => makeDryRunHistoryResult('600519.SH', '2026-09-13', '2026-09-07', 'audit')).toThrow();
    expect(() => makeDryRunHistoryResult('600519.SH', '2026/09/07', '2026-09-13', 'audit')).toThrow(/startDate/);
    expect(() => makeDryRunHistoryResult('600519.SH', '2026-09-07', '2026-09-32', 'audit')).toThrow(/endDate/);
    expect(() => makeDryRunHistoryResult('', '2026-09-07', '2026-09-13', 'audit')).toThrow(/symbol/);
  });

  test('isDryRunSource detects dry-run sources', () => {
    expect(isDryRunSource('dry-run://pi-market-data/quote')).toBe(true);
    expect(isDryRunSource('https://api.tushare.pro')).toBe(false);
    expect(isDryRunSource(undefined)).toBe(false);
  });

  test('shouldAutoActivateDryRun respects UPUP_DRY_RUN env values', () => {
    expect(shouldAutoActivateDryRun({} as NodeJS.ProcessEnv)).toBe(false);
    expect(shouldAutoActivateDryRun({ UPUP_DRY_RUN: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(shouldAutoActivateDryRun({ UPUP_DRY_RUN: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(shouldAutoActivateDryRun({ UPUP_DRY_RUN: 'YES' } as NodeJS.ProcessEnv)).toBe(true);
    expect(shouldAutoActivateDryRun({ UPUP_DRY_RUN: 'off' } as NodeJS.ProcessEnv)).toBe(false);
    expect(shouldAutoActivateDryRun({ UPUP_DRY_RUN: ' ' } as NodeJS.ProcessEnv)).toBe(false);
  });

  test('resolveDryRunActivation respects explicit option', () => {
    expect(resolveDryRunActivation({ explicitOption: true, env: {} })).toEqual({ active: true, activatedBy: 'option' });
    expect(resolveDryRunActivation({ explicitOption: false, env: {} })).toEqual({ active: false, activatedBy: undefined });
  });

  test('resolveDryRunActivation never activates dry-run implicitly', () => {
    // Missing credentials are a provider error, not an implicit request for
    // synthetic bars (tools advertise `no-synthetic-fallback`).
    expect(resolveDryRunActivation({ env: {} })).toEqual({ active: false, activatedBy: undefined });
    expect(resolveDryRunActivation({ env: { UPUP_DRY_RUN: '0' } as NodeJS.ProcessEnv })).toEqual({ active: false, activatedBy: undefined });
  });

  test('resolveDryRunActivation activates only through UPUP_DRY_RUN', () => {
    const result = resolveDryRunActivation({ env: { UPUP_DRY_RUN: '1' } as NodeJS.ProcessEnv });
    expect(result.active).toBe(true);
    expect(result.activatedBy).toBe('env');
  });
});

describe('DryRunMarketQuoteClient', () => {
  test('explicit dry-run option returns dry-run client', async () => {
    const resolved = resolveMarketQuoteClient({ dryRun: true });
    expect(resolved.dryRun).toBe(true);
    expect(resolved.activatedBy).toBe('option');
    expect(resolved.client).toBeInstanceOf(DryRunMarketQuoteClient);
    const result = await resolved.client.getQuote('600519.SH', 'cn');
    expect(result.evidence.source).toBe(DRY_RUN_SOURCE_QUOTE);
    expect(result.evidence.dataFreshness).toBe(DRY_RUN_FRESHNESS);
  });

  test('env UPUP_DRY_RUN=1 auto-activates dry-run', () => {
    const resolved = resolveMarketQuoteClient({ env: { UPUP_DRY_RUN: '1' } as NodeJS.ProcessEnv });
    expect(resolved.dryRun).toBe(true);
    expect(resolved.activatedBy).toBe('env');
    expect(resolved.client).toBeInstanceOf(DryRunMarketQuoteClient);
  });

  test('missing credentials stay on the real client (no synthetic fallback)', () => {
    const resolved = resolveMarketQuoteClient({ env: {} as NodeJS.ProcessEnv, provider: 'tushare', tushareToken: '' });
    expect(resolved.dryRun).toBe(false);
    expect(resolved.activatedBy).toBeUndefined();
    expect(resolved.client).not.toBeInstanceOf(DryRunMarketQuoteClient);
  });

  test('explicit dryRun=false returns native client', () => {
    const resolved = resolveMarketQuoteClient({ dryRun: false });
    expect(resolved.dryRun).toBe(false);
    expect(resolved.activatedBy).toBeUndefined();
    expect((resolved.client as unknown as { constructor: { name: string } }).constructor.name).toBe('NativeMarketQuoteClient');
  });

  test('caches subsequent calls and exposes metrics', async () => {
    const client = new DryRunMarketQuoteClient({ activatedBy: 'option', seed: 42, now: () => '2026-09-13T00:00:00.000Z' });
    const first = await client.getQuote('600519.SH', 'cn', undefined, 'audit-1');
    const second = await client.getQuote('600519.SH', 'cn', undefined, 'audit-1');
    expect(second.evidence.source).toBe(`${DRY_RUN_SOURCE_QUOTE}#cache`);
    expect(second.evidence.dataFreshness).toBe('cached');
    const metrics = client.getMetrics();
    expect(metrics.mode).toBe('dry-run');
    expect(metrics.activatedBy).toBe('option');
    expect(metrics.requests).toBe(1);
    expect(metrics.cacheHits).toBe(1);
    expect(metrics.lastSymbol).toBe('600519.SH');
  });

  test('reset clears cache and counters', async () => {
    const client = new DryRunMarketQuoteClient({ activatedBy: 'option' });
    await client.getQuote('AAPL', 'us');
    expect(client.getMetrics().requests).toBe(1);
    client.reset();
    expect(client.getMetrics().requests).toBe(0);
    expect(client.getMetrics().cacheHits).toBe(0);
  });
});

describe('DryRunMarketHistoryClient', () => {
  test('explicit dry-run option returns dry-run client', async () => {
    const resolved = resolveMarketHistoryClient({ dryRun: true });
    expect(resolved.dryRun).toBe(true);
    expect(resolved.client).toBeInstanceOf(DryRunMarketHistoryClient);
    const result = await resolved.client.getHistory('600519.SH', '2026-09-07', '2026-09-13');
    expect(result.evidence.source).toBe(DRY_RUN_SOURCE_HISTORY);
  });

  test('caches subsequent calls and returns cached evidence', async () => {
    const client = new DryRunMarketHistoryClient({ activatedBy: 'option', seed: 99 });
    const first = await client.getHistory('600519.SH', '2026-09-07', '2026-09-13');
    const second = await client.getHistory('600519.SH', '2026-09-07', '2026-09-13');
    expect(second.evidence.source).toBe(`${DRY_RUN_SOURCE_HISTORY}#cache`);
    expect(second.evidence.dataFreshness).toBe('cached');
    expect(client.getMetrics().requests).toBe(1);
    expect(client.getMetrics().cacheHits).toBe(1);
  });

  test('env UPUP_DRY_RUN=true auto-activates dry-run', () => {
    const resolved = resolveMarketHistoryClient({ env: { UPUP_DRY_RUN: 'true' } as NodeJS.ProcessEnv });
    expect(resolved.dryRun).toBe(true);
    expect(resolved.activatedBy).toBe('env');
  });
});
