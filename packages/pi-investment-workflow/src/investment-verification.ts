import { createHash } from 'node:crypto';
import { CANONICAL_INVESTMENT_PHASES } from './workflow.js';
import {
  getInvestmentDossierValidationErrors,
  type InvestmentDossier,
} from './investment-dossier.js';
import type { ResearchMarket } from '@upup/pi-planning';

export const INVESTMENT_VERIFICATION_ARTIFACT_SCHEMA = 'upup.pi.real-invest-verification.v3' as const;
export const INVESTMENT_WORKFLOW_ENTRY = 'upup-investment-workflow' as const;

export type InvestmentWorkflowAuditAction =
  | 'start'
  | 'resume'
  | 'phase_start'
  | 'phase'
  | 'phase_advanced'
  | 'step_failed'
  | 'pause'
  | 'complete';

export interface InvestmentWorkflowAuditEvent {
  readonly schema: number;
  readonly recordedAt: string;
  readonly action: InvestmentWorkflowAuditAction;
  readonly planId: string;
  readonly phase?: string;
  readonly status?: string;
  readonly [key: string]: unknown;
}

export interface ParsedInvestmentSession {
  readonly header?: {
    readonly id: string;
    readonly timestamp: string;
    readonly cwd?: string;
  };
  readonly entries: readonly Record<string, unknown>[];
  readonly workflowEvents: readonly InvestmentWorkflowAuditEvent[];
  readonly errors: readonly string[];
}

export interface InvestmentEvidenceVerificationInput {
  readonly dossier: unknown;
  readonly sessionText: string;
  readonly expectedPlanId?: string;
  readonly expectedSessionId?: string;
  readonly requireConcreteModel?: boolean;
}

export interface InvestmentEvidenceVerification {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly phaseNames: readonly string[];
  readonly eventActions: readonly InvestmentWorkflowAuditAction[];
  readonly evidenceSources: readonly string[];
  readonly sessionEntryCount: number;
}

export interface ReadOnlySessionSafetyVerification {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly auditCount: number;
  readonly deniedCount: number;
  readonly approvalRequiredCount: number;
  readonly approvalDeniedCount: number;
}

export interface RealInvestVerificationResult {
  readonly ticker: string;
  readonly market: ResearchMarket;
  readonly planId: string;
  readonly sessionId: string;
  readonly sessionFile: string;
  readonly forkSessionFile: string;
  readonly dossierFile: string;
  readonly dossierHash: string;
  readonly resumedHash: string;
  readonly provider: string;
  readonly phases: readonly { readonly phase: string; readonly status: string }[];
  readonly eventActions: readonly InvestmentWorkflowAuditAction[];
  readonly evidenceSources: readonly string[];
  readonly historyEvidence: {
    readonly provider: string;
    readonly source: string;
    readonly asOf: string;
    readonly retrievedAt: string;
  };
  readonly providerRetry: {
    readonly totalAttempts: number;
    readonly maxAttempts: number;
    readonly recovered: boolean;
    readonly evidenceCount: number;
  };
  readonly policyAudit: {
    readonly auditCount: number;
    readonly deniedCount: number;
    readonly approvalRequiredCount: number;
    readonly approvalDeniedCount: number;
  };
}

export interface RealInvestVerificationArtifactInput {
  readonly status: 'completed' | 'failed';
  readonly fixtureSeparate: true;
  readonly readOnly: true;
  readonly provider: string;
  readonly model: string;
  readonly tickers: readonly string[];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly results: readonly RealInvestVerificationResult[];
  readonly policy: {
    readonly decision: 'read_only';
    readonly approval: 'READ_ONLY';
    readonly trading: 'denied';
    readonly outboundNotifications: 'denied';
    readonly credentialExport: 'denied';
  };
}

