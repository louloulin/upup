import { describe, expect, test } from 'bun:test';
import { createInvestmentDossier, getInvestmentDossierValidationErrors, validateInvestmentDossier } from './investment-dossier.js';

function dossier() {
  return createInvestmentDossier({
    workflowId: 'workflow-contract',
    plan: { ticker: 'AAPL', goal: '分析 AAPL' },
    sessionId: 'session-contract',
    intent: '分析 AAPL',
    status: 'completed',
    currentPhase: 'report',
    phaseResults: [
      { phase: 'detect', status: 'completed', output: 'detect', evidence: [{ source: 'fixture://detect', retrievedAt: '2026-09-15T00:00:00.000Z' }] },
      { phase: 'plan', status: 'completed', output: 'plan', evidence: [{ source: 'fixture://plan', retrievedAt: '2026-09-15T00:00:00.000Z' }] },
      { phase: 'execute', status: 'completed', output: 'execute', evidence: [{ source: 'fixture://execute', retrievedAt: '2026-09-15T00:00:00.000Z', asOf: '2026-09-14', auditId: 'audit-execute' }] },
      { phase: 'verify', status: 'completed', output: 'verify', evidence: [{ source: 'fixture://verify', retrievedAt: '2026-09-15T00:00:00.000Z' }] },
      { phase: 'report', status: 'completed', output: 'report', evidence: [{ source: 'fixture://report', retrievedAt: '2026-09-15T00:00:00.000Z' }] },
    ],
  });
}

describe('investment dossier contract', () => {
  test('validates five phases, evidence, policy, risk, and content hash', () => {
    const value = dossier();
    expect(validateInvestmentDossier(value)).toBe(true);
    expect(getInvestmentDossierValidationErrors(value)).toEqual([]);
  });

  test('rejects reordered phases and tampered evidence', () => {
    const value = dossier();
    const reordered = { ...value, phases: [...value.phases].reverse() };
    expect(validateInvestmentDossier(reordered)).toBe(false);
    expect(getInvestmentDossierValidationErrors(reordered)).toContain('phase 0 is not detect');
    const tampered = { ...value, phases: value.phases.map((phase, index) => index === 2 ? { ...phase, evidence: [] } : phase) };
    expect(validateInvestmentDossier(tampered)).toBe(false);
    expect(getInvestmentDossierValidationErrors(tampered)).toContain('phase execute evidence is invalid');
  });

  test('requires terminal timestamps and auditable policy fields', () => {
    const value = dossier();
    const invalid = { ...value, phases: value.phases.map((phase, index) => index === 4 ? { ...phase, completedAt: undefined, policy: { decision: 'allow', reason: '' } } : phase) };
    const errors = getInvestmentDossierValidationErrors(invalid);
    expect(errors).toContain('phase report completedAt is required for terminal status');
    expect(errors).toContain('phase report policy is invalid');
  });
});
