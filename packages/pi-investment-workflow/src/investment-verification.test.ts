import { describe, expect, test } from 'bun:test';
import {
  createInvestmentDossier,
  createRealInvestVerificationArtifact,
  getRealInvestVerificationArtifactErrors,
  validateRealInvestVerificationArtifact,
  verifyReadOnlySessionSafety,
  verifyInvestmentEvidence,
} from './index';

const phaseNames = ['detect', 'plan', 'execute', 'verify', 'report'] as const;

function dossier() {
  return createInvestmentDossier({
    workflowId: 'plan-verification',
    plan: { ticker: 'AAPL', goal: '分析 AAPL' },
    sessionId: 'session-verification',
    intent: '分析 AAPL',
    status: 'completed',
    currentPhase: 'report',
    options: { modelVersion: 'fixture-model', dataAsOf: '2026-09-15T00:00:00.000Z' },
    phaseResults: phaseNames.map((phase) => ({
      phase,
      status: 'completed' as const,
      output: phase,
      evidence: [{ source: `fixture://${phase}`, retrievedAt: '2026-09-15T00:00:00.000Z', asOf: '2026-09-15', auditId: `audit-${phase}` }],
    })),
  });
}

function sessionJsonl(): string {
  const entries: Record<string, unknown>[] = [
    { type: 'session', version: 3, id: 'session-verification', timestamp: '2026-09-15T00:00:00.000Z' },
    { type: 'custom', customType: 'upup-investment-workflow', data: { schema: 1, recordedAt: '2026-09-15T00:00:01.000Z', action: 'start', planId: 'plan-verification' } },
  ];
  for (const phase of phaseNames) {
    entries.push({ type: 'custom', customType: 'upup-investment-workflow', data: { schema: 1, recordedAt: '2026-09-15T00:00:02.000Z', action: 'phase_start', phase, planId: 'plan-verification' } });
    entries.push({ type: 'custom', customType: 'upup-investment-workflow', data: { schema: 1, recordedAt: '2026-09-15T00:00:03.000Z', action: 'phase', phase, planId: 'plan-verification', status: 'completed' } });
  }
  entries.push({ type: 'custom', customType: 'upup-investment-workflow', data: { schema: 1, recordedAt: '2026-09-15T00:00:04.000Z', action: 'complete', planId: 'plan-verification', status: 'completed' } });
  return `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
}

describe('investment verification contract', () => {
  test('verifies canonical phases, evidence, audit events, and session identity', () => {
    const result = verifyInvestmentEvidence({ dossier: dossier(), sessionText: sessionJsonl(), expectedPlanId: 'plan-verification', expectedSessionId: 'session-verification' });
    expect(result.valid).toBe(true);
    expect(result.phaseNames).toEqual([...phaseNames]);
    expect(result.eventActions).toContain('complete');
    expect(result.evidenceSources).toHaveLength(5);
    expect(result.sessionEntryCount).toBe(13);
  });

  test('fails closed for malformed JSONL, missing phases, and failed events', () => {
    const malformed = verifyInvestmentEvidence({ dossier: dossier(), sessionText: `${sessionJsonl()}{"type":`, expectedPlanId: 'plan-verification' });
    expect(malformed.valid).toBe(false);
    expect(malformed.errors).toContain('JSONL line 14 is invalid JSON');
    const missingPhase = verifyInvestmentEvidence({ dossier: dossier(), sessionText: sessionJsonl().replaceAll('"phase":"verify"', '"phase":"report"'), expectedPlanId: 'plan-verification' });
    expect(missingPhase.errors).toContain('workflow phase_start sequence is not canonical');
    const failed = verifyInvestmentEvidence({ dossier: dossier(), sessionText: sessionJsonl().replace('"action":"complete"', '"action":"step_failed"'), expectedPlanId: 'plan-verification' });
    expect(failed.errors).toContain('workflow complete event is missing');
    expect(failed.errors).toContain('workflow contains a failed step');
  });

  test('fails closed when a read-only session contains an unsafe policy decision', () => {
    const safe = `${sessionJsonl()}${JSON.stringify({ type: 'custom', customType: 'upup_pi_policy_audit', data: { decision: 'denied', effect: 'financial-write' } })}\n`;
    expect(verifyReadOnlySessionSafety(safe)).toMatchObject({ valid: true, auditCount: 1, deniedCount: 1 });
    const unsafe = safe.replace('"decision":"denied"', '"decision":"approval_granted"');
    expect(verifyReadOnlySessionSafety(unsafe).errors).toContain('read-only policy audit entry 14 has unsafe decision: approval_granted');
    const malformed = safe.replace('"decision":"denied"', '"decision":null');
    expect(verifyReadOnlySessionSafety(malformed).errors).toContain('policy audit entry 14 has no decision');
  });

  test('fails closed for contradictory provider retry evidence', () => {
    const invalid = dossier();
    const tampered = {
      ...invalid,
      phases: invalid.phases.map((phase, index) => index === 0
        ? { ...phase, evidence: [{ ...phase.evidence[0], retryAttempts: 3, retryMaxAttempts: 2, retryRecovered: false }] }
        : phase),
    };
    expect(verifyInvestmentEvidence({ dossier: tampered, sessionText: sessionJsonl(), expectedPlanId: 'plan-verification' }).errors).toContain('phase detect retry evidence is invalid');
  });

  test('hashes and validates the independent real-provider artifact', () => {
    const artifact = createRealInvestVerificationArtifact({
      status: 'completed',
      fixtureSeparate: true,
      readOnly: true,
      provider: 'fixture-provider',
      model: 'fixture-model',
      tickers: ['AAPL'],
      startedAt: '2026-09-15T00:00:00.000Z',
      completedAt: '2026-09-15T00:01:00.000Z',
    results: [{ ticker: 'AAPL', market: 'us', planId: 'plan-verification', sessionId: 'session-verification', sessionFile: '/tmp/session.jsonl', forkSessionFile: '/tmp/session-fork.jsonl', dossierFile: '/tmp/dossier.json', dossierHash: dossier().artifactHash, resumedHash: dossier().artifactHash, provider: 'fixture-provider', phases: phaseNames.map((phase) => ({ phase, status: 'completed' })), eventActions: ['start', 'complete'], evidenceSources: ['fixture://all'], historyEvidence: { provider: 'fixture-history', source: 'https://fixture.test/history', asOf: '2026-09-14', retrievedAt: '2026-09-15T00:00:00.000Z' }, providerRetry: { totalAttempts: 5, maxAttempts: 15, recovered: false, evidenceCount: 5 }, policyAudit: { auditCount: 0, deniedCount: 0, approvalRequiredCount: 0, approvalDeniedCount: 0 } }],
      policy: { decision: 'read_only', approval: 'READ_ONLY', trading: 'denied', outboundNotifications: 'denied', credentialExport: 'denied' },
    });
    expect(validateRealInvestVerificationArtifact(artifact)).toBe(true);
    expect(getRealInvestVerificationArtifactErrors({ ...artifact, results: [{ ...artifact.results[0], providerRetry: undefined }] })).toContain('artifact result 0 provider retry summary is invalid');
    expect(getRealInvestVerificationArtifactErrors({ ...artifact, artifactHash: 'tampered' })).toContain('artifactHash does not match artifact content');
    expect(getRealInvestVerificationArtifactErrors({ ...artifact, results: [{ ...artifact.results[0], policyAudit: undefined }] })).toContain('artifact result 0 policy audit summary is invalid');
  });

  test('requires an explicit supported market for every artifact result', () => {
    const artifact = createRealInvestVerificationArtifact({
      status: 'completed', fixtureSeparate: true, readOnly: true, provider: 'fixture-provider', model: 'fixture-model', tickers: ['AAPL'],
      startedAt: '2026-09-15T00:00:00.000Z', completedAt: '2026-09-15T00:01:00.000Z',
    results: [{ ticker: 'AAPL', market: 'us', planId: 'plan-verification', sessionId: 'session-verification', sessionFile: '/tmp/session.jsonl', forkSessionFile: '/tmp/session-fork.jsonl', dossierFile: '/tmp/dossier.json', dossierHash: dossier().artifactHash, resumedHash: dossier().artifactHash, provider: 'fixture-provider', phases: phaseNames.map((phase) => ({ phase, status: 'completed' })), eventActions: ['start', 'complete'], evidenceSources: ['fixture://all'], historyEvidence: { provider: 'fixture-history', source: 'https://fixture.test/history', asOf: '2026-09-14', retrievedAt: '2026-09-15T00:00:00.000Z' }, providerRetry: { totalAttempts: 1, maxAttempts: 1, recovered: false, evidenceCount: 5 }, policyAudit: { auditCount: 0, deniedCount: 0, approvalRequiredCount: 0, approvalDeniedCount: 0 } }],
      policy: { decision: 'read_only', approval: 'READ_ONLY', trading: 'denied', outboundNotifications: 'denied', credentialExport: 'denied' },
    });
    expect(getRealInvestVerificationArtifactErrors({ ...artifact, results: [{ ...artifact.results[0], market: 'invalid' }] })).toContain('artifact result 0 market is invalid');
  });
});