export type RealInvestVerificationArtifact = RealInvestVerificationArtifactInput & {
  readonly schema: typeof INVESTMENT_VERIFICATION_ARTIFACT_SCHEMA;
  readonly artifactHash: string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function isAuditAction(value: unknown): value is InvestmentWorkflowAuditAction {
  return value === 'start' || value === 'resume' || value === 'phase_start' || value === 'phase'
    || value === 'phase_advanced' || value === 'step_failed' || value === 'pause' || value === 'complete';
}

export function parseInvestmentSessionJsonl(text: string): ParsedInvestmentSession {
  const entries: Record<string, unknown>[] = [];
  const workflowEvents: InvestmentWorkflowAuditEvent[] = [];
  const errors: string[] = [];
  let header: ParsedInvestmentSession['header'];
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      errors.push(`JSONL line ${index + 1} is invalid JSON`);
      return;
    }
    const entry = asRecord(parsed);
    if (!entry) {
      errors.push(`JSONL line ${index + 1} is not an object`);
      return;
    }
    entries.push(entry);
    if (entry.type === 'session') {
      const id = entry.id;
      const timestamp = entry.timestamp;
      if (typeof id === 'string' && isTimestamp(timestamp)) {
        header = { id, timestamp, ...(typeof entry.cwd === 'string' ? { cwd: entry.cwd } : {}) };
      } else {
        errors.push(`JSONL line ${index + 1} has an invalid session header`);
      }
    }
    if (entry.type !== 'custom' || entry.customType !== INVESTMENT_WORKFLOW_ENTRY) return;
    const data = asRecord(entry.data);
    if (!data || !isAuditAction(data.action) || typeof data.planId !== 'string' || !isTimestamp(data.recordedAt)) {
      errors.push(`JSONL line ${index + 1} has an invalid investment workflow event`);
      return;
    }
    workflowEvents.push(data as unknown as InvestmentWorkflowAuditEvent);
  });
  if (!header) errors.push('session header is missing');
  if (entries.length === 0) errors.push('session JSONL is empty');
  return { ...(header ? { header } : {}), entries, workflowEvents, errors };
}

export function verifyReadOnlySessionSafety(sessionText: string): ReadOnlySessionSafetyVerification {
  const parsed = parseInvestmentSessionJsonl(sessionText);
  const errors = [...parsed.errors];
  let auditCount = 0;
  let deniedCount = 0;
  let approvalRequiredCount = 0;
  let approvalDeniedCount = 0;
  for (const [index, entry] of parsed.entries.entries()) {
    if (entry.type !== 'custom' || entry.customType !== 'upup_pi_policy_audit') continue;
    auditCount += 1;
    const audit = asRecord(entry.data);
    const decision = audit?.decision;
    const effect = audit?.effect;
    if (typeof decision !== 'string') {
      errors.push(`policy audit entry ${index + 1} has no decision`);
      continue;
    }
    if (decision === 'denied') deniedCount += 1;
    else if (decision === 'approval_required') approvalRequiredCount += 1;
    else if (decision === 'approval_denied') approvalDeniedCount += 1;
    else errors.push(`read-only policy audit entry ${index + 1} has unsafe decision: ${decision}`);
    if (effect === 'financial-write' || effect === 'credential-access' || effect === 'filesystem-write') {
      if (decision !== 'denied' && decision !== 'approval_required' && decision !== 'approval_denied') {
        errors.push(`read-only policy audit entry ${index + 1} permitted unsafe effect: ${String(effect)}`);
      }
    }
  }
  return { valid: errors.length === 0, errors, auditCount, deniedCount, approvalRequiredCount, approvalDeniedCount };
}

