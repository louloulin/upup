/**
 * Investment Workflow — 5 步研究闭环编排器
 *
 * v5 Sprint 3 — 投资研究 → 估值 → 回测 → 交易 → 复盘 一次性跑完。
 *
 * 模块边界(关键 — 零循环):
 * - 复用 Sprint 1 的 plan-builder + plan-executor(均无 src/tools 依赖)
 * - 零 src/tools/finance/portfolio/risk/* 依赖(避免反向引用 agent 循环)
 * - 零 packages/commands 依赖(避免跨包)
 * - 纯 orchestration:接收 phaseHandler 回调,实际工具调用由调用方注入
 *
 * 用法:
 * ```ts
 * import { runInvestmentWorkflow } from './investment-workflow.js';
 * const result = await runInvestmentWorkflow('分析 NVDA', { ticker: 'NVDA' });
 * ```
 */

import { buildResearchPlan, detectPhases, extractTicker } from '@upup/plan-system/plan-builder';
import {
  advancePhase,
  auditLog,
  loadPlan,
  persistPlan,
  planFilePath,
} from '@upup/plan-system/plan-executor';
import type {
  ResearchPhase,
  ResearchPlan,
  ResearchPlanState,
} from '@upup/plan-system/research-plan';
import { calculateProgress, updateStepStatus } from '@upup/plan-system/plan-context';

// ============================================================================
// Types
// ============================================================================

/** 5 步 phase 状态 */
export type PhaseStatus = 'completed' | 'failed' | 'skipped' | 'pending';

/** 单 phase 执行结果 */
export interface PhaseResult {
  phase: ResearchPhase;
  status: PhaseStatus;
  output: string;
  durationMs: number;
  error?: string;
  stepIds: string[];
}

/** 整个 workflow 执行结果 */
export interface WorkflowResult {
  planId: string;
  ticker?: string;
  intent: string;
  phases: PhaseResult[];
  totalDurationMs: number;
  /** 至少一个 phase 成功 */
  success: boolean;
  /** 最终 plan 状态 */
  finalPlanState: ResearchPlanState;
  /** 最终进度(0-100) */
  progress: number;
}

/** 单 phase handler(由调用方实现,实际调工具) */
export type PhaseHandler = (
  plan: ResearchPlan,
  phase: ResearchPhase,
) => Promise<{ output: string; error?: string }>;

/** 5 步 phase 各自的 handler 映射(可只填部分 phase,未填的用 fallback) */
export type PhaseHandlerMap = Partial<Record<ResearchPhase, PhaseHandler>>;

// ============================================================================
// 5 步 phase 顺序(标准闭环)
// ============================================================================

/** 5 步 phase 顺序:research → valuation → backtest → trade → review */
export const WORKFLOW_PHASES: ReadonlyArray<ResearchPhase> = [
  'research',
  'valuation',
  'backtest',
  'trade',
  'review',
] as const;

// ============================================================================
// Core: runInvestmentWorkflow
// ============================================================================

/**
 * runInvestmentWorkflow — 5 步研究闭环编排器
 *
 * 1. 自动从 intent 抽取 ticker + 检测 phase
 * 2. buildResearchPlan 生成 plan(包含所有 5 phase,或用户指定子集)
 * 3. 顺序跑 phase,每 phase 调 phaseHandler(可注入,默认 stub)
 * 4. 软失败:phase 失败标记 'failed' 不中断,继续下一步
 * 5. checkpoint:每 phase 完成 advancePhase + persist + audit
 * 6. 最终 plan.phase='done',返回 WorkflowResult
 */
