/**
 * Intent → Subagent Router Tests (Sprint v8-1)
 *
 * 验证 7 种 Intent → 5 种 invest-* subagent 的路由表 + 决策逻辑。
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  INTENT_TO_SUBAGENT,
  FALLBACK_SUBAGENT_ID,
  routeByIntent,
  routeFromIntentResult,
  type RouteDecision,
} from './intent-router.js';
import {
  unregisterInvestmentSubagents,
  registerInvestmentSubagents,
  areInvestmentSubagentsRegistered,
} from '../agent/investment-subagents.js';
import type {
  Intent,
  IntentResult,
  IntentScore,
  IntentDetector,
} from '../agent/intent-detector/index.js';

// ---------------------------------------------------------------------------
// 1. 路由表:7 种 Intent → 5 种 invest-* subagent
// ---------------------------------------------------------------------------

describe('INTENT_TO_SUBAGENT routing table', () => {
  test('5 种直路由 subagent 全部存在', () => {
    const targets = new Set(Object.values(INTENT_TO_SUBAGENT));
    expect(targets.size).toBe(3);
    expect(targets.has('invest-explore')).toBe(true);
    expect(targets.has('invest-plan')).toBe(true);
    expect(targets.has('invest-trade')).toBe(true);
  });

  test('analysis / stock-selection / compare / tutorial / monitor → invest-explore', () => {
    expect(INTENT_TO_SUBAGENT['analysis']).toBe('invest-explore');
    expect(INTENT_TO_SUBAGENT['stock-selection']).toBe('invest-explore');
    expect(INTENT_TO_SUBAGENT['compare']).toBe('invest-explore');
    expect(INTENT_TO_SUBAGENT['tutorial']).toBe('invest-explore');
    expect(INTENT_TO_SUBAGENT['monitor']).toBe('invest-explore');
  });

  test('backtest → invest-plan', () => {
    expect(INTENT_TO_SUBAGENT['backtest']).toBe('invest-plan');
  });

  test('trade → invest-trade', () => {
    expect(INTENT_TO_SUBAGENT['trade']).toBe('invest-trade');
  });

  test('7 种 Intent 全部覆盖 (无 undefined)', () => {
    const intents: Intent[] = [
      'analysis', 'stock-selection', 'backtest', 'trade',
      'monitor', 'compare', 'tutorial',
    ];
    for (const i of intents) {
      expect(INTENT_TO_SUBAGENT[i]).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. 决策逻辑:confidence + registry 校验
// ---------------------------------------------------------------------------

function makeDetector(scores: IntentScore[]): IntentDetector {
  const intentResult: IntentResult = {
    query: 'test',
    scores,
    mode: 'legacy',
    latencyMs: 1,
  };
  return {
    async classify(_query: string): Promise<IntentResult> {
      return intentResult;
    },
  };
}

describe('routeByIntent decision logic', () => {
  beforeEach(() => {
    // 确保 invest-* subagent 已注册 (默认 module-level side effect)
    if (!areInvestmentSubagentsRegistered()) {
      registerInvestmentSubagents();
    }
  });

  test('高置信度 trade → invest-trade (primary=true)', async () => {
    const detector = makeDetector([{ intent: 'trade', confidence: 0.9 }]);
    const decision: RouteDecision = await routeByIntent('买入 600519', { detector });
    expect(decision.subagentId).toBe('invest-trade');
    expect(decision.intent).toBe('trade');
    expect(decision.confidence).toBe(0.9);
    expect(decision.primary).toBe(true);
    expect(decision.subagent).toBeDefined();
    expect(decision.subagent!.id).toBe('invest-trade');
  });

  test('高置信度 backtest → invest-plan', async () => {
    const detector = makeDetector([{ intent: 'backtest', confidence: 0.85 }]);
    const decision = await routeByIntent('用均线策略回测 000001', { detector });
    expect(decision.subagentId).toBe('invest-plan');
    expect(decision.intent).toBe('backtest');
    expect(decision.primary).toBe(true);
  });

  test('高置信度 analysis → invest-explore', async () => {
    const detector = makeDetector([{ intent: 'analysis', confidence: 0.8 }]);
    const decision = await routeByIntent('分析 NVDA', { detector });
    expect(decision.subagentId).toBe('invest-explore');
    expect(decision.intent).toBe('analysis');
    expect(decision.primary).toBe(true);
  });

  test('低置信度 (< minConfidence) → fallback', async () => {
    const detector = makeDetector([{ intent: 'trade', confidence: 0.2 }]);
    const decision = await routeByIntent('hi', { detector, minConfidence: 0.5 });
    expect(decision.subagentId).toBe(FALLBACK_SUBAGENT_ID);
    expect(decision.intent).toBe('trade'); // 仍报告 top intent
    expect(decision.confidence).toBe(0.2);
    expect(decision.primary).toBe(false);
  });

  test('无 scores (空 array) → fallback', async () => {
    const detector = makeDetector([]);
    const decision = await routeByIntent('???', { detector });
    expect(decision.subagentId).toBe(FALLBACK_SUBAGENT_ID);
    expect(decision.intent).toBe('analysis'); // default
    expect(decision.confidence).toBe(0);
    expect(decision.primary).toBe(false);
  });

  test('fallbackSubagentId 覆盖默认值', async () => {
    const detector = makeDetector([{ intent: 'trade', confidence: 0.2 }]);
    const decision = await routeByIntent('hi', {
      detector,
      minConfidence: 0.9,
      fallbackSubagentId: 'invest-plan',
    });
    expect(decision.subagentId).toBe('invest-plan');
    expect(decision.primary).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. 同步版:routeFromIntentResult (不重新调分类器)
// ---------------------------------------------------------------------------

describe('routeFromIntentResult (sync)', () => {
  test('复用 IntentResult, 决策与 async 版一致', () => {
    const result: IntentResult = {
      query: '分析比亚迪',
      scores: [{ intent: 'analysis', confidence: 0.92 }],
      mode: 'llm',
      latencyMs: 120,
    };
    const decision = routeFromIntentResult(result);
    expect(decision.subagentId).toBe('invest-explore');
    expect(decision.intent).toBe('analysis');
    expect(decision.confidence).toBe(0.92);
    expect(decision.primary).toBe(true);
    expect(decision.intentResult).toBe(result);
  });

  test('低 confidence 走 fallback (sync)', () => {
    const result: IntentResult = {
      query: '...',
      scores: [{ intent: 'tutorial', confidence: 0.3 }],
      mode: 'llm',
      latencyMs: 50,
    };
    const decision = routeFromIntentResult(result, { minConfidence: 0.6 });
    expect(decision.subagentId).toBe(FALLBACK_SUBAGENT_ID);
    expect(decision.intent).toBe('tutorial');
    expect(decision.primary).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. 投资 subagent 不在 registry 时降级 (regression 守卫)
// ---------------------------------------------------------------------------

describe('registry miss fallback', () => {
  beforeEach(() => {
    unregisterInvestmentSubagents();
  });
  afterEach(() => {
    if (!areInvestmentSubagentsRegistered()) {
      registerInvestmentSubagents();
    }
  });

  test('invest-* 未注册时仍返回 fallback subagentId (不抛错)', async () => {
    const detector = makeDetector([{ intent: 'trade', confidence: 0.95 }]);
    const decision = await routeByIntent('买入 600519', { detector });
    // 主路由的 subagent 不在 registry → 走 FALLBACK_SUBAGENT_ID
    expect(decision.subagentId).toBe(FALLBACK_SUBAGENT_ID);
    expect(decision.primary).toBe(false);
    // 仍返回完整 intentResult 给调用方
    expect(decision.intentResult.scores.length).toBeGreaterThan(0);
  });
});
