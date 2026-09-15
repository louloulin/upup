/**
 * Cross-process /invest workflow idempotency contract.
 *
 * The synthetic real-invest smoke (`scripts/verify-pi-real-invest.synthetic.test.ts`)
 * runs `runInvestmentWorkflow` once and then `resumeWorkflow` / `forkWorkflowSession`
 * to verify in-process idempotency. This file verifies the **cross-process**
 * variant — dossier persistence across separate process boundaries — by
 * exercising the persistence primitives directly:
 *
 *   1. Build an InvestmentDossier via `createInvestmentDossier` (the same
 *      builder used by the orchestration layer).
 *   2. Persist it to `UPUP_PLANS_DIR`.
 *   3. Read the file with a fresh handle to simulate a brand-new process.
 *   4. `loadInvestmentDossier` from the same plans dir and verify the
 *      `artifactHash` matches.
 *
 * This is the contract that lets the CLI / stdio / Gateway / Bridge recover a
 * workflow across an actual process restart — not just a session restart.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let sharedPlansDir: string;
let priorPlansDir: string | undefined;

beforeAll(async () => {
  priorPlansDir = process.env.UPUP_PLANS_DIR;
  sharedPlansDir = await mkdtemp(join(tmpdir(), 'upup-pi-cross-process-'));
  process.env.UPUP_PLANS_DIR = sharedPlansDir;
});

afterAll(async () => {
  if (priorPlansDir === undefined) {
    delete process.env.UPUP_PLANS_DIR;
  } else {
    process.env.UPUP_PLANS_DIR = priorPlansDir;
  }
  if (sharedPlansDir) await rm(sharedPlansDir, { recursive: true, force: true });
});

function buildPlanInputs() {
  const workflowId = `cross-process-${Math.random().toString(36).slice(2, 10)}`;
  const plan = { ticker: '600519.SH', market: 'cn' as const, goal: '分析 600519.SH' };
  const sessionId = 'cross-process-fixture';
  const intent = '分析 600519.SH';
  const phaseResults = [
    { phase: 'detect' as const, status: 'completed' as const, output: 'detect output', evidence: [{ source: 'upup-pi://investment-workflow/detect', retrievedAt: '2026-09-15T00:00:00.000Z' }] },
    { phase: 'plan' as const, status: 'completed' as const, output: 'plan output', evidence: [{ source: 'upup-pi://investment-workflow/plan', retrievedAt: '2026-09-15T00:00:00.000Z' }] },
    { phase: 'execute' as const, status: 'completed' as const, output: 'execute output', evidence: [{ source: 'upup-pi://investment-workflow/execute', retrievedAt: '2026-09-15T00:00:00.000Z' }] },
    { phase: 'verify' as const, status: 'completed' as const, output: 'verify output', evidence: [{ source: 'upup-pi://investment-workflow/verify', retrievedAt: '2026-09-15T00:00:00.000Z' }] },
    { phase: 'report' as const, status: 'completed' as const, output: 'report output', evidence: [{ source: 'upup-pi://investment-workflow/report', retrievedAt: '2026-09-15T00:00:00.000Z' }] },
  ];
  const status = 'completed' as const;
  const options = {
    modelVersion: 'cross-process-fixture',
    dataAsOf: '2026-09-15T00:00:00.000Z',
    assumptions: ['cross-process smoke fixture'],
  };
  return { workflowId, plan, sessionId, intent, phaseResults, status, options };
}

describe('cross-process /invest workflow idempotency contract', () => {
  test('dossier persisted by one process is loadable with the same artifactHash by another', async () => {
    const { createInvestmentDossier, persistInvestmentDossier, loadInvestmentDossier, getInvestmentDossierValidationErrors } = await import(
      '@upup/pi-investment-workflow'
    );
    const inputs = buildPlanInputs();
    const finalised = createInvestmentDossier(inputs);
    expect(finalised.artifactHash).toBeTruthy();
    expect(getInvestmentDossierValidationErrors(finalised)).toEqual([]);

    const file = persistInvestmentDossier(finalised, sharedPlansDir);
    expect((await stat(file)).isFile()).toBe(true);

    // Simulate process restart: read the file with a fresh handle.
    const onDisk = JSON.parse(await readFile(file, 'utf8')) as { artifactHash: string; planId: string };
    expect(onDisk.artifactHash).toBe(finalised.artifactHash);
    expect(onDisk.planId).toBe(finalised.planId);

    // Process B recovers from the shared plans dir.
    const recovered = loadInvestmentDossier(finalised.planId, sharedPlansDir);
    expect(recovered).not.toBeNull();
    expect(recovered!.artifactHash).toBe(finalised.artifactHash);
    expect(recovered!.planId).toBe(finalised.planId);
    expect(getInvestmentDossierValidationErrors(recovered!)).toEqual([]);
  });

  test('two independently-built dossiers with the same inputs produce identical artifactHashes', async () => {
    // Two calls in the same process represent two process invocations that
    // observed the same plan/session/intent/phaseResults. The artifactHash
    // must be deterministic so an external dedup layer can compare across
    // process boundaries without trusting the dossier file.
    const { createInvestmentDossier, getInvestmentDossierValidationErrors } = await import(
      '@upup/pi-investment-workflow'
    );
    // Pin a deterministic clock so createdAt / updatedAt / phase
    // startedAt / phase completedAt are byte-identical across both
    // calls. Without this, two dossier constructions in the same
    // process can land in different millisecond buckets and produce
    // distinct artifactHashes — which would falsely flag the
    // cross-process idempotency contract as broken.
    const fixedClock = () => '2026-09-15T00:00:00.000Z';
    // Pin a fixed workflowId so the two builds below observe identical
    // inputs (buildPlanInputs generates a fresh Math.random-based
    // workflowId on every call; we override after construction so the
    // same planId flows into both dossiers).
    const sharedWorkflowId = 'cross-process-fixture-shared';
    const inputsA = { ...buildPlanInputs(), workflowId: sharedWorkflowId };
    const inputsB = { ...buildPlanInputs(), workflowId: sharedWorkflowId };
    const a = createInvestmentDossier({ ...inputsA, clock: fixedClock });
    const b = createInvestmentDossier({ ...inputsB, clock: fixedClock });
    expect(getInvestmentDossierValidationErrors(a)).toEqual([]);
    expect(getInvestmentDossierValidationErrors(b)).toEqual([]);
    expect(a.artifactHash).toBe(b.artifactHash);
  });
});
