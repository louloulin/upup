/**
 * Investment Research Plan Executor tests
 *
 * v5 Sprint 1.1.6 — 覆盖 persistPlan / loadPlan / executePlan / auditLog
 * 不依赖外部 Agent runtime，保持计划执行测试确定性。
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildResearchPlan } from './src/plan-builder.ts';
import {
  auditLog,
  cancelPlan,
  confirmPlan,
  executePlan,
  listPlans,
  loadPlan,
  persistPlan,
  planFilePath,
  readAuditLog,
} from './src/plan-executor.ts';
import { PLANS_DIR } from '@upup/utils';

let testPlanId = '';

beforeAll(() => {
  // 清理可能残留的测试文件
  if (existsSync(PLANS_DIR)) {
    try { rmSync(PLANS_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

afterAll(() => {
  // 测试结束清理
  if (existsSync(PLANS_DIR)) {
    try { rmSync(PLANS_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe('plan-executor: persist + load', () => {
  test('persists plan to disk and loads it back', () => {
    const plan = buildResearchPlan('分析 NVDA');
    testPlanId = plan.id;
    persistPlan(plan);

    expect(existsSync(planFilePath(plan.id))).toBe(true);
    const loaded = loadPlan(plan.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(plan.id);
    expect(loaded?.ticker).toBe('NVDA');
    expect(loaded?.steps.length).toBe(plan.steps.length);
  });

  test('loadPlan returns null for unknown id', () => {
    expect(loadPlan('nonexistent-plan-id')).toBeNull();
  });

  test('listPlans returns the persisted plan', () => {
    const ids = listPlans();
    expect(ids).toContain(testPlanId);
  });
});

describe('plan-executor: audit log', () => {
  test('appends entries to audit log', () => {
    const plan = buildResearchPlan('分析 AAPL');
    auditLog({ planId: plan.id, action: 'created' });
    auditLog({ planId: plan.id, action: 'confirmed' });

    const entries = readAuditLog(50);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    const lastTwo = entries.slice(-2);
    expect(lastTwo[0].action).toBe('created');
    expect(lastTwo[0].planId).toBe(plan.id);
    expect(lastTwo[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(lastTwo[1].action).toBe('confirmed');
  });
});

describe('plan-executor: confirm / cancel / advance', () => {
  test('confirmPlan sets phase=confirm and confirmedAt', () => {
    const plan = buildResearchPlan('分析 MSFT');
    confirmPlan(plan);
    expect(plan.phase).toBe('confirm');
    expect(plan.confirmedAt).toBeInstanceOf(Date);
  });

  test('cancelPlan sets status=cancelled and writes audit', () => {
    const plan = buildResearchPlan('分析 GOOG');
    cancelPlan(plan, 'user changed mind');
    expect(plan.status).toBe('cancelled');
    const entries = readAuditLog(20);
    const last = entries[entries.length - 1];
    expect(last.action).toBe('cancelled');
    expect(last.details?.reason).toBe('user changed mind');
  });
});

describe('plan-executor: executePlan', () => {
  test('executes all steps and marks plan done', async () => {
    const plan = buildResearchPlan('分析 TSLA');
    confirmPlan(plan);

    const executor = async (_p: typeof plan, stepId: string) => ({
      stepId,
      status: 'completed' as const,
      output: `ok-${stepId}`,
      durationMs: 1,
    });

    const result = await executePlan(plan, executor);
    expect(result.planId).toBe(plan.id);
    expect(result.state).toBe('done');
    expect(result.progress).toBe(100);
    expect(result.failedSteps).toEqual([]);
    expect(plan.status).toBe('completed');
  });

  test('continues on step failure, records failedSteps', async () => {
    const plan = buildResearchPlan('分析 AMZN');
    confirmPlan(plan);

    let i = 0;
    const executor = async (_p: typeof plan, stepId: string) => {
      i += 1;
      if (i === 1) {
        return { stepId, status: 'failed' as const, output: 'err', durationMs: 0, error: 'simulated' };
      }
      return { stepId, status: 'completed' as const, output: `ok-${stepId}`, durationMs: 0 };
    };

    const result = await executePlan(plan, executor);
    expect(result.failedSteps.length).toBe(1);
    expect(plan.status).toBe('completed'); // 不是全部失败 → completed
  });

  test('marks failed when all steps fail', async () => {
    const plan = buildResearchPlan('分析 META');
    confirmPlan(plan);

    const executor = async (_p: typeof plan, stepId: string) => ({
      stepId,
      status: 'failed' as const,
      output: 'always-fail',
      durationMs: 0,
      error: 'down',
    });

    const result = await executePlan(plan, executor);
    expect(result.state).toBe('done');
    expect(plan.status).toBe('failed');
  });
});

describe('plan-executor: audit trail integration', () => {
  test('executePlan writes step_start/step_done/completed entries', async () => {
    const plan = buildResearchPlan('分析 NFLX');
    confirmPlan(plan);
    const executor = async (_p: typeof plan, stepId: string) => ({
      stepId,
      status: 'completed' as const,
      output: 'ok',
      durationMs: 0,
    });

    await executePlan(plan, executor);
    const entries = readAuditLog(100);
    const actions = entries.filter(e => e.planId === plan.id).map(e => e.action);
    expect(actions).toContain('step_start');
    expect(actions).toContain('step_done');
    expect(actions).toContain('completed');
    expect(actions).toContain('phase_advanced');
  });
});

// helper to silence unused-import warning when only type-only import
void join;
