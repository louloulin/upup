/**
 * Investment Workflow Tests
 *
 * v5 Sprint 3.3 — 覆盖 5 步研究闭环
 * - runInvestmentWorkflow 5 phase 顺序执行
 * - 软失败(phase 失败不中断)
 * - checkpoint 持久化
 * - resumeWorkflow 从已存 plan 恢复
 * - default phase handler 框架输出
 * - /invest CLI 渲染
 *
 * 模块边界验证: 零 src/tools/ 依赖(grep 验证)
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TMP_ROOT = join(tmpdir(), `upup-workflow-test-${Date.now()}`);
process.env['UPUP_PLANS_DIR'] = join(TMP_ROOT, 'plans');
process.env['UPUP_WATCHLIST_FILE'] = join(TMP_ROOT, 'watchlist.json');

beforeAll(() => {
  mkdirSync(join(TMP_ROOT, 'plans'), { recursive: true });
});

afterAll(() => {
  if (existsSync(TMP_ROOT)) {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// =====================================================================
// 模块边界 — 验证零 src/tools 依赖(关键 — 避免循环)
// =====================================================================

describe('investment-workflow: module boundary', () => {
  test('does not import from tools-registry (循环依赖验证)', async () => {
    const src = await Bun.file('packages/agent-runtime/src/investment-workflow.ts').text();
    expect(src).not.toMatch(/from\s+['"]@upup\/tools-registry/);
    expect(src).not.toMatch(/from\s+['"]\.\.\/\.\.\/tools\//);
  });
});

// =====================================================================
// runInvestmentWorkflow
// =====================================================================

describe('investment-workflow: runInvestmentWorkflow', () => {
  test('runs all 5 phases with default handler (stub)', async () => {
    const { runInvestmentWorkflow, WORKFLOW_PHASES } = await import('./investment-workflow.js');
    expect(WORKFLOW_PHASES).toEqual(['research', 'valuation', 'backtest', 'trade', 'review']);

    const result = await runInvestmentWorkflow('分析 NVDA 估值', { ticker: 'NVDA' });
    expect(result.ticker).toBe('NVDA');
    expect(result.phases.length).toBe(5);
    expect(result.phases.map(p => p.phase)).toEqual([...WORKFLOW_PHASES]);
    expect(result.success).toBe(true);
    expect(result.finalPlanState).toBe('done');
    expect(result.progress).toBe(100);
  });

  test('extracts ticker from intent automatically', async () => {
    const { runInvestmentWorkflow } = await import('./investment-workflow.js');
    const r1 = await runInvestmentWorkflow('分析 AAPL');
    expect(r1.ticker).toBe('AAPL');

    const r2 = await runInvestmentWorkflow('我想投资 600519.SH');
    expect(r2.ticker).toBe('600519.SH');
  });

  test('custom phaseHandler is invoked for each phase', async () => {
    const { runInvestmentWorkflow } = await import('./investment-workflow.js');
    const calls: string[] = [];
    const handler = async (plan: unknown, phase: string) => {
      calls.push(phase);
      return { output: `custom ${phase}` };
    };

    const result = await runInvestmentWorkflow('test', {
      ticker: 'X',
      phaseHandler: handler as never,
    });
    expect(calls).toEqual(['research', 'valuation', 'backtest', 'trade', 'review']);
    for (const p of result.phases) {
      expect(p.output).toBe(`custom ${p.phase}`);
    }
  });

  test('soft failure: phase throws but workflow continues', async () => {
    const { runInvestmentWorkflow } = await import('./investment-workflow.js');
    let i = 0;
    const handler = async (_p: unknown, phase: string) => {
      i += 1;
      if (i === 2) throw new Error('simulated failure');
      return { output: `ok ${phase}` };
    };

    const result = await runInvestmentWorkflow('test', {
      ticker: 'X',
      phaseHandler: handler as never,
    });
    expect(result.phases[1].status).toBe('failed');
    expect(result.phases[1].error).toBe('simulated failure');
    // 后续 phase 仍跑
    expect(result.phases[2].status).toBe('completed');
    expect(result.phases[4].status).toBe('completed');
  });

  test('soft failure: phase returns error in result', async () => {
    const { runInvestmentWorkflow } = await import('./investment-workflow.js');
    const handler = async () => ({ output: 'partial', error: 'partial error' });

    const result = await runInvestmentWorkflow('test', {
      ticker: 'X',
      phaseHandler: handler as never,
    });
    expect(result.phases[0].status).toBe('failed');
    expect(result.phases[0].error).toBe('partial error');
  });

  test('mode=fast uses detected phases instead of all 5', async () => {
    const { runInvestmentWorkflow } = await import('./investment-workflow.js');
    const result = await runInvestmentWorkflow('分析 NVDA 估值', {
      mode: 'fast',
    });
    expect(result.phases.length).toBeLessThan(5);
    expect(result.phases.map(p => p.phase)).toContain('research');
  });

  test('persists plan to .upup/plans/<id>.json', async () => {
    const { runInvestmentWorkflow } = await import('./investment-workflow.js');
    const result = await runInvestmentWorkflow('test persist', { ticker: 'TEST' });
    const planPath = join(TMP_ROOT, 'plans', `${result.planId}.json`);
    expect(existsSync(planPath)).toBe(true);
    const content = JSON.parse(readFileSync(planPath, 'utf-8'));
    expect(content.id).toBe(result.planId);
    expect(content.phase).toBe('done');
  });
});

// =====================================================================
// resumeWorkflow
// =====================================================================

describe('investment-workflow: resumeWorkflow', () => {
  test('throws on unknown planId', async () => {
    const { resumeWorkflow } = await import('./investment-workflow.js');
    await expect(resumeWorkflow('nonexistent-id-xyz')).rejects.toThrow('不存在');
  });

  test('returns completed summary when plan already done', async () => {
    const { runInvestmentWorkflow, resumeWorkflow } = await import('./investment-workflow.js');
    const initial = await runInvestmentWorkflow('test', { ticker: 'DONE' });
    const resumed = await resumeWorkflow(initial.planId);
    expect(resumed.finalPlanState).toBe('done');
    expect(resumed.success).toBe(true);
    expect(resumed.progress).toBe(100);
  });
});

// =====================================================================
// /invest CLI
// =====================================================================

describe('investment: /invest CLI', () => {
  test('runInvest with ticker renders 5 phase progress', async () => {
    const { runInvest } = await import('@upup/cli/commands/investment/invest');
    const text = await runInvest('NVDA');
    expect(text).toContain('Investment Workflow');
    expect(text).toContain('Ticker: NVDA');
    expect(text).toContain('5 步 phase 进度');
    expect(text).toContain('research');
    expect(text).toContain('valuation');
    expect(text).toContain('backtest');
    expect(text).toContain('trade');
    expect(text).toContain('review');
  });

  test('runInvest without args shows default intent', async () => {
    const { runInvest } = await import('@upup/cli/commands/investment/invest');
    const text = await runInvest('');
    expect(text).toContain('Intent:');
  });

  test('runInvest --list renders plan list', async () => {
    const { runInvest } = await import('@upup/cli/commands/investment/invest');
    const text = await runInvest('--list');
    expect(text).toMatch(/Plans|无 plan/);
  });

  test('runInvest --resume without planId shows usage', async () => {
    const { runInvest } = await import('@upup/cli/commands/investment/invest');
    const text = await runInvest('--resume');
    expect(text).toContain('用法');
  });

  test('runInvest --resume with unknown planId shows error', async () => {
    const { runInvest } = await import('@upup/cli/commands/investment/invest');
    const text = await runInvest('--resume nonexistent');
    expect(text).toMatch(/Resume 失败/);
  });

  test('runInvest with A-share ticker', async () => {
    const { runInvest } = await import('@upup/cli/commands/investment/invest');
    const text = await runInvest('600519.SH');
    expect(text).toContain('600519.SH');
  });
});

// =====================================================================
// registry: /invest is registered
// =====================================================================

describe('investment: registry includes /invest', () => {
  test('isInvestmentCommand recognizes invest + aliases', async () => {
    const { isInvestmentCommand, runInvestmentCommand, INVESTMENT_COMMANDS } = await import('@upup/cli/commands/investment/registry');
    expect(isInvestmentCommand('invest')).toBe(true);
    expect(isInvestmentCommand('wf')).toBe(true);
    expect(isInvestmentCommand('workflow')).toBe(true);
    expect(INVESTMENT_COMMANDS.length).toBe(6);
  });

  test('runInvestmentCommand returns text for invest', async () => {
    const { runInvestmentCommand } = await import('@upup/cli/commands/investment/registry');
    const text = await runInvestmentCommand('invest', 'AAPL');
    expect(typeof text).toBe('string');
    expect(text).toContain('Ticker: AAPL');
  });
});