export function verifyInvestmentEvidence(input: InvestmentEvidenceVerificationInput): InvestmentEvidenceVerification {
  const errors = [...getInvestmentDossierValidationErrors(input.dossier)];
  const dossier = input.dossier as Partial<InvestmentDossier>;
  const parsed = parseInvestmentSessionJsonl(input.sessionText);
  errors.push(...parsed.errors);
  if (input.expectedPlanId && dossier.planId !== input.expectedPlanId) errors.push('dossier planId does not match expected plan');
  if (input.expectedSessionId && dossier.sessionId !== input.expectedSessionId) errors.push('dossier sessionId does not match expected session');
  if (parsed.header && dossier.sessionId !== parsed.header.id) errors.push('session header id does not match dossier sessionId');

  const events = parsed.workflowEvents;
  const planIds = new Set(events.map((event) => event.planId));
  if (input.expectedPlanId && [...planIds].some((planId) => planId !== input.expectedPlanId)) errors.push('workflow event planId does not match expected plan');
  const phaseStarts = events.filter((event) => event.action === 'phase_start').map((event) => event.phase);
  const phaseResultEvents = events.filter((event) => event.action === 'phase');
  const phaseResults = phaseResultEvents.map((event) => event.phase);
  const expectedPhases = [...CANONICAL_INVESTMENT_PHASES];
  if (phaseStarts.join(',') !== expectedPhases.join(',')) errors.push('workflow phase_start sequence is not canonical');
  if (phaseResults.join(',') !== expectedPhases.join(',')) errors.push('workflow phase sequence is not canonical');
  if (phaseResultEvents.some((event) => event.status !== 'completed')) errors.push('workflow contains a non-completed phase event');
  if (!events.some((event) => event.action === 'start')) errors.push('workflow start event is missing');
  if (!events.some((event) => event.action === 'complete')) errors.push('workflow complete event is missing');
  if (events.some((event) => event.action === 'step_failed')) errors.push('workflow contains a failed step');

  const phaseNames: string[] = [];
  const evidenceSources: string[] = [];
  if (Array.isArray(dossier.phases)) {
    for (const phase of dossier.phases) {
      phaseNames.push(phase.phase);
      for (const evidence of phase.evidence ?? []) evidenceSources.push(evidence.source);
      for (const evidence of phase.evidence ?? []) {
        const hasRetryMetadata = evidence.retryAttempts !== undefined || evidence.retryMaxAttempts !== undefined || evidence.retryRecovered !== undefined;
        if (hasRetryMetadata && (!Number.isInteger(evidence.retryAttempts) || !Number.isInteger(evidence.retryMaxAttempts) || evidence.retryAttempts < 1 || evidence.retryMaxAttempts < evidence.retryAttempts || typeof evidence.retryRecovered !== 'boolean' || evidence.retryRecovered !== (evidence.retryAttempts > 1))) {
          errors.push(`phase ${phase.phase} retry evidence is invalid`);
        }
      }
      if (phase.status !== 'completed') errors.push(`phase ${phase.phase} is not completed`);
      if (!isTimestamp(phase.dataAsOf)) errors.push(`phase ${phase.phase} dataAsOf is invalid`);
      if (!phase.modelVersion || (input.requireConcreteModel && phase.modelVersion === 'unknown')) errors.push(`phase ${phase.phase} modelVersion is not concrete`);
      if (phase.evidence.length === 0) errors.push(`phase ${phase.phase} has no evidence`);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    phaseNames,
    eventActions: events.map((event) => event.action),
    evidenceSources: [...new Set(evidenceSources)],
    sessionEntryCount: parsed.entries.length,
  };
}

export function createRealInvestVerificationArtifact(input: RealInvestVerificationArtifactInput): RealInvestVerificationArtifact {
  const withoutHash = { schema: INVESTMENT_VERIFICATION_ARTIFACT_SCHEMA, ...input } as const;
  return { ...withoutHash, artifactHash: stableHash(withoutHash) };
}

export function getRealInvestVerificationArtifactErrors(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['artifact must be an object'];
  const artifact = value as Partial<RealInvestVerificationArtifact>;
  const errors: string[] = [];
  if (artifact.schema !== INVESTMENT_VERIFICATION_ARTIFACT_SCHEMA) errors.push('artifact schema is invalid');
  if (artifact.status !== 'completed' && artifact.status !== 'failed') errors.push('artifact status is invalid');
  if (artifact.fixtureSeparate !== true || artifact.readOnly !== true) errors.push('artifact safety flags are invalid');
  if (typeof artifact.provider !== 'string' || !artifact.provider) errors.push('artifact provider is required');
  if (typeof artifact.model !== 'string' || !artifact.model) errors.push('artifact model is required');
  if (!isTimestamp(artifact.startedAt) || !isTimestamp(artifact.completedAt)) errors.push('artifact timestamps are invalid');
  if (!Array.isArray(artifact.tickers) || artifact.tickers.some((ticker) => typeof ticker !== 'string' || !ticker)) errors.push('artifact tickers are invalid');
  if (!Array.isArray(artifact.results)) errors.push('artifact results are invalid');
  if (Array.isArray(artifact.results)) {
    artifact.results.forEach((result, index) => {
      if (!result || typeof result !== 'object') {
        errors.push(`artifact result ${index} is invalid`);
        return;
      }
      const value = result as Partial<RealInvestVerificationResult>;
      for (const field of ['ticker', 'planId', 'sessionId', 'sessionFile', 'forkSessionFile', 'dossierFile', 'dossierHash', 'resumedHash', 'provider'] as const) {
        if (typeof value[field] !== 'string' || value[field].length === 0) errors.push(`artifact result ${index} ${field} is invalid`);
      }
      if (!['cn', 'hk', 'us', 'fund', 'crypto'].includes(value.market ?? '')) errors.push(`artifact result ${index} market is invalid`);
      if (value.dossierHash !== value.resumedHash) errors.push(`artifact result ${index} resume hash mismatch`);
      if (!Array.isArray(value.phases) || value.phases.length !== CANONICAL_INVESTMENT_PHASES.length || value.phases.some((phase, phaseIndex) => phase.phase !== CANONICAL_INVESTMENT_PHASES[phaseIndex] || phase.status !== 'completed')) errors.push(`artifact result ${index} phases are invalid`);
      if (!Array.isArray(value.eventActions) || !value.eventActions.includes('start') || !value.eventActions.includes('complete')) errors.push(`artifact result ${index} audit events are invalid`);
      if (!Array.isArray(value.evidenceSources) || value.evidenceSources.length === 0) errors.push(`artifact result ${index} evidence sources are invalid`);
      const historyEvidence = value.historyEvidence;
      if (!historyEvidence || typeof historyEvidence !== 'object' || typeof historyEvidence.provider !== 'string' || historyEvidence.provider.length === 0 || typeof historyEvidence.source !== 'string' || !historyEvidence.source.startsWith('http') || !isTimestamp(historyEvidence.asOf) || !isTimestamp(historyEvidence.retrievedAt)) errors.push(`artifact result ${index} history evidence is invalid`);
      const retry = value.providerRetry;
      if (!retry || typeof retry !== 'object' || !Number.isInteger(retry.totalAttempts) || retry.totalAttempts < 1 || !Number.isInteger(retry.maxAttempts) || retry.maxAttempts < retry.totalAttempts || typeof retry.recovered !== 'boolean' || !Number.isInteger(retry.evidenceCount) || retry.evidenceCount < 1) {
        errors.push(`artifact result ${index} provider retry summary is invalid`);
      }
      const policyAudit = value.policyAudit;
      if (!policyAudit || typeof policyAudit !== 'object' || !Number.isInteger(policyAudit.auditCount) || policyAudit.auditCount < 0 || !Number.isInteger(policyAudit.deniedCount) || policyAudit.deniedCount < 0 || !Number.isInteger(policyAudit.approvalRequiredCount) || policyAudit.approvalRequiredCount < 0 || !Number.isInteger(policyAudit.approvalDeniedCount) || policyAudit.approvalDeniedCount < 0 || policyAudit.deniedCount + policyAudit.approvalRequiredCount + policyAudit.approvalDeniedCount !== policyAudit.auditCount) {
        errors.push(`artifact result ${index} policy audit summary is invalid`);
      }
    });
  }
  if (!artifact.policy || artifact.policy.decision !== 'read_only' || artifact.policy.approval !== 'READ_ONLY' || artifact.policy.trading !== 'denied' || artifact.policy.outboundNotifications !== 'denied' || artifact.policy.credentialExport !== 'denied') errors.push('artifact policy is invalid');
  if (typeof artifact.artifactHash === 'string') {
    const { artifactHash, ...withoutHash } = artifact as RealInvestVerificationArtifact;
    if (stableHash(withoutHash) !== artifactHash) errors.push('artifactHash does not match artifact content');
  } else {
    errors.push('artifactHash is required');
  }
  return errors;
}

export function validateRealInvestVerificationArtifact(value: unknown): value is RealInvestVerificationArtifact {
  return getRealInvestVerificationArtifactErrors(value).length === 0;
}
