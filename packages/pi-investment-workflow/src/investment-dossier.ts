import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CANONICAL_INVESTMENT_PHASES, type InvestmentWorkflowPhase, type InvestmentWorkflowPlan } from './workflow.js';
import type { InvestmentAgentProfileId } from './workflow.js';
import type { ResearchMarket } from '@upup/pi-planning';

export const INVESTMENT_DOSSIER_SCHEMA = 'upup.pi.investment-dossier.v1' as const;
export type InvestmentDossierStatus = 'running' | 'paused' | 'completed' | 'failed';
export type InvestmentDossierPhaseId = 'detect' | 'plan' | 'execute' | 'verify' | 'report';
export type InvestmentPolicyDecision = 'allow' | 'sandbox_allow' | 'approval_required' | 'deny';

export interface InvestmentDossierEvidence {
  readonly source: string;
  readonly retrievedAt: string;
  readonly asOf?: string;
  readonly auditId?: string;
  readonly provider?: string;
  readonly dataFreshness?: string;
  readonly retryAttempts?: number;
  readonly retryMaxAttempts?: number;
  readonly retryRecovered?: boolean;
}

export interface InvestmentDossierRisk {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly detail: string;
}

export interface InvestmentDossierPolicy {
  readonly decision: InvestmentPolicyDecision;
  readonly reason: string;
  readonly approvalId?: string;
}

export interface InvestmentDossierPhase {
  readonly phase: InvestmentDossierPhaseId;
  readonly status: 'pending' | 'running' | 'completed' | 'blocked' | 'failed';
  readonly profile: InvestmentAgentProfileId;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly output: string;
  readonly evidence: readonly InvestmentDossierEvidence[];
  readonly risks: readonly InvestmentDossierRisk[];
  readonly policy: InvestmentDossierPolicy;
  readonly modelVersion: string;
  readonly dataAsOf: string;
}

export interface InvestmentDossier {
  readonly schema: typeof INVESTMENT_DOSSIER_SCHEMA;
  readonly workflowId: string;
  readonly planId: string;
  readonly sessionId: string;
  readonly intent: string;
  readonly ticker?: string;
  readonly market?: ResearchMarket;
  readonly status: InvestmentDossierStatus;
  readonly currentPhase?: InvestmentDossierPhaseId;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly assumptions: readonly string[];
  readonly phases: readonly InvestmentDossierPhase[];
  readonly report: string;
  readonly artifactHash: string;
}

export interface InvestmentDossierPhaseResult {
  readonly phase?: InvestmentWorkflowPhase;
  readonly status: 'completed' | 'failed' | 'skipped' | 'pending';
  readonly output: string;
  readonly error?: string;
  readonly evidence?: readonly InvestmentDossierEvidence[];
}

export interface InvestmentDossierOptions {
  readonly modelVersion?: string;
  readonly dataAsOf?: string;
  readonly assumptions?: readonly string[];
}

const PROFILE_BY_PHASE: Readonly<Record<InvestmentDossierPhaseId, InvestmentAgentProfileId>> = {
  detect: 'researcher',
  plan: 'analyst',
  execute: 'researcher',
  verify: 'reviewer',
  report: 'reviewer',
};

