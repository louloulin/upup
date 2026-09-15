/**
 * Worker for the cross-process dossier idempotency smoke.
 *
 * Spawned as a separate Bun process. Two roles:
 *
 *   - persist (UPUP_CROSS_ROLE=persist): build a deterministic dossier,
 *     persist it to UPUP_PLANS_DIR, load it back, write the round-trip
 *     summary to UPUP_CROSS_OUT.
 *
 *   - load (UPUP_CROSS_ROLE=load): skip the build, load the existing
 *     dossier that another process persisted, write ONLY the recovered
 *     hash to UPUP_CROSS_OUT.
 *
 *   - verify (UPUP_CROSS_ROLE=verify): load the existing dossier that
 *     another process persisted, build a synthetic session JSONL
 *     matching the dossier's planId/sessionId, run
 *     verifyInvestmentEvidence + getInvestmentDossierValidationErrors,
 *     and write a VerifySummary (validation + evidence verification
 *     result) to UPUP_CROSS_OUT. This is the cross-process counterpart
 *     to in-process resumeWorkflow: a fresh process restarts and is
 *     expected to still validate the dossier end-to-end.
 *
 * Env contract (required):
 *   UPUP_PLANS_DIR=<absolute>            — shared plans directory
 *   UPUP_CROSS_OUT=<absolute>            — output JSON file for round-trip summary
 *   UPUP_CROSS_WORKFLOW_ID=<string>      — workflow id (shared across processes)
 *
 * Env contract (optional):
 *   UPUP_CROSS_ROLE=persist|load          — defaults to persist
 *   UPUP_CROSS_PINNED_TIME=<iso>          — pinned createdAt/updatedAt;
 *                                            required when the test wants
 *                                            identical hashes from two
 *                                            independent builds.
 *
 * Exit code 0 on success, non-zero with stderr trace on failure.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

interface PersistSummary {
  pid: number;
  planId: string;
  persistedFile: string;
  finalisedHash: string;
  recoveredHash: string;
  onDiskHash: string;
  workflowId: string;
  timestamp: string;
  role: 'persist';
}

interface LoadSummary {
  pid: number;
  planId: string;
  recoveredHash: string;
  workflowId: string;
  timestamp: string;
  role: 'load';
}

interface VerifySummary {
  pid: number;
  planId: string;
  sessionId: string;
  recoveredHash: string;
  workflowId: string;
  timestamp: string;
  role: 'verify';
  evidenceVerificationValid: boolean;
  evidenceVerificationErrorCount: number;
  evidenceVerificationErrors: readonly string[];
  evidenceVerificationPhaseNames: readonly string[];
  evidenceVerificationEventActions: readonly string[];
  evidenceVerificationSourceCount: number;
  evidenceVerificationSessionEntryCount: number;
  validationErrors: string[];
}

type WorkerSummary = PersistSummary | LoadSummary | VerifySummary;

async function main(): Promise<void> {
  const outPath = process.env.UPUP_CROSS_OUT;
  const plansDir = process.env.UPUP_PLANS_DIR;
  const workflowId = process.env.UPUP_CROSS_WORKFLOW_ID;
  const rawRole = process.env.UPUP_CROSS_ROLE ?? 'persist';
  const role: 'persist' | 'load' | 'verify' =
    rawRole === 'load' ? 'load' : rawRole === 'verify' ? 'verify' : 'persist';
  const pinnedTime = process.env.UPUP_CROSS_PINNED_TIME;
  if (!outPath) throw new Error('UPUP_CROSS_OUT is required');
  if (!plansDir) throw new Error('UPUP_PLANS_DIR is required');
  if (!workflowId) throw new Error('UPUP_CROSS_WORKFLOW_ID is required');
  await mkdir(plansDir, { recursive: true });
  await mkdir(dirname(outPath), { recursive: true });

  const {
    createInvestmentDossier,
    persistInvestmentDossier,
    loadInvestmentDossier,
    getInvestmentDossierValidationErrors,
    verifyInvestmentEvidence,
    CANONICAL_INVESTMENT_PHASES,
  } = await import('@upup/pi-investment-workflow');

  if (role === 'load') {
    const recovered = loadInvestmentDossier(workflowId, plansDir);
    if (!recovered) throw new Error(`dossier not found in ${plansDir} for ${workflowId}`);
    const errors = getInvestmentDossierValidationErrors(recovered);
    if (errors.length > 0) throw new Error(`dossier invalid: ${errors.join('; ')}`);
    const summary: LoadSummary = {
      pid: process.pid,
      planId: recovered.planId,
      recoveredHash: recovered.artifactHash,
      workflowId,
      timestamp: new Date().toISOString(),
      role: 'load',
    };
    await writeFile(outPath, JSON.stringify(summary, null, 2), 'utf8');
    return;
  }

  if (role === 'verify') {
    const recovered = loadInvestmentDossier(workflowId, plansDir);
    if (!recovered) throw new Error(`dossier not found in ${plansDir} for ${workflowId}`);
    const dossierValidationErrors = getInvestmentDossierValidationErrors(recovered);
    if (dossierValidationErrors.length > 0) {
      throw new Error(`dossier invalid: ${dossierValidationErrors.join('; ')}`);
    }
    const evidenceRetrievedAt = pinnedTime ?? '2026-09-15T00:00:00.000Z';
    const sessionLines: string[] = [];
    sessionLines.push(JSON.stringify({
      type: 'session',
      id: recovered.sessionId,
      timestamp: evidenceRetrievedAt,
      cwd: '/upup/cross-process-verify',
    }));
    const workflowEvent = (action: string, extras: Record<string, unknown> = {}) => JSON.stringify({
      type: 'custom',
      customType: 'upup-investment-workflow',
      data: {
        schema: 1,
        recordedAt: evidenceRetrievedAt,
        action,
        planId: recovered.planId,
        ...extras,
      },
    });
    sessionLines.push(workflowEvent('start'));
    for (const phase of CANONICAL_INVESTMENT_PHASES) {
      sessionLines.push(workflowEvent('phase_start', { phase }));
    }
    for (const phase of CANONICAL_INVESTMENT_PHASES) {
      sessionLines.push(workflowEvent('phase', { phase, status: 'completed' }));
    }
    sessionLines.push(workflowEvent('complete'));
    const sessionText = sessionLines.join('\n') + '\n';
    const evidenceVerification = verifyInvestmentEvidence({
      dossier: recovered,
      sessionText,
      expectedPlanId: recovered.planId,
      expectedSessionId: recovered.sessionId,
      requireConcreteModel: true,
    });
    const summary: VerifySummary = {
      pid: process.pid,
      planId: recovered.planId,
      sessionId: recovered.sessionId,
      recoveredHash: recovered.artifactHash,
      workflowId,
      timestamp: new Date().toISOString(),
      role: 'verify',
      evidenceVerificationValid: evidenceVerification.valid,
      evidenceVerificationErrorCount: evidenceVerification.errors.length,
      evidenceVerificationErrors: evidenceVerification.errors,
      evidenceVerificationPhaseNames: evidenceVerification.phaseNames,
      evidenceVerificationEventActions: evidenceVerification.eventActions,
      evidenceVerificationSourceCount: evidenceVerification.evidenceSources.length,
      evidenceVerificationSessionEntryCount: evidenceVerification.sessionEntryCount,
      validationErrors: dossierValidationErrors,
    };
    await writeFile(outPath, JSON.stringify(summary, null, 2), 'utf8');
    return;
  }

  // persist role
  const evidenceRetrievedAt = pinnedTime ?? '2026-09-15T00:00:00.000Z';
  const phaseResults = [
    { phase: 'detect' as const, status: 'completed' as const, output: 'detect output', evidence: [{ source: 'upup-pi://investment-workflow/detect', retrievedAt: evidenceRetrievedAt }] },
    { phase: 'plan' as const, status: 'completed' as const, output: 'plan output', evidence: [{ source: 'upup-pi://investment-workflow/plan', retrievedAt: evidenceRetrievedAt }] },
    { phase: 'execute' as const, status: 'completed' as const, output: 'execute output', evidence: [{ source: 'upup-pi://investment-workflow/execute', retrievedAt: evidenceRetrievedAt }] },
    { phase: 'verify' as const, status: 'completed' as const, output: 'verify output', evidence: [{ source: 'upup-pi://investment-workflow/verify', retrievedAt: evidenceRetrievedAt }] },
    { phase: 'report' as const, status: 'completed' as const, output: 'report output', evidence: [{ source: 'upup-pi://investment-workflow/report', retrievedAt: evidenceRetrievedAt }] },
  ];
  const options = {
    modelVersion: 'cross-process-worker-fixture',
    dataAsOf: evidenceRetrievedAt,
    assumptions: ['cross-process worker fixture'],
  };

  const finalised = createInvestmentDossier({
    workflowId,
    plan: { ticker: '600519.SH', market: 'cn' as const, goal: '分析 600519.SH' },
    sessionId: 'cross-process-worker-session',
    intent: '分析 600519.SH',
    phaseResults,
    status: 'completed' as const,
    options,
  });

  const errorsBefore = getInvestmentDossierValidationErrors(finalised);
  if (errorsBefore.length > 0) throw new Error(`dossier invalid: ${errorsBefore.join('; ')}`);

  const file = persistInvestmentDossier(finalised, plansDir);
  const recovered = loadInvestmentDossier(finalised.planId, plansDir);
  if (!recovered) throw new Error('loadInvestmentDossier returned null');
  const errorsAfter = getInvestmentDossierValidationErrors(recovered);
  if (errorsAfter.length > 0) throw new Error(`dossier invalid after load: ${errorsAfter.join('; ')}`);
  if (recovered.artifactHash !== finalised.artifactHash) {
    throw new Error(`round-trip artifactHash mismatch: ${recovered.artifactHash} vs ${finalised.artifactHash}`);
  }
  const onDiskText = await readFile(file, 'utf8');
  const onDisk = JSON.parse(onDiskText) as { artifactHash: string; planId: string };
  if (onDisk.artifactHash !== finalised.artifactHash) {
    throw new Error(`on-disk artifactHash mismatch: ${onDisk.artifactHash} vs ${finalised.artifactHash}`);
  }

  const summary: PersistSummary = {
    pid: process.pid,
    planId: finalised.planId,
    persistedFile: file,
    finalisedHash: finalised.artifactHash,
    recoveredHash: recovered.artifactHash,
    onDiskHash: onDisk.artifactHash,
    workflowId,
    timestamp: new Date().toISOString(),
    role: 'persist',
  };
  await writeFile(outPath, JSON.stringify(summary, null, 2), 'utf8');
}

main().catch((err) => {
  console.error('cross-process worker error:', err);
  process.exit(1);
});
