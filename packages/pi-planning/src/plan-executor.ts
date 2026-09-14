/**
 * Investment Research Plan Executor
 *
 * v5 Sprint 1.1.3 — 执行 ResearchPlan:每步调工具,持久化,审计。
 *
 * 设计:
 * - 复用 plan-context.ts 的 updateStepStatus / calculateProgress
 * - 不直接调 LLM,只调度 tool binding(实际工具调用由 agent loop 负责)
 * - 持久化:.upup/plans/<id>.json + .upup/plans/audit.log(JSONL)
 * - LRU:最多保留 100 个 plan(超出删最旧)
 * - 软失败:step 失败不抛错,标记 status='failed',继续下一步
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { updateStepStatus, calculateProgress, type PlanStepStatus } from './plan-context.js';
import { PLANS_DIR } from '@upup/utils';
import {
  deserializeResearchPlan,
  serializeResearchPlan,
  type PlanAuditEntry,
  type ResearchPlan,
  type ResearchPlanState,
  type ResearchPhase,
} from './research-plan.js';

const MAX_PLANS_KEPT = 100;

function getPlansDir(): string {
  return process.env['UPUP_PLANS_DIR'] ?? PLANS_DIR;
}

function getAuditLogPath(): string {
  return join(getPlansDir(), 'audit.log');
}

/** 单步执行结果 */
export interface StepExecutionResult {
  stepId: string;
  status: PlanStepStatus;
  output: string;
  durationMs: number;
  error?: string;
}

/** 整个 plan 的执行结果 */
export interface PlanExecutionResult {
  planId: string;
  state: ResearchPlanState;
  progress: number;
  stepResults: Record<string, string>;
  totalDurationMs: number;
  failedSteps: string[];
  finalReport?: string;
}

/** 单步执行回调(由调用方实现,实际调工具) */
export type StepExecutor = (
  plan: ResearchPlan,
  stepId: string,
) => Promise<StepExecutionResult>;

// ============================================================================
// Persistence
// ============================================================================

