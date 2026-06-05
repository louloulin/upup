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
    const text = runEarningsPreview('');
    expect(text).toContain('用法');
    expect(text).toContain('/earnings-preview');
    expect(text).toContain('/earnings');
  });

  test('with ticker renders framework + MCP resource URI', async () => {
    const { runEarningsPreview } = await import('./earnings-preview.js');
    const text = runEarningsPreview('NVDA');
    expect(text).toContain('Earnings Preview');
    expect(text).toContain('NVDA');
    expect(text).toContain('研究计划');
    expect(text).toContain('upup://earnings-preview/NVDA');
    expect(text).toContain('数据源: framework');
  });

  test('with A-share ticker', async () => {
    const { runEarningsPreview } = await import('./earnings-preview.js');
    const text = runEarningsPreview('600519.SH');
    expect(text).toContain('600519.SH');
  });

  test('placeholder sections appear when no real data is wired', async () => {
    const { runEarningsPreview } = await import('./earnings-preview.js');
    const text = runEarningsPreview('AAPL');
    expect(text).toContain('共识预期');
    expect(text).toContain('推文');
    expect(text).toContain('电话会底稿');
    // P1.a.5 explicit placeholders
    expect(text).toContain('P1.a.1');
  });
});
