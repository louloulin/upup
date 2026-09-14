import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getPiNativeApp } from '@upup/pi-app/default';

const investmentWorkflow = getPiNativeApp().getInvestmentWorkflow();
const { forkWorkflowSession, resumeWorkflow, runInvestmentWorkflow } = investmentWorkflow;

const root = join(tmpdir(), `upup-pi-workflow-${Date.now()}`);
process.env.UPUP_PLANS_DIR = join(root, 'plans');

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('Pi investment workflow', () => {
  test('persists phase checkpoints as Pi custom entries and pauses', async () => {
    const result = await runInvestmentWorkflow('分析 AAPL', {
      phases: ['plan', 'report'],
      pauseAfterPhase: 'plan',
    });

    expect(result.paused).toBe(true);
    expect(result.finalPlanState).toBe('review');
    expect(result.sessionFile).toBeDefined();
    expect(result.dossierFile).toBeDefined();
    expect(result.dossier?.schema).toBe('upup.pi.investment-dossier.v1');
    expect(result.dossier?.status).toBe('paused');
    expect(result.dossier?.currentPhase).toBe('report');
    expect(result.dossier?.phases.map((phase) => phase.phase)).toEqual(['detect', 'plan', 'execute', 'verify', 'report']);
    expect(result.dossier?.phases[1]?.status).toBe('completed');
    expect(result.dossier?.phases[4]?.status).toBe('pending');
    expect(readFileSync(result.dossierFile!, 'utf8')).toContain('"artifactHash"');
    const sessionText = readFileSync(result.sessionFile!, 'utf8');
    expect(sessionText).toContain('upup-investment-workflow');
    expect(sessionText).toContain('"action":"pause"');
  });

  test('resumes a paused plan and records completion in the same Pi session', async () => {
    const paused = await runInvestmentWorkflow('分析 AAPL', {
      phases: ['plan', 'report'],
      pauseAfterPhase: 'plan',
    });
    const resumed = await resumeWorkflow(paused.planId);

    expect(resumed.paused).not.toBe(true);
    expect(resumed.finalPlanState).toBe('done');
    expect(resumed.sessionFile).toBe(paused.sessionFile);
    expect(resumed.dossierFile).toBeDefined();
    expect(resumed.dossier?.status).toBe('completed');
    expect(resumed.dossier?.currentPhase).toBe('report');
    expect(resumed.dossier?.phases[0]?.status).toBe('pending');
    expect(resumed.dossier?.phases[1]?.status).toBe('completed');
    expect(resumed.dossier?.phases[0]?.status).toBe('pending');
    expect(resumed.dossier?.phases[2]?.status).toBe('pending');
    expect(resumed.dossier?.phases[3]?.status).toBe('pending');
    expect(resumed.dossier?.phases[4]?.status).toBe('completed');
    const reopened = await resumeWorkflow(resumed.planId);
    expect(reopened.dossier?.artifactHash).toBe(resumed.dossier?.artifactHash);
    expect(reopened.sessionFile).toBe(resumed.sessionFile);
    expect(readFileSync(resumed.sessionFile!, 'utf8')).toContain('"action":"complete"');
  });

  test('forks a Pi workflow session without changing the source plan', async () => {
    const result = await runInvestmentWorkflow('分析 NVDA', { phases: ['detect', 'plan'] });
    const branchId = await forkWorkflowSession(result.planId);

    expect(branchId).toBeString();
    expect(existsSync(result.sessionFile!)).toBe(true);
  });

  test('reuses an existing plan for the same idempotency key', async () => {
    const first = await runInvestmentWorkflow('分析 AAPL', {
      phases: ['detect'],
      idempotencyKey: 'workflow-test-1',
    });
    const second = await runInvestmentWorkflow('分析 AAPL', {
      phases: ['detect'],
      idempotencyKey: 'workflow-test-1',
    });
    expect(second.planId).toBe(first.planId);
    expect(second.finalPlanState).toBe('done');
  });

  test('serializes concurrent runs for the same idempotency key', async () => {
    const key = `workflow-concurrent-${Date.now()}`;
    const [first, second] = await Promise.all([
      runInvestmentWorkflow('分析 AAPL', { phases: ['plan'], idempotencyKey: key }),
      runInvestmentWorkflow('分析 AAPL', { phases: ['plan'], idempotencyKey: key }),
    ]);

    expect(second.planId).toBe(first.planId);
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.dossier?.artifactHash).toBe(first.dossier?.artifactHash);
  });
});