function now(): string {
  return new Date().toISOString();
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function evidenceFromResult(result: InvestmentDossierPhaseResult, recordedAt: string): InvestmentDossierEvidence[] {
  return (result.evidence ?? []).map((evidence) => ({
    source: evidence.source,
    retrievedAt: typeof evidence.retrievedAt === 'string' ? evidence.retrievedAt : recordedAt,
    ...(typeof evidence.asOf === 'string' ? { asOf: evidence.asOf } : {}),
    ...(typeof evidence.auditId === 'string' ? { auditId: evidence.auditId } : {}),
    ...(typeof evidence.provider === 'string' ? { provider: evidence.provider } : {}),
    ...(typeof evidence.dataFreshness === 'string' ? { dataFreshness: evidence.dataFreshness } : {}),
    ...(typeof evidence.retryAttempts === 'number' ? { retryAttempts: evidence.retryAttempts } : {}),
    ...(typeof evidence.retryMaxAttempts === 'number' ? { retryMaxAttempts: evidence.retryMaxAttempts } : {}),
    ...(typeof evidence.retryRecovered === 'boolean' ? { retryRecovered: evidence.retryRecovered } : {}),
  }));
}

function risksFor(phase: InvestmentDossierPhaseId, result?: InvestmentDossierPhaseResult): InvestmentDossierRisk[] {
  const risks: InvestmentDossierRisk[] = [];
  if (phase === 'execute') risks.push({ code: 'market_data_and_tool_outputs', severity: 'warning', detail: '执行结果依赖已声明的数据源和 Pi Package 工具证据。' });
  if (phase === 'verify' && result?.error) risks.push({ code: 'verification_failed', severity: 'critical', detail: result.error });
  if (result?.error) risks.push({ code: result.error, severity: 'warning', detail: `阶段返回错误：${result.error}` });
  return risks;
}

function policyFor(phase: InvestmentDossierPhaseId, result?: InvestmentDossierPhaseResult): InvestmentDossierPolicy {
  if (result?.error) return { decision: 'deny', reason: `阶段未通过：${result.error}` };
  if (phase === 'execute') return { decision: 'sandbox_allow', reason: '仅允许在 Pi sandbox 内执行，不允许真实交易或外发副作用。' };
  if (phase === 'verify') return { decision: 'allow', reason: '仅执行证据、风险和输出合同校验。' };
  return { decision: 'allow', reason: '只读投研阶段，无外部副作用。' };
}

function phaseArtifact(
  phase: InvestmentDossierPhaseId,
  output: string,
  result: InvestmentDossierPhaseResult | undefined,
  status: InvestmentDossierPhase['status'],
  options: InvestmentDossierOptions,
  startedAt = now(),
): InvestmentDossierPhase {
  const completedAt = status === 'completed' || status === 'failed' || status === 'blocked' ? now() : undefined;
  const recordedAt = completedAt ?? startedAt;
  return {
    phase,
    status,
    profile: PROFILE_BY_PHASE[phase],
    startedAt,
    ...(completedAt ? { completedAt } : {}),
    output,
    evidence: result ? evidenceFromResult(result, recordedAt) : [{ source: `upup-pi://investment-workflow/${phase}`, retrievedAt: recordedAt }],
    risks: risksFor(phase, result),
    policy: policyFor(phase, result),
    modelVersion: options.modelVersion ?? 'unknown',
    dataAsOf: options.dataAsOf ?? recordedAt,
  };
}

export function createInvestmentDossier(input: {
  readonly workflowId: string;
  readonly plan: InvestmentWorkflowPlan;
  readonly sessionId: string;
  readonly intent: string;
  readonly phaseResults: readonly InvestmentDossierPhaseResult[];
  readonly status: InvestmentDossierStatus;
  readonly currentPhase?: InvestmentDossierPhaseId;
  readonly options?: InvestmentDossierOptions;
}): InvestmentDossier {
  const options = input.options ?? {};
  const recordedAt = now();
  const resultFor = (phase: InvestmentDossierPhaseId): InvestmentDossierPhaseResult | undefined => input.phaseResults.find((result) => result.phase === phase);
  const statusFor = (phase: InvestmentDossierPhaseId): InvestmentDossierPhase['status'] => {
    const result = resultFor(phase);
    if (result) return result.status === 'failed' ? 'failed' : result.status === 'skipped' ? 'blocked' : result.status === 'pending' ? 'pending' : 'completed';
    return input.status === 'failed' && phase === 'verify' ? 'failed' : 'pending';
  };
  const outputFor = (phase: InvestmentDossierPhaseId): string => {
    const result = resultFor(phase);
    if (result) return result.output;
    if (phase === 'detect') return `识别投资意图：${input.intent}`;
    if (phase === 'plan') return `计划阶段：${input.plan.ticker ?? '未指定标的'}，目标为 ${input.plan.goal}`;
    if (phase === 'verify') return input.phaseResults.every((item) => item.status === 'completed') ? '证据、风险和阶段结果校验通过。' : '仍有阶段未完成，验证被阻断。';
    if (phase === 'report') return input.phaseResults.map((item) => `${item.phase}: ${item.status}`).join('; ');
    return '';
  };
  const phases: InvestmentDossierPhase[] = CANONICAL_INVESTMENT_PHASES.map((phase) => {
    const result = resultFor(phase);
    return phaseArtifact(phase, outputFor(phase), result, statusFor(phase), options, recordedAt);
  });
  const report = phases.map((phase) => `## ${phase.phase}\n${phase.output}`).join('\n\n');
  const withoutHash = {
    schema: INVESTMENT_DOSSIER_SCHEMA,
    workflowId: input.workflowId,
    planId: input.workflowId,
    sessionId: input.sessionId,
    intent: input.intent,
    ...(input.plan.ticker !== undefined ? { ticker: input.plan.ticker } : {}),
    ...(input.plan.market !== undefined ? { market: input.plan.market } : {}),
    status: input.status,
    ...(input.currentPhase === undefined ? {} : { currentPhase: input.currentPhase }),
    createdAt: recordedAt,
    updatedAt: recordedAt,
    assumptions: options.assumptions ?? ['数据源时间和模型版本必须随 artifact 保存。', '真实交易、通知、凭证和文件外发默认禁止。'],
    phases,
    report,
  } as const;
  return { ...withoutHash, artifactHash: stableHash(withoutHash) };
}

export function getInvestmentDossierValidationErrors(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['dossier must be an object'];
  const dossier = value as Partial<InvestmentDossier>;
  const errors: string[] = [];
  if (dossier.schema !== INVESTMENT_DOSSIER_SCHEMA) errors.push('schema is invalid');
  for (const field of ['workflowId', 'planId', 'sessionId', 'intent', 'report', 'artifactHash'] as const) {
    if (typeof dossier[field] !== 'string' || dossier[field].length === 0) errors.push(`${field} is required`);
  }
  if (dossier.market !== undefined && !['cn', 'hk', 'us', 'fund', 'crypto'].includes(dossier.market)) errors.push('market is invalid');
  if (!isTimestamp(dossier.createdAt)) errors.push('createdAt is invalid');
  if (!isTimestamp(dossier.updatedAt)) errors.push('updatedAt is invalid');
  if (!Array.isArray(dossier.assumptions) || dossier.assumptions.some((item) => typeof item !== 'string' || item.length === 0)) errors.push('assumptions are invalid');
  if (!Array.isArray(dossier.phases) || dossier.phases.length !== CANONICAL_INVESTMENT_PHASES.length) {
    errors.push('phases must contain exactly the canonical five phases');
  } else {
    const phases = dossier.phases as readonly InvestmentDossierPhase[];
    phases.forEach((phase, index) => {
      const expected = CANONICAL_INVESTMENT_PHASES[index];
      if (!phase || phase.phase !== expected) errors.push(`phase ${index} is not ${expected}`);
      if (!phase || !['pending', 'running', 'completed', 'blocked', 'failed'].includes(phase.status)) errors.push(`phase ${expected} status is invalid`);
      if (!phase || typeof phase.profile !== 'string' || typeof phase.output !== 'string' || typeof phase.modelVersion !== 'string' || typeof phase.dataAsOf !== 'string') errors.push(`phase ${expected} metadata is invalid`);
      if (!phase || !isTimestamp(phase.startedAt)) errors.push(`phase ${expected} startedAt is invalid`);
      if (phase?.completedAt !== undefined && !isTimestamp(phase.completedAt)) errors.push(`phase ${expected} completedAt is invalid`);
      if (phase && (phase.status === 'completed' || phase.status === 'failed' || phase.status === 'blocked') && !phase.completedAt) errors.push(`phase ${expected} completedAt is required for terminal status`);
      if (!phase || !Array.isArray(phase.evidence) || ((phase.status === 'completed' || phase.status === 'failed') && phase.evidence.length === 0) || phase.evidence.some((evidence) => !evidence || typeof evidence.source !== 'string' || evidence.source.length === 0 || !isTimestamp(evidence.retrievedAt))) errors.push(`phase ${expected} evidence is invalid`);
      if (!phase || !Array.isArray(phase.risks) || phase.risks.some((risk) => !risk || typeof risk.code !== 'string' || typeof risk.detail !== 'string' || !['info', 'warning', 'critical'].includes(risk.severity))) errors.push(`phase ${expected} risks are invalid`);
      if (!phase || !phase.policy || !['allow', 'sandbox_allow', 'approval_required', 'deny'].includes(phase.policy.decision) || typeof phase.policy.reason !== 'string' || phase.policy.reason.length === 0) errors.push(`phase ${expected} policy is invalid`);
    });
  }
  if (dossier.currentPhase !== undefined && !CANONICAL_INVESTMENT_PHASES.includes(dossier.currentPhase)) errors.push('currentPhase is invalid');
  if (typeof dossier.artifactHash === 'string') {
    const { artifactHash, ...withoutHash } = dossier as InvestmentDossier;
    if (stableHash(withoutHash) !== artifactHash) errors.push('artifactHash does not match dossier content');
  }
  return errors;
}

export function validateInvestmentDossier(value: unknown): value is InvestmentDossier {
  return getInvestmentDossierValidationErrors(value).length === 0;
}

export function dossierFilePath(planId: string, plansDirectory: string): string {
  return join(plansDirectory, `${planId}.dossier.json`);
}

export function persistInvestmentDossier(dossier: InvestmentDossier, plansDirectory: string): string {
  mkdirSync(dirname(dossierFilePath(dossier.planId, plansDirectory)), { recursive: true });
  const path = dossierFilePath(dossier.planId, plansDirectory);
  writeFileSync(path, `${JSON.stringify(dossier, null, 2)}\n`, 'utf8');
  return path;
}

export function loadInvestmentDossier(planId: string, plansDirectory: string): InvestmentDossier | null {
  const path = dossierFilePath(planId, plansDirectory);
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return validateInvestmentDossier(value) ? value : null;
  } catch {
    return null;
  }
}
