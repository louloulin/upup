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

  test('does not synthesize X posts without an API key', async () => {
    const { buildEarningsPreviewAsync } = await import('./earnings-preview.js');
    const previous = process.env.X_BEARER_TOKEN;
    delete process.env.X_BEARER_TOKEN;
    try {
      const p = await buildEarningsPreviewAsync('NVDA', { offline: false, now: () => 1_700_000_000_000 });
      expect(p.recentTweets).toEqual([]);
      expect(p.source).toBe('framework');
    } finally {
      if (previous === undefined) delete process.env.X_BEARER_TOKEN;
      else process.env.X_BEARER_TOKEN = previous;
    }
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

/**
 * P1.a.4 — diff_against_prior_call + dossier persistence
 *
 * Coverage:
 *  - computeEarningsDiff pure function: toneDelta string + lastCallTs
 *  - buildEarningsPreview stamps diff when dossier has prior call
 *  - buildEarningsPreview leaves diff undefined when no dossier
 *  - buildEarningsPreview leaves diff undefined when dossier has no prior calls
 *  - persistEarningsCallToDossier creates dossier if missing
 *  - persistEarningsCallToDossier appends new call note
 *  - persistEarningsCallToDossier is a no-op for framework source
 *  - persistEarningsCallToDossier is a no-op for empty transcripts
 */
describe('P1.a.4 — diff_against_prior_call + dossier persistence', () => {
  test('computeEarningsDiff: buy > sell → 净买入 with signed net', async () => {
    const { computeEarningsDiff } = await import('./earnings-preview.js');
    const diff = computeEarningsDiff(
      { callId: 'ec-AAPL-1', callTs: 1_700_000_000_000, transcriptRefs: [] },
      {
        recentTweets: [
          { handle: 'a', tweetId: '1', url: 'u1', ts: 0, authorKind: 'analyst-buy', snippet: '' },
          { handle: 'b', tweetId: '2', url: 'u2', ts: 0, authorKind: 'analyst-buy', snippet: '' },
          { handle: 'c', tweetId: '3', url: 'u3', ts: 0, authorKind: 'analyst-sell', snippet: '' },
        ],
        transcripts: [],
      },
    );
    expect(diff.lastCallTs).toBe(1_700_000_000_000);
    expect(diff.toneDelta).toContain('净买入');
    expect(diff.toneDelta).toContain('+1');
    expect(diff.toneDelta).toContain('2 买');
    expect(diff.toneDelta).toContain('1 卖');
  });

  test('computeEarningsDiff: sell > buy → 净卖出 with signed net', async () => {
    const { computeEarningsDiff } = await import('./earnings-preview.js');
    const diff = computeEarningsDiff(
      { callId: 'ec-X-1', callTs: 0, transcriptRefs: [] },
      {
        recentTweets: [
          { handle: 'a', tweetId: '1', url: 'u1', ts: 0, authorKind: 'analyst-sell', snippet: '' },
          { handle: 'b', tweetId: '2', url: 'u2', ts: 0, authorKind: 'analyst-sell', snippet: '' },
        ],
        transcripts: [],
      },
    );
    expect(diff.toneDelta).toContain('净卖出');
    expect(diff.toneDelta).toContain('-2');
  });

  test('computeEarningsDiff: no tweets → toneDelta undefined', async () => {
    const { computeEarningsDiff } = await import('./earnings-preview.js');
    const diff = computeEarningsDiff(
      { callId: 'ec-X-1', callTs: 0, transcriptRefs: [] },
      { recentTweets: [], transcripts: [] },
    );
    expect(diff.toneDelta).toBeUndefined();
    expect(diff.qaBalanceDelta).toBeUndefined();
    expect(diff.lastCallTs).toBe(0);
  });

  test('buildEarningsPreview stamps diff when dossier has prior call', async () => {
    const { buildEarningsPreview } = await import('./earnings-preview.js');
    const { DossierStore } = await import('@upup/memory');
    const dossiers = new DossierStore({ inMemory: true, now: () => 1_700_000_000_000 });
    dossiers.create('NVDA', { name: 'NVIDIA', sector: 'Tech', marketCap: 1, oneLiner: 'x' });
    dossiers.appendEarningsCall('NVDA', {
      callId: 'ec-NVDA-1',
      callTs: 1_699_000_000_000,
      transcriptRefs: ['https://sec/old'],
    });
    const p = buildEarningsPreview('NVDA', { dossiers, now: () => 1_700_000_500_000 });
    expect(p.diff_against_prior_call).toBeDefined();
    expect(p.diff_against_prior_call!.lastCallTs).toBe(1_699_000_000_000);
  });

  test('buildEarningsPreview leaves diff undefined when no dossier provided', async () => {
    const { buildEarningsPreview } = await import('./earnings-preview.js');
    const p = buildEarningsPreview('NVDA', { now: () => 1_700_000_000_000 });
    expect(p.diff_against_prior_call).toBeUndefined();
  });

  test('buildEarningsPreview leaves diff undefined when dossier has no prior calls', async () => {
    const { buildEarningsPreview } = await import('./earnings-preview.js');
    const { DossierStore } = await import('@upup/memory');
    const dossiers = new DossierStore({ inMemory: true });
    dossiers.create('NVDA', { name: 'NVIDIA', sector: 'Tech', marketCap: 1, oneLiner: 'x' });
    const p = buildEarningsPreview('NVDA', { dossiers });
    expect(p.diff_against_prior_call).toBeUndefined();
  });

  test('persistEarningsCallToDossier creates dossier + appends call note', async () => {
    const { persistEarningsCallToDossier } = await import('./earnings-preview.js');
    const { DossierStore } = await import('@upup/memory');
    const dossiers = new DossierStore({ inMemory: true, now: () => 1_700_000_000_000 });
    const preview = {
      ticker: 'NVDA',
      generatedAt: 1_700_000_000_000,
      source: 'full' as const,
      consensus: [],
      recentTweets: [],
      transcripts: [
        { filingDate: '2025-01-15', url: 'https://sec/8k-1', excerpt: 'x', ts: 1_700_000_000_000 },
      ],
      history: [],
      planFramework: {} as never,
    };
    persistEarningsCallToDossier(dossiers, preview);
    const d = dossiers.read('NVDA');
    expect(d).toBeDefined();
    expect(d!.earningsCalls).toHaveLength(1);
    expect(d!.earningsCalls[0]!.callId).toBe('ec-NVDA-1700000000000');
    expect(d!.earningsCalls[0]!.transcriptRefs).toEqual(['https://sec/8k-1']);
  });

  test('persistEarningsCallToDossier is a no-op for framework source', async () => {
    const { persistEarningsCallToDossier } = await import('./earnings-preview.js');
    const { DossierStore } = await import('@upup/memory');
    const dossiers = new DossierStore({ inMemory: true });
    const preview = {
      ticker: 'NVDA',
      generatedAt: 1_700_000_000_000,
      source: 'framework' as const,
      consensus: [],
      recentTweets: [],
      transcripts: [],
      history: [],
      planFramework: {} as never,
    };
    persistEarningsCallToDossier(dossiers, preview);
    expect(dossiers.read('NVDA')).toBeUndefined();
  });

  test('persistEarningsCallToDossier is a no-op for empty transcripts', async () => {
    const { persistEarningsCallToDossier } = await import('./earnings-preview.js');
    const { DossierStore } = await import('@upup/memory');
    const dossiers = new DossierStore({ inMemory: true });
    const preview = {
      ticker: 'NVDA',
      generatedAt: 1_700_000_000_000,
      source: 'partial' as const,
      consensus: [],
      recentTweets: [],
      transcripts: [],
      history: [],
      planFramework: {} as never,
    };
    persistEarningsCallToDossier(dossiers, preview);
    expect(dossiers.read('NVDA')).toBeUndefined();
  });

  test('persistEarningsCallToDossier appends to existing dossier (append-only)', async () => {
    const { persistEarningsCallToDossier } = await import('./earnings-preview.js');
    const { DossierStore } = await import('@upup/memory');
    const dossiers = new DossierStore({ inMemory: true, now: () => 1_700_000_000_000 });
    dossiers.create('AAPL', { name: 'Apple', sector: 'Tech', marketCap: 1, oneLiner: 'x' });
    dossiers.appendEarningsCall('AAPL', {
      callId: 'ec-AAPL-1',
      callTs: 1_699_000_000_000,
      transcriptRefs: ['https://sec/old'],
    });
    const preview = {
      ticker: 'AAPL',
      generatedAt: 1_700_000_500_000,
      source: 'full' as const,
      consensus: [],
      recentTweets: [],
      transcripts: [
        { filingDate: '2025-04-15', url: 'https://sec/8k-2', excerpt: 'y', ts: 1_700_000_500_000 },
      ],
      history: [],
      planFramework: {} as never,
    };
    persistEarningsCallToDossier(dossiers, preview);
    const d = dossiers.read('AAPL')!;
    expect(d.earningsCalls).toHaveLength(2);
    expect(d.earningsCalls[0]!.callId).toBe('ec-AAPL-1');
    expect(d.earningsCalls[1]!.callId).toBe('ec-AAPL-1700000500000');
  });

  test('persistEarningsCallToDossier echoes toneDelta when set on preview', async () => {
    const { persistEarningsCallToDossier } = await import('./earnings-preview.js');
    const { DossierStore } = await import('@upup/memory');
    const dossiers = new DossierStore({ inMemory: true, now: () => 1_700_000_000_000 });
    const preview = {
      ticker: 'NVDA',
      generatedAt: 1_700_000_000_000,
      source: 'full' as const,
      consensus: [],
      recentTweets: [],
      transcripts: [
        { filingDate: '2025-01-15', url: 'https://sec/8k-1', excerpt: 'x', ts: 1 },
      ],
      history: [],
      planFramework: {} as never,
      diff_against_prior_call: {
        toneDelta: '净买入 +2 (3 买 / 1 卖 / 4 总)',
        qaBalanceDelta: undefined,
        lastCallTs: 1_699_000_000_000,
      },
    };
    persistEarningsCallToDossier(dossiers, preview);
    const d = dossiers.read('NVDA')!;
    expect(d.earningsCalls[0]!.toneDelta).toBe('净买入 +2 (3 买 / 1 卖 / 4 总)');
  });
});
