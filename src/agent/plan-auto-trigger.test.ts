/**
 * Plan Auto-Trigger — 验证从用户输入自动生成 plan + 进入 plan mode 的完整流程
 */
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import {
  maybeEnterPlanMode,
  maybeEnterPlanModeSync,
  type PlanAutoTriggerDeps,
  type PlanAutoTriggerResult,
} from './plan-auto-trigger.js';
import { __resetAgentPorts } from './agent-port.js';

// Mock plan-mode-state so we can control isActive/enter via global registry
import { registerPlanModePort } from './agent-port.js';

interface MockState {
  active: boolean;
  enteredPlanIds: string[];
  isActiveCalls: number;
  enterCalls: number;
}

function makeMockPort(initialActive = false) {
  const state: MockState = {
    active: initialActive,
    enteredPlanIds: [],
    isActiveCalls: 0,
    enterCalls: 0,
  };
  registerPlanModePort({
    isActive: () => {
      state.isActiveCalls++;
      return state.active;
    },
    getPlanId: () => state.enteredPlanIds[state.enteredPlanIds.length - 1],
    enter: (planId: string) => {
      state.enterCalls++;
      state.enteredPlanIds.push(planId);
      state.active = true;
    },
    exit: () => {
      state.active = false;
    },
  });
  return state;
}

beforeEach(() => {
  __resetAgentPorts();
});

function makeIntentDetectorMock(intentMap: Record<string, string | null | undefined>) {
  return async (input: string) => {
    const intent = intentMap[input];
    if (intent === null) {
      throw new Error('detector_failed');
    }
    if (intent === undefined) {
      return null;
    }
    return {
      query: input,
      scores: [{ intent: intent as any, confidence: 0.9 }],
      mode: 'legacy' as const,
      latencyMs: 1,
    };
  };
}

describe('maybeEnterPlanMode (async, with IntentDetector)', () => {
  test('empty input returns no_plan_intent', async () => {
    const state = makeMockPort();
    const result = await maybeEnterPlanMode('', {});
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('no_plan_intent');
    expect(state.enterCalls).toBe(0);
  });

  test('already in plan mode returns already_in_plan_mode', async () => {
    const state = makeMockPort(true); // already active
    const result = await maybeEnterPlanMode('分析 NVDA', {});
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('already_in_plan_mode');
    expect(state.enterCalls).toBe(0);
  });

  test('analysis intent + ticker triggers plan', async () => {
    const state = makeMockPort();
    const result = await maybeEnterPlanMode('分析 NVDA', {
      detectIntent: makeIntentDetectorMock({ '分析 NVDA': 'analysis' }),
    });
    expect(result.triggered).toBe(true);
    expect(result.reason).toBe('plan_built');
    expect(result.plan).toBeDefined();
    expect(result.ticker).toBe('NVDA');
    expect(result.phases).toContain('research');
    expect(state.enterCalls).toBe(1);
    expect(state.enteredPlanIds[0]).toBe(result.plan!.id);
  });

  test('non-plan intent (tutorial) is rejected', async () => {
    const state = makeMockPort();
    const result = await maybeEnterPlanMode('怎么用 upup', {
      detectIntent: makeIntentDetectorMock({ '怎么用 upup': 'tutorial' }),
    });
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('no_plan_intent');
    expect(state.enterCalls).toBe(0);
  });

  test('detector throws — falls back to keyword-based trigger', async () => {
    const state = makeMockPort();
    const result = await maybeEnterPlanMode('NVDA 估值分析', {
      detectIntent: makeIntentDetectorMock({ 'NVDA 估值分析': null }),
    });
    // 关键词(detectPhases)检测到 phase,降级后应触发
    expect(result.triggered).toBe(true);
    expect(result.reason).toBe('plan_built');
    expect(result.ticker).toBe('NVDA');
    expect(result.phases).toContain('valuation');
    expect(state.enterCalls).toBe(1);
  });

  test('detector returns null — falls back to keyword', async () => {
    const state = makeMockPort();
    const result = await maybeEnterPlanMode('AAPL 回测 12 个月', {
      detectIntent: makeIntentDetectorMock({ 'AAPL 回测 12 个月': undefined }),
    });
    expect(result.triggered).toBe(true);
    expect(result.ticker).toBe('AAPL');
    expect(result.phases).toContain('backtest');
    expect(state.enterCalls).toBe(1);
  });

  test('multi-phase input builds plan with multiple phases', async () => {
    const state = makeMockPort();
    const result = await maybeEnterPlanMode('研究 TSLA 估值,然后回测', {
      detectIntent: makeIntentDetectorMock({ '研究 TSLA 估值,然后回测': 'analysis' }),
    });
    expect(result.triggered).toBe(true);
    expect(result.ticker).toBe('TSLA');
    expect(result.phases).toContain('research');
    expect(result.phases).toContain('valuation');
    expect(result.phases).toContain('backtest');
  });

  test('A-share ticker is extracted', async () => {
    const state = makeMockPort();
    const result = await maybeEnterPlanMode('分析 600519', {
      detectIntent: makeIntentDetectorMock({ '分析 600519': 'analysis' }),
    });
    expect(result.triggered).toBe(true);
    expect(result.ticker).toBe('600519.SH');
  });

  test('buildPlan throws — returns build_failed with error message', async () => {
    const state = makeMockPort();
    const result = await maybeEnterPlanMode('分析 NVDA', {
      detectIntent: makeIntentDetectorMock({ '分析 NVDA': 'analysis' }),
      buildPlan: () => {
        throw new Error('plan_builder_broken');
      },
    });
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('build_failed');
    expect(result.error).toContain('plan_builder_broken');
    expect(state.enterCalls).toBe(0);
  });

  test('enterPlanMode throws — returns build_failed with error', async () => {
    const state = makeMockPort();
    const result = await maybeEnterPlanMode('分析 AAPL', {
      detectIntent: makeIntentDetectorMock({ '分析 AAPL': 'analysis' }),
      enterPlanMode: () => {
        throw new Error('enter_threw');
      },
    });
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('build_failed');
    expect(result.error).toContain('enter_threw');
  });

  test('successful trigger returns plan with steps and toolBindings', async () => {
    const state = makeMockPort();
    const result = await maybeEnterPlanMode('NVDA 估值分析', {
      detectIntent: makeIntentDetectorMock({ 'NVDA 估值分析': 'analysis' }),
    });
    expect(result.triggered).toBe(true);
    const plan = result.plan!;
    expect(plan.id).toBeDefined();
    expect(plan.goal).toContain('NVDA');
    expect(plan.ticker).toBe('NVDA');
    expect(plan.phases.length).toBeGreaterThan(0);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.phase).toBe('plan');
    expect(plan.status).toBe('draft');
  });
});