/** 确保 plans 目录存在 */
function ensurePlansDir(): void {
  const dir = getPlansDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** 单个 plan 文件路径 */
export function planFilePath(planId: string): string {
  return join(getPlansDir(), `${planId}.json`);
}

/** 审计日志路径 */
export function auditLogPath(): string {
  return getAuditLogPath();
}

/** 持久化 plan 到磁盘 */
export function persistPlan(plan: ResearchPlan): void {
  ensurePlansDir();
  writeFileSync(planFilePath(plan.id), serializeResearchPlan(plan), 'utf-8');
  enforceLru();
}

/** 从磁盘加载 plan */
export function loadPlan(planId: string): ResearchPlan | null {
  const path = planFilePath(planId);
  if (!existsSync(path)) return null;
  try {
    return deserializeResearchPlan(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/** 列出所有 plan id(按 mtime 倒序) */
export function listPlans(): string[] {
  ensurePlansDir();
  const files = readdirSync(getPlansDir())
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const full = join(getPlansDir(), f);
      return { id: f.replace(/\.json$/, ''), mtime: existsSync(full) ? require('node:fs').statSync(full).mtimeMs : 0 };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files.map(f => f.id);
}

/** 最多保留 100 个 plan,删最旧 */
function enforceLru(): void {
  const ids = listPlans();
  if (ids.length <= MAX_PLANS_KEPT) return;
  const toDelete = ids.slice(MAX_PLANS_KEPT);
  for (const id of toDelete) {
    const p = planFilePath(id);
    if (existsSync(p)) unlinkSync(p);
  }
}

// ============================================================================
// Audit
// ============================================================================

/** 追加审计日志(单行 JSON) */
export function auditLog(entry: Omit<PlanAuditEntry, 'ts'>): void {
  ensurePlansDir();
  const line = JSON.stringify({ ...entry, ts: new Date().toISOString() });
  appendFileSync(getAuditLogPath(), line + '\n', 'utf-8');
}

/** 读最近 N 条审计(默认 100) */
export function readAuditLog(limit = 100): PlanAuditEntry[] {
  const p = getAuditLogPath();
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, 'utf-8').trim().split('\n').filter(Boolean);
  const tail = lines.slice(-limit);
  const entries: PlanAuditEntry[] = [];
  for (const line of tail) {
    try {
      entries.push(JSON.parse(line) as PlanAuditEntry);
    } catch {
      // skip malformed line
    }
  }
  return entries;
}

// ============================================================================
// Execution
// ============================================================================

/**
 * executePlan — 顺序执行 plan 中所有 step。
 * - 每步调 executor(调用方实现,实际调工具)
 * - 失败 step 标记 'failed' 不中断
 * - 每步结束 audit + persist
 * - 全完成 → plan.state = 'done'
 */
export async function executePlan(
  plan: ResearchPlan,
  executor: StepExecutor,
): Promise<PlanExecutionResult> {
  const start = Date.now();
  const failedSteps: string[] = [];
  plan.phase = 'execute';
  plan.status = 'active';
  auditLog({ planId: plan.id, action: 'phase_advanced', phase: 'research' });
  persistPlan(plan);

  for (const step of plan.steps) {
    if (step.status === 'completed' || step.status === 'skipped') continue;

    auditLog({ planId: plan.id, action: 'step_start', stepId: step.id });
    const stepStart = Date.now();
    let result: StepExecutionResult;
    try {
      result = await executor(plan, step.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result = { stepId: step.id, status: 'failed', output: msg, durationMs: 0, error: msg };
    }

    updateStepStatus(plan, step.id, result.status, result.output);
    plan.stepResults[step.id] = result.output;
    plan.updatedAt = new Date();

    if (result.status === 'failed') {
      failedSteps.push(step.id);
      auditLog({ planId: plan.id, action: 'step_failed', stepId: step.id, details: { error: result.error ?? 'unknown' } });
    } else {
      auditLog({ planId: plan.id, action: 'step_done', stepId: step.id, details: { durationMs: result.durationMs } });
    }
    persistPlan(plan);
    void stepStart; // (used for future per-step timing display)
  }

  const allDone = plan.steps.every(s => s.status === 'completed' || s.status === 'skipped' || s.status === 'failed');
  if (allDone) {
    plan.phase = 'done';
    plan.status = failedSteps.length === plan.steps.length ? 'failed' : 'completed';
    plan.completedAt = new Date();
    auditLog({ planId: plan.id, action: 'completed', details: { failedSteps } });
    persistPlan(plan);
  }

  return {
    planId: plan.id,
    state: plan.phase,
    progress: calculateProgress(plan),
    stepResults: { ...plan.stepResults },
    totalDurationMs: Date.now() - start,
    failedSteps,
  };
}

/** 推进 plan phase(manual,用于 review/edit 阶段) */
export function advancePhase(plan: ResearchPlan, to: ResearchPlanState): void {
  plan.phase = to;
  plan.updatedAt = new Date();
  auditLog({ planId: plan.id, action: 'phase_advanced', details: { to } });
  persistPlan(plan);
}

/** 标记 plan 已确认(用户输入 "确认/yes/ok/approve" 时) */
export function confirmPlan(plan: ResearchPlan): void {
  plan.phase = 'confirm';
  plan.confirmedAt = new Date();
  plan.updatedAt = new Date();
  auditLog({ planId: plan.id, action: 'confirmed' });
  persistPlan(plan);
}

/** 取消 plan */
export function cancelPlan(plan: ResearchPlan, reason?: string): void {
  plan.status = 'cancelled';
  plan.phase = 'plan';
  plan.updatedAt = new Date();
  auditLog({ planId: plan.id, action: 'cancelled', details: { reason: reason ?? null } });
  persistPlan(plan);
}
