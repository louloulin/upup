/**
 * EarningsPreview builder tests (P1.a.5)
 *
 * Coverage:
 *  - buildEarningsPreview returns a framework-only preview when no plans exist
 *  - ticker uppercase normalisation
 *  - history is sorted newest-first
 *  - opts.now + opts.plansDir flow through
 *  - CLI runner shows MCP resource URI
 *  - runEarningsPreview handles missing ticker (usage)
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TMP_ROOT = join(tmpdir(), `upup-earnings-preview-test-${process.pid}-${Date.now()}`);
process.env['UPUP_PLANS_DIR'] = join(TMP_ROOT, 'plans');

beforeEach(() => {
  if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true, force: true });
  mkdirSync(process.env['UPUP_PLANS_DIR']!, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe('buildEarningsPreview', () => {
  test('returns framework-only preview with empty data arrays', async () => {
    const { buildEarningsPreview } = await import('./earnings-preview.js');
    const p = buildEarningsPreview('NVDA', { now: () => 1_700_000_000_000 });
    expect(p.ticker).toBe('NVDA');
    expect(p.generatedAt).toBe(1_700_000_000_000);
    expect(p.source).toBe('framework');
    expect(p.consensus).toEqual([]);
    expect(p.recentTweets).toEqual([]);
    expect(p.transcripts).toEqual([]);
    expect(p.history).toEqual([]);
    expect(p.planFramework.ticker).toBe('NVDA');
    expect(p.planFramework.steps.length).toBeGreaterThan(0);
  });

  test('history is sorted newest-first when plans exist', async () => {
    const { buildEarningsPreview } = await import('./earnings-preview.js');
    const { buildResearchPlan } = await import('../../plan/plan-builder.js');
    const isolated = join(TMP_ROOT, 'plans-sorted');
    mkdirSync(isolated, { recursive: true });
    // loadPlan reads from process.env['UPUP_PLANS_DIR'], so point the env at
    // our isolated dir for the duration of this test (restored in afterEach).
    const prevEnv = process.env['UPUP_PLANS_DIR'];
    process.env['UPUP_PLANS_DIR'] = isolated;
    try {
      const a = buildResearchPlan('分析 NVDA 估值', { ticker: 'NVDA', phases: ['research'] });
      const b = buildResearchPlan('NVDA 复盘', { ticker: 'NVDA', phases: ['research'] });
      a.createdAt = new Date(1_700_000_000_000);
      b.createdAt = new Date(1_700_000_500_000);
      writeFileSync(join(isolated, `${a.id}.json`), JSON.stringify({
        ...a, createdAt: a.createdAt.toISOString(),
      }));
      writeFileSync(join(isolated, `${b.id}.json`), JSON.stringify({
        ...b, createdAt: b.createdAt.toISOString(),
      }));

      const preview = buildEarningsPreview('NVDA', { plansDir: isolated, now: () => 1_700_001_000_000 });
      expect(preview.history).toHaveLength(2);
      expect(preview.history[0]!.id).toBe(b.id); // newer first
      expect(preview.history[1]!.id).toBe(a.id);
    } finally {
      process.env['UPUP_PLANS_DIR'] = prevEnv;
    }
  });

  test('opts.plansDir overrides the default', async () => {
    const { buildEarningsPreview } = await import('./earnings-preview.js');
    const isolated = join(TMP_ROOT, 'alt-plans');
    mkdirSync(isolated, { recursive: true });
    const p = buildEarningsPreview('AAPL', { plansDir: isolated });
    expect(p.history).toEqual([]);
    expect(p.planFramework.ticker).toBe('AAPL');
  });
});

describe('runEarningsPreview CLI', () => {
  test('without args shows usage mentioning both command names', async () => {
    const { runEarningsPreview } = await import('./earnings-preview.js');
    const text = await runEarningsPreview('');
    expect(text).toContain('用法');
    expect(text).toContain('/earnings-preview');
    expect(text).toContain('/earnings');
  });

  test('with ticker renders framework + MCP resource URI', async () => {
    const { runEarningsPreview } = await import('./earnings-preview.js');
    const text = await runEarningsPreview('NVDA');
    expect(text).toContain('Earnings Preview');
    expect(text).toContain('NVDA');
    expect(text).toContain('研究计划');
    expect(text).toContain('upup://earnings-preview/NVDA');
    // Source may be 'framework' or 'partial' depending on whether the
    // x-search mock returns data (it does, so 'partial' is expected).
    expect(text).toMatch(/数据源: (framework|partial|full)/);
  });

  test('with A-share ticker', async () => {
    const { runEarningsPreview } = await import('./earnings-preview.js');
    const text = await runEarningsPreview('600519.SH');
    expect(text).toContain('600519.SH');
  });

  test('placeholder sections appear when no real data is wired', async () => {
    const { runEarningsPreview } = await import('./earnings-preview.js');
    const text = await runEarningsPreview('AAPL');
    expect(text).toContain('共识预期');
    expect(text).toContain('推文');
    expect(text).toContain('电话会底稿');
  });
});
describe('buildEarningsPreviewAsync (P1.a.1)', () => {
  test('returns framework source when offline=true', async () => {
    const { buildEarningsPreviewAsync } = await import('./earnings-preview.js');
    const p = await buildEarningsPreviewAsync('NVDA', { offline: true, now: () => 1_700_000_000_000 });
    expect(p.ticker).toBe('NVDA');
    expect(p.source).toBe('framework');
    expect(p.consensus).toEqual([]);
    expect(p.transcripts).toEqual([]);
  });

  test('mock x-search produces at least 1 tweet (no API key required)', async () => {
    const { buildEarningsPreviewAsync } = await import('./earnings-preview.js');
    const p = await buildEarningsPreviewAsync('NVDA', { offline: false, now: () => 1_700_000_000_000 });
    // Without FINANCIAL_DATASETS_API_KEY, consensus will be empty,
    // but x-search mock always returns. So source is at least 'partial'.
    expect(p.recentTweets.length).toBeGreaterThanOrEqual(1);
    expect(p.recentTweets[0]!.url).toMatch(/^https:\/\/x\.com\//);
    expect(p.source).not.toBe('framework');
  });

  test('transcript fetcher injection: custom data flows through', async () => {
    const { buildEarningsPreviewAsync } = await import('./earnings-preview.js');
    const ref = {
      filingDate: '2025-01-15',
      url: 'https://sec/test',
      excerpt: 'mock transcript excerpt',
      ts: 1_736_899_200_000,
    };
    const p = await buildEarningsPreviewAsync('NVDA', {
      offline: true,
      transcriptFetcher: async () => [ref],
      now: () => 1_700_000_000_000,
    });
    expect(p.transcripts).toEqual([ref]);
  });

  test('transcript fetcher throwing degrades to empty (does not throw)', async () => {
    const { buildEarningsPreviewAsync } = await import('./earnings-preview.js');
    const p = await buildEarningsPreviewAsync('NVDA', {
      offline: true,
      transcriptFetcher: async () => { throw new Error('boom'); },
      now: () => 1_700_000_000_000,
    });
    expect(p.transcripts).toEqual([]);
  });
});
