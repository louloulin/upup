/**
 * Investment Research Plan Builder tests
 *
 * v5 Sprint 1.1.6 — 覆盖 buildResearchPlan / modifyPlan / extractTicker / detectPhases
 */

import { describe, expect, test } from 'bun:test';
import {
  buildResearchPlan,
  detectPhases,
  extractTicker,
  modifyPlan,
} from './plan-builder.js';

describe('plan-builder: extractTicker', () => {
  test('extracts US ticker', () => {
    expect(extractTicker('分析 NVDA 估值')).toBe('NVDA');
    expect(extractTicker('what about AAPL')).toBe('AAPL');
  });

  test('extracts A-share with exchange suffix', () => {
    expect(extractTicker('看 600519.SH')).toBe('600519.SH');
  });

  test('extracts A-share digits and defaults to SH', () => {
    expect(extractTicker('分析 000001 走势')).toBe('000001.SH');
  });

  test('returns undefined for no ticker', () => {
    expect(extractTicker('我想了解大市')).toBeUndefined();
  });
});

describe('plan-builder: detectPhases', () => {
  test('detects single phase from Chinese keyword', () => {
    expect(detectPhases('分析 NVDA')).toContain('research');
  });

  test('detects multiple phases preserving order', () => {
    const phases = detectPhases('分析 NVDA 估值并回测,准备交易');
    expect(phases).toContain('research');
    expect(phases).toContain('valuation');
    expect(phases).toContain('backtest');
    expect(phases).toContain('trade');
  });

  test('defaults to research when no keyword', () => {
    expect(detectPhases('NVDA 怎么样')).toEqual(['research']);
  });
});

describe('plan-builder: buildResearchPlan', () => {
  test('produces 2-10 step plan for research intent', () => {
    const plan = buildResearchPlan('分析 NVDA 基本面');
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    expect(plan.steps.length).toBeLessThanOrEqual(10);
    expect(plan.ticker).toBe('NVDA');
    expect(plan.phase).toBe('plan');
    expect(plan.phases).toContain('research');
  });

  test('every step has a tool binding', () => {
    const plan = buildResearchPlan('分析 NVDA 估值');
    for (const step of plan.steps) {
      expect(plan.toolBindings[step.id]).toBeDefined();
      expect(plan.toolBindings[step.id].tool).toBeTruthy();
    }
  });

  test('explicit phases override detected', () => {
    const plan = buildResearchPlan('看 NVDA', { phases: ['valuation'] });
    expect(plan.phases).toEqual(['valuation']);
  });

  test('caps at 10 steps', () => {
    const plan = buildResearchPlan('分析 + 估值 + 回测 + 交易 + 复盘 NVDA');
    expect(plan.steps.length).toBeLessThanOrEqual(10);
  });
});

describe('plan-builder: modifyPlan', () => {
  test('updates ticker and propagates to bindings', () => {
    const plan = buildResearchPlan('分析 NVDA');
    const modified = modifyPlan(plan, '改成看 AAPL');
    expect(modified.ticker).toBe('AAPL');
    for (const binding of Object.values(modified.toolBindings)) {
      expect(binding.params.ticker).toBe('AAPL');
    }
  });

  test('adds a step on 加 keyword', () => {
    const plan = buildResearchPlan('分析 NVDA');
    const before = plan.steps.length;
    const modified = modifyPlan(plan, '加上和 AMD 的对比');
    expect(modified.steps.length).toBeGreaterThanOrEqual(before);
  });

  test('preserves plan id and createdAt', () => {
    const plan = buildResearchPlan('分析 NVDA');
    const id = plan.id;
    const createdAt = plan.createdAt;
    modifyPlan(plan, '加个风险评估');
    expect(plan.id).toBe(id);
    expect(plan.createdAt).toEqual(createdAt);
  });
});