export async function runInvestmentWorkflow(
  intent: string,
  options?: {
    ticker?: string;
    phases?: ResearchPhase[];
    phaseHandler?: PhaseHandler;
    /**
     * 5 步 phase 各自的 handler 映射。优先级高于 phaseHandler。
     * 未填写的 phase 回退到 phaseHandler / defaultPhaseHandler。
     */
    phaseHandlerMap?: PhaseHandlerMap;
    /** 默认 'fast'(只跑指定 phase),'full'(跑 5 步) */
    mode?: 'fast' | 'full';
  },
): Promise<WorkflowResult> {
  const start = Date.now();
  const ticker = options?.ticker ?? extractTicker(intent);
  const mode = options?.mode ?? 'full';
  const phases: ResearchPhase[] = options?.phases ?? (mode === 'full' ? [...WORKFLOW_PHASES] : detectPhases(intent));

  // 1. 生成 plan(覆盖指定 phase)
  const plan: ResearchPlan = buildResearchPlan(intent, {
    ...(ticker !== undefined ? { ticker } : {}),
    phases,
    description: `5 步研究闭环: ${phases.join(' → ')}`,
  });
  plan.phase = 'execute';
  plan.status = 'active';
  persistPlan(plan);
  auditLog({
    planId: plan.id,
    action: 'phase_advanced',
    details: { workflow: 'investment-5step', ticker: ticker ?? null, phases, mode },
  });

  // 2. 顺序跑 phase
  const phaseResults: PhaseResult[] = [];
  const defaultHandler = options?.phaseHandler ?? defaultPhaseHandler;
  const handlerMap = options?.phaseHandlerMap ?? {};
  // 解析当前 phase 该用哪个 handler:map → fallback → default
  const resolveHandler = (phase: ResearchPhase): PhaseHandler =>
    handlerMap[phase] ?? defaultHandler;

  for (const phase of phases) {
    const phaseStart = Date.now();
    // 找该 phase 的所有 step ids
    const stepIds = plan.steps
      .filter((_s, idx) => plan.phases[Math.min(idx, plan.phases.length - 1)] === phase)
      .map(s => s.id);

    let result: PhaseResult;
    try {
      const out = await resolveHandler(phase)(plan, phase);
      result = {
        phase,
        status: out.error ? 'failed' : 'completed',
        output: out.output,
        durationMs: Date.now() - phaseStart,
        ...(out.error ? { error: out.error } : {}),
        stepIds,
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      result = {
        phase,
        status: 'failed',
        output: '',
        durationMs: Date.now() - phaseStart,
        error: errMsg,
        stepIds,
      };
    }
    phaseResults.push(result);

    // 3. 每 phase 完成:audit + mark 该 phase 的 step 为 completed + persist
    auditLog({
      planId: plan.id,
      action: result.status === 'completed' ? 'phase_advanced' : 'step_failed',
      phase,
      details: { durationMs: result.durationMs, error: result.error ?? null },
    });
    if (result.status === 'completed') {
      // mark 该 phase 所有 step 为 'completed' (calculateProgress 依赖)
      for (const stepId of stepIds) {
        updateStepStatus(plan, stepId, 'completed', result.output.slice(0, 200));
      }
    }
    // advance plan phase(用 plan-executor)
    if (result.status === 'completed') {
      // 推进到下一个 phase,完成时 advance 到 'review' 再 'done'
      const nextState: ResearchPlanState = phase === phases[phases.length - 1] ? 'done' : 'execute';
      advancePhase(plan, nextState);
    } else {
      // 失败但 plan 仍 active(让用户看到)
      advancePhase(plan, 'execute');
    }
  }

  // 4. 标记完成
  const allFailed = phaseResults.length > 0 && phaseResults.every(r => r.status === 'failed');
  plan.phase = 'done';
  plan.status = allFailed ? 'failed' : 'completed';
  plan.completedAt = new Date();
  auditLog({
    planId: plan.id,
    action: 'completed',
    details: {
      phases: phaseResults.length,
      completed: phaseResults.filter(r => r.status === 'completed').length,
      failed: phaseResults.filter(r => r.status === 'failed').length,
    },
  });
  persistPlan(plan);

  return {
    planId: plan.id,
    ...(ticker !== undefined ? { ticker } : {}),
    intent,
    phases: phaseResults,
    totalDurationMs: Date.now() - start,
    success: phaseResults.some(r => r.status === 'completed'),
    finalPlanState: plan.phase,
    progress: calculateProgress(plan),
  };
}

// ============================================================================
// Resume: 从 checkpoint 恢复
// ============================================================================

/**
 * resumeWorkflow — 从已持久化的 plan 恢复 workflow。
 * 跳过已完成的 phase,从未完成的 phase 继续。
 */
export async function resumeWorkflow(
  planId: string,
  options?: { phaseHandler?: PhaseHandler },
): Promise<WorkflowResult> {
  const plan = loadPlan(planId);
  if (!plan) {
    throw new Error(`Plan ${planId} 不存在(路径: ${planFilePath(planId)})`);
  }
  if (plan.phase === 'done') {
    return {
      planId: plan.id,
      ...(plan.ticker !== undefined ? { ticker: plan.ticker } : {}),
      intent: plan.goal,
      phases: [],
      totalDurationMs: 0,
      success: plan.status === 'completed',
      finalPlanState: plan.phase,
      progress: 100,
    };
  }

  // 找下一个未完成的 phase
  const remainingPhases = plan.phases.filter((_, idx) => {
    const step = plan.steps[idx];
    return !step || step.status !== 'completed';
  });

  if (remainingPhases.length === 0) {
    plan.phase = 'done';
    plan.status = 'completed';
    plan.completedAt = new Date();
    persistPlan(plan);
    return {
      planId: plan.id,
      ...(plan.ticker !== undefined ? { ticker: plan.ticker } : {}),
      intent: plan.goal,
      phases: [],
      totalDurationMs: 0,
      success: true,
      finalPlanState: 'done',
      progress: 100,
    };
  }

  // 复用 runInvestmentWorkflow,指定 remainingPhases
  return runInvestmentWorkflow(plan.goal, {
    ...(plan.ticker !== undefined ? { ticker: plan.ticker } : {}),
    phases: remainingPhases,
    ...(options?.phaseHandler ? { phaseHandler: options.phaseHandler } : {}),
  });
}

// ============================================================================
// Default phase handler (stub — 无 LLM 也能跑通)
// ============================================================================

/**
 * 默认 phase handler — 不调任何工具,只返回 phase 框架的描述。
 * 实际部署时调用方应注入自己的 phaseHandler(可调 src/tools/* 的真实工具)。
 */
const defaultPhaseHandler: PhaseHandler = async (plan, phase) => {
  const t = plan.ticker ?? '?';
  const phaseDesc: Record<ResearchPhase, string> = {
    research:  '基础面 + 消息面调研(财务指标 + 10-K + 近期新闻)',
    valuation: 'DCF 估值 + 多倍对比 + 同业 benchmark',
    backtest:  '策略历史回测(胜率/收益/Sharpe/MaxDD)',
    trade:     '交易建议(风险检查 + 仓位 + 止损/止盈)',
    review:    '复盘(Brinson 归因 + 复利到 coach memory)',
  };
  return {
    output: `[${phase}] ${t} — ${phaseDesc[phase]}\n框架已就绪,接入工具后自动填充数据。`,
  };
};
