/**
 * Investment Research Plan Types
 *
 * v5 Sprint 1 — Plan Mode 投资研究工作流
 * 扩展 src/plan/plan-context.ts(已有 PlanContext/PlanStep)以支持
 * 投资研究 plan:研究 → 估值 → 回测 → 交易 → 复盘 五步闭环。
 *
 * 设计要点:
 * - 不重写 plan-mode-state.ts(已有 session state API)
 * - 不动 agent.ts 主循环集成(已有,见 agent.ts:756)
 * - 复用 PlanContext/PlanStep 基础类型,扩展出 ResearchPlan
 * - 5 态执行状态机:plan → confirm → execute → review → done
 */

import type { PlanContext, PlanStep, PlanStatus } from './plan-context.js';

/** 投资研究 plan 的 5 步环节(用于工作流编排,见 v5 spec:investment-workflow) */
export type ResearchPhase =
  | 'research'      // 基础面 + 消息面
  | 'valuation'     // DCF + 多倍
  | 'backtest'      // 策略回测
  | 'trade'         // 交易建议
  | 'review';       // 复盘

/** plan 执行状态机(5 态) */
export type ResearchPlanState =
  | 'plan'         // 生成 plan,等用户确认
  | 'confirm'      // 用户已确认,准备执行
  | 'execute'      // 正在执行 steps
  | 'review'       // 执行完成,等待复盘
  | 'done';        // 全流程结束(可归档)

/** plan 中每个 step 关联的工具名（投资域工具白名单，来自 Pi Package ownership）。 */
export interface ResearchToolBinding {
  tool: string;
  params: Record<string, unknown>;
  expectedOutput: string;
  estimatedDurationMs?: number;
}

/**
 * ResearchPlan — 投资研究专用的 plan 扩展。
 * 复用 PlanContext 作为基类,扩展 tool 绑定 + phase + 标的。
 */
export interface ResearchPlan extends PlanContext {
  /** 标的 ticker,例如 "NVDA" / "AAPL" / "600519.SH" */
  ticker?: string;
  /** 当前执行阶段 */
  phase: ResearchPlanState;
  /** plan 涉及的 5 步环节(可少于 5 步) */
  phases: ResearchPhase[];
  /** 每 step 关联的工具绑定(step.id → tool binding) */
  toolBindings: Record<string, ResearchToolBinding>;
  /** 用户确认时间 */
  confirmedAt?: Date;
  /** 最终产出(综述报告 markdown) */
  finalReport?: string;
  /** 单步结果(step.id → result string) */
  stepResults: Record<string, string>;
}

/** 审计日志条目(写入 .upup/plans/audit.log JSONL) */
export interface PlanAuditEntry {
  planId: string;
  action:
    | 'created'
    | 'modified'
    | 'confirmed'
    | 'cancelled'
    | 'step_start'
    | 'step_done'
    | 'step_failed'
    | 'phase_advanced'
    | 'completed';
  stepId?: string;
  phase?: ResearchPhase;
  details?: Record<string, unknown>;
  /** ISO 8601 时间 */
  ts: string;
}

/** PlanContext → ResearchPlan 的类型守卫 */
export function isResearchPlan(p: PlanContext): p is ResearchPlan {
  return (
    typeof (p as Partial<ResearchPlan>).stepResults === 'object' &&
    Array.isArray((p as Partial<ResearchPlan>).phases)
  );
}

/** 把 ResearchPlan 序列化为可持久化 JSON(Date → ISO string) */
export function serializeResearchPlan(p: ResearchPlan): string {
  return JSON.stringify(
    {
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      completedAt: p.completedAt?.toISOString(),
      confirmedAt: p.confirmedAt?.toISOString(),
      steps: p.steps.map(s => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        completedAt: s.completedAt?.toISOString(),
      })),
    },
    null,
    2,
  );
}

/** 反序列化 JSON → ResearchPlan(ISO string → Date) */
export function deserializeResearchPlan(raw: string): ResearchPlan {
  const o = JSON.parse(raw) as ResearchPlan & {
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    confirmedAt?: string;
    steps: Array<PlanStep & { createdAt: string; completedAt?: string }>;
  };
  return {
    ...o,
    createdAt: new Date(o.createdAt),
    updatedAt: new Date(o.updatedAt),
    completedAt: o.completedAt ? new Date(o.completedAt) : undefined,
    confirmedAt: o.confirmedAt ? new Date(o.confirmedAt) : undefined,
    steps: o.steps.map(s => ({
      ...s,
      createdAt: new Date(s.createdAt),
      completedAt: s.completedAt ? new Date(s.completedAt) : undefined,
    })),
  };
}

/** PlanStatus 兼容映射(PlanContext 6 态 → ResearchPlanState 5 态) */
export function mapPlanStatusToState(status: PlanStatus): ResearchPlanState {
  switch (status) {
    case 'draft': return 'plan';
    case 'active': return 'execute';
    case 'paused': return 'review';
    case 'completed': return 'done';
    case 'cancelled': return 'plan';
    case 'failed': return 'execute';
  }
}
