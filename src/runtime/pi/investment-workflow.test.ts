import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  forkWorkflowSession,
  resumeWorkflow,
  runInvestmentWorkflow,
} from './investment-workflow.js';

const root = join(tmpdir(), `upup-pi-workflow-${Date.now()}`);
process.env.UPUP_PLANS_DIR = join(root, 'plans');

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('Pi investment workflow', () => {
  test('persists phase checkpoints as Pi custom entries and pauses', async () => {
    const result = await runInvestmentWorkflow('分析 600519.SH', {
      phases: ['research', 'valuation', 'review'],
      pauseAfterPhase: 'research',
    });

    expect(result.paused).toBe(true);
    expect(result.finalPlanState).toBe('review');
    expect(result.sessionFile).toBeDefined();
    const sessionText = readFileSync(result.sessionFile!, 'utf8');
    expect(sessionText).toContain('upup-investment-workflow');
    expect(sessionText).toContain('"action":"pause"');
  });

  test('resumes a paused plan and records completion in the same Pi session', async () => {
    const paused = await runInvestmentWorkflow('分析 AAPL', {
      phases: ['research', 'valuation'],
      pauseAfterPhase: 'research',
    });
    const resumed = await resumeWorkflow(paused.planId);

    expect(resumed.paused).not.toBe(true);
    expect(resumed.finalPlanState).toBe('done');
    expect(resumed.sessionFile).toBe(paused.sessionFile);
    expect(readFileSync(resumed.sessionFile!, 'utf8')).toContain('"action":"complete"');
  });

  test('forks a Pi workflow session without changing the source plan', async () => {
    const result = await runInvestmentWorkflow('分析 NVDA', { phases: ['research', 'valuation'] });
    const branchId = await forkWorkflowSession(result.planId);

    expect(branchId).toBeString();
    expect(existsSync(result.sessionFile!)).toBe(true);
  });

  test('reuses an existing plan for the same idempotency key', async () => {
    const first = await runInvestmentWorkflow('分析 AAPL', {
      phases: ['research'],
      idempotencyKey: 'workflow-test-1',
    });
    const second = await runInvestmentWorkflow('分析 AAPL', {
      phases: ['research'],
      idempotencyKey: 'workflow-test-1',
    });
    expect(second.planId).toBe(first.planId);
    expect(second.finalPlanState).toBe('done');
  });
});
