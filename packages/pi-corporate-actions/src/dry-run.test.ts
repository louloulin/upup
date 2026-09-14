import { describe, expect, test } from 'bun:test';
import { createDryRunClient, dryRunEvidence } from './dry-run.js';

describe('createDryRunClient', () => {
  test('returns known A-share dividends for 600519.SH', async () => {
    const client = createDryRunClient();
    const dividends = await client.listDividends('600519.SH');
    expect(dividends.length).toBe(2);
    expect(dividends[0].amountPerShare).toBe(30.88);
  });

  test('returns AAPL splits', async () => {
    const client = createDryRunClient();
    const splits = await client.listSplits('AAPL');
    expect(splits.length).toBe(2);
    expect(splits[0].ratioFrom).toBe(1);
    expect(splits[0].ratioTo).toBe(4);
  });

  test('returns 0700.HK rights issue', async () => {
    const client = createDryRunClient();
    const rights = await client.listRightsIssues('0700.HK');
    expect(rights.length).toBe(1);
    expect(rights[0].pricePerShare).toBe(320.0);
  });

  test('returns empty for unknown symbol', async () => {
    const client = createDryRunClient();
    expect(await client.listDividends('UNKNOWN')).toEqual([]);
    expect(await client.listSplits('UNKNOWN')).toEqual([]);
    expect(await client.listRightsIssues('UNKNOWN')).toEqual([]);
  });

  test('listAll merges and sorts chronologically', async () => {
    const client = createDryRunClient();
    const all = await client.listAll('AAPL');
    expect(all.length).toBe(2);
    expect(all.every((a) => a.type === 'split')).toBe(true);
  });

  test('listAll for 600519.SH returns dividends', async () => {
    const client = createDryRunClient();
    const all = await client.listAll('600519.SH');
    expect(all.length).toBe(2);
    expect(all.every((a) => a.type === 'dividend')).toBe(true);
  });

  test('listAll for 0700.HK returns rights_issue', async () => {
    const client = createDryRunClient();
    const all = await client.listAll('0700.HK');
    expect(all.length).toBe(1);
    expect(all[0].type).toBe('rights_issue');
  });
});

describe('dryRunEvidence', () => {
  test('reports dry-run source and offline freshness', () => {
    const ev = dryRunEvidence();
    expect(ev.source).toBe('dry-run://pi-corporate-actions');
    expect(ev.dataFreshness).toBe('offline');
  });
});