describe('maybeEnterPlanModeSync (keyword-only, no detector)', () => {
  test('empty input returns no_plan_intent', () => {
    const state = makeMockPort();
    const result = maybeEnterPlanModeSync('', {});
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('no_plan_intent');
    expect(state.enterCalls).toBe(0);
  });

  test('analysis keyword triggers plan without detector', () => {
    const state = makeMockPort();
    const result = maybeEnterPlanModeSync('AAPL 估值', {});
    expect(result.triggered).toBe(true);
    expect(result.ticker).toBe('AAPL');
    expect(result.phases).toContain('valuation');
    expect(state.enterCalls).toBe(1);
  });

  test('gibberish without keywords still triggers research (default phase)', () => {
    const state = makeMockPort();
    const result = maybeEnterPlanModeSync('NVDA', {});
    // 'NVDA' has no phase keyword but default = research
    expect(result.triggered).toBe(true);
    expect(result.ticker).toBe('NVDA');
    expect(result.phases).toEqual(['research']);
  });

  test('already in plan mode — skipped', () => {
    const state = makeMockPort(true);
    const result = maybeEnterPlanModeSync('分析 NVDA', {});
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('already_in_plan_mode');
  });

  test('plan has 2-10 steps (v5 spec requirement)', () => {
    const state = makeMockPort();
    const result = maybeEnterPlanModeSync('研究、估值、回测、交易、复盘 NVDA', {});
    expect(result.triggered).toBe(true);
    const steps = result.plan!.steps;
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.length).toBeLessThanOrEqual(10);
  });
});

describe('integration: deps injection allows full test isolation', () => {
  test('no global state pollution between tests', async () => {
    // Start with no port registered (null)
    __resetAgentPorts();
    const result1 = await maybeEnterPlanMode('分析 NVDA', {
      detectIntent: makeIntentDetectorMock({ '分析 NVDA': 'analysis' }),
    });
    // Port is null so defaultIsActive() returns false, and defaultEnterPlanMode
    // is a no-op. The plan IS built (plan field set) but the side effect of
    // entering plan mode is a no-op.
    expect(result1.triggered).toBe(true);
    expect(result1.plan).toBeDefined();
    expect(result1.reason).toBe('plan_built');

    // Now register a port and call again — should fully work including enter
    const state = makeMockPort();
    const result2 = await maybeEnterPlanMode('分析 AAPL', {
      detectIntent: makeIntentDetectorMock({ '分析 AAPL': 'analysis' }),
    });
    expect(result2.triggered).toBe(true);
    expect(state.enterCalls).toBe(1);
    expect(state.enteredPlanIds[0]).toBe(result2.plan!.id);
  });
});
