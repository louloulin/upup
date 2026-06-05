/**
 * Plan Mode Auto-Trigger
 *
 * v6 Sprint 3 — 自动从用户输入生成 ResearchPlan 并进入 plan mode
 *
 * 解决问题(来自 v5 已知技术债 #2):
 *   v5 之前:用户说"分析 NVDA",agent 不会自动建 plan,要等用户手动 /plan
 *   v6-3:用户说"分析 NVDA",agent 自动:
 *     1. 调 IntentDetector 检意图(analysis/backtest/compare/...)
 *     2. 调 detectPhases 检测 phase
 *     3. 调 buildResearchPlan 生成 2-10 步 plan
 *     4. 调 getPlanModeState().enter(planId) 进入 plan mode
 *     5. 返回 plan 给 agent loop 展示给用户确认
 *
 * 借鉴 Claude Code AI 能力:
 *   claude code 的关键 AI 能力之一是"用户说意图,自动生成执行计划等确认"
 *   本模块把这个能力移植到 upup 投研场景
 *
 * 模块边界(零循环):
 *   - 位于 src/agent/(Layer 5)
 *   - 只 import src/plan/(同层或下层,允许)
 *   - 不 import src/tools/(避免反向)
 *   - 通过 deps 注入(不直接调 getPlanModeState,测试可注入 mock)
 *
 * 用法:
 *   const result = await maybeEnterPlanMode('分析 NVDA 的估值');
 *   if (result.triggered) {
 *     // 把 result.plan 展示给用户,等确认
 *   }
 */

import {
  detectPhases,
  buildResearchPlan,
  extractTicker,
} from '@upup/plan-system/plan-builder';
import type {
  ResearchPhase,
  ResearchPlan,
} from '@upup/plan-system/research-plan';
import type {
  Intent,
  IntentResult,
} from './intent-detector/types.js';
import { getPlanModePort } from './agent-port.js';

// ============================================================================
// Types
// ============================================================================

/** 触发原因(给 UI / 日志用) */
export type PlanTriggerReason =
  | 'plan_built'           // 成功:plan 已构建并进入 plan mode
  | 'no_plan_intent'       // 输入不匹配 plan 触发意图(用户闲聊)
  | 'already_in_plan_mode' // 当前已在 plan mode(避免重复触发)
  | 'no_phases_detected'   // 检不到 phase(输入太短或不含关键词)
  | 'detector_unavailable' // IntentDetector 抛错(降级到关键词)
  | 'build_failed';        // buildResearchPlan 失败

/** 哪些 Intent 触发 plan mode(其它意图不进 plan,如 'tutorial' / 'monitor') */
const PLAN_TRIGGER_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  'analysis',
  'backtest',
  'compare',
  'stock-selection',
]);

export interface PlanAutoTriggerResult {
  /** 是否真的进入了 plan mode */
  triggered: boolean;
  /** 构建的 plan(只在 triggered=true 时存在) */
  plan?: ResearchPlan;
  /** 主要 intent */
  primaryIntent?: Intent;
  /** 触发原因(成功/失败都给原因,方便 UI 显示) */
  reason: PlanTriggerReason;
  /** 提取的 ticker */
  ticker?: string;
  /** 检到的 phase 列表 */
  phases?: ResearchPhase[];
  /** 错误信息(reason='build_failed' 时填) */
  error?: string;
}

/**
 * 依赖注入(测试用 + 解耦)
 * 生产环境调用 maybeEnterPlanMode(input) 即可,deps 全有默认值
 */
export interface PlanAutoTriggerDeps {
  /** Intent 分类(默认用 createIntentDetector()) */
  detectIntent?: (input: string) => Promise<IntentResult | null>;
  /** buildResearchPlan(默认 src/plan/plan-builder.buildResearchPlan) */
  buildPlan?: (
    intent: string,
    options?: { description?: string; ticker?: string; phases?: ResearchPhase[] },
  ) => ResearchPlan;
  /** 检查 plan mode 是否已激活(默认 getPlanModeState().isActive) */
  isActive?: () => boolean;
  /** 进入 plan mode(默认 getPlanModeState().enter) */
  enterPlanMode?: (planId: string) => void;
}

// ============================================================================
// Default factory
// ============================================================================

/** 默认 detectIntent:动态 import IntentDetector(避免启动时拉 LLM) */
async function defaultDetectIntent(input: string): Promise<IntentResult | null> {
  try {
    const { createIntentDetector } = await import('./intent-detector/index.js');
    const detector = createIntentDetector();
    return await detector.classify(input);
  } catch {
    return null;
  }
}

function defaultBuildPlan(
  intent: string,
  options?: { description?: string; ticker?: string; phases?: ResearchPhase[] },
): ResearchPlan {
  return buildResearchPlan(intent, options);
}

function defaultIsActive(): boolean {
  // 通过 v6-1 agent-port 端口注册表读取,无 require,无循环
  return getPlanModePort()?.isActive() ?? false;
}

function defaultEnterPlanMode(planId: string): void {
  // 通过 v6-1 agent-port 端口注册表写入
  getPlanModePort()?.enter(planId);
}

// ============================================================================
// Main API
// ============================================================================

/**
 * 尝试从用户输入自动进入 plan mode
 *
 * 流程:
 *   1. 检查当前是否已在 plan mode(避免重入)
 *   2. 调 IntentDetector(失败时降级到 detectPhases 关键词)
 *   3. 检 phase(detectPhases)
 *   4. 检到 phase 就 buildResearchPlan
 *   5. enterPlanMode(planId)
 *   6. 返回 result
 *
 * 永不 throw:所有错误降级到 { triggered: false, reason, error }
 */
export async function maybeEnterPlanMode(
  userInput: string,
  deps: PlanAutoTriggerDeps = {},
): Promise<PlanAutoTriggerResult> {
  // 0. Sanity
  if (!userInput || !userInput.trim()) {
    return { triggered: false, reason: 'no_plan_intent' };
  }

  const trimmed = userInput.trim();
  const detectIntent = deps.detectIntent ?? defaultDetectIntent;
  const buildPlan = deps.buildPlan ?? defaultBuildPlan;
  const isActive = deps.isActive ?? defaultIsActive;
  const enterPlanMode = deps.enterPlanMode ?? defaultEnterPlanMode;

  // 1. 检查重入
  if (isActive()) {
    return { triggered: false, reason: 'already_in_plan_mode' };
  }

  // 2. 调 IntentDetector(失败降级)
  let primaryIntent: Intent | undefined;
  let detectorFailed = false;
  try {
    const result = await detectIntent(trimmed);
    primaryIntent = result?.scores?.[0]?.intent;
  } catch {
    detectorFailed = true;
  }

  // 3. 检 phase(从 input 关键词,永远成功,默认 research)
  const phases = detectPhases(trimmed);
  if (phases.length === 0) {
    return {
      triggered: false,
      reason: 'no_phases_detected',
      primaryIntent,
    };
  }

  // 4. Intent 门控:非 plan-triggering intent(且 detector 没失败)就拒绝
  if (primaryIntent && !detectorFailed && !PLAN_TRIGGER_INTENTS.has(primaryIntent)) {
    return {
      triggered: false,
      reason: 'no_plan_intent',
      primaryIntent,
      phases,
    };
  }

  // 5. Build plan
  const ticker = extractTicker(trimmed);
  let plan: ResearchPlan;
  try {
    plan = buildPlan(trimmed, {
      ...(ticker ? { ticker } : {}),
      phases,
    });
  } catch (e) {
    return {
      triggered: false,
      reason: 'build_failed',
      primaryIntent,
      phases,
      ticker,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // 6. Enter plan mode
  try {
    enterPlanMode(plan.id);
  } catch (e) {
    return {
      triggered: false,
      reason: 'build_failed',
      primaryIntent,
      phases,
      ticker,
      error: 'enterPlanMode failed: ' + (e instanceof Error ? e.message : String(e)),
    };
  }

  return {
    triggered: true,
    plan,
    primaryIntent,
    reason: 'plan_built',
    ticker,
    phases,
  };
}

// ============================================================================
// Convenience: synchronous keyword-only variant
// ============================================================================

/**
 * 同步变体:不调 IntentDetector(只用 detectPhases 关键词)
 * 适用场景:CLI 启动、debounce、prefilter
 */
export function maybeEnterPlanModeSync(
  userInput: string,
  deps: Pick<PlanAutoTriggerDeps, 'buildPlan' | 'isActive' | 'enterPlanMode'> = {},
): PlanAutoTriggerResult {
  if (!userInput || !userInput.trim()) {
    return { triggered: false, reason: 'no_plan_intent' };
  }
  const trimmed = userInput.trim();
  const buildPlan = deps.buildPlan ?? defaultBuildPlan;
  const isActive = deps.isActive ?? defaultIsActive;
  const enterPlanMode = deps.enterPlanMode ?? defaultEnterPlanMode;

  if (isActive()) {
    return { triggered: false, reason: 'already_in_plan_mode' };
  }

  const phases = detectPhases(trimmed);
  if (phases.length === 0) {
    return { triggered: false, reason: 'no_phases_detected' };
  }

  const ticker = extractTicker(trimmed);
  let plan: ResearchPlan;
  try {
    plan = buildPlan(trimmed, { ...(ticker ? { ticker } : {}), phases });
  } catch (e) {
    return {
      triggered: false,
      reason: 'build_failed',
      phases,
      ticker,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    enterPlanMode(plan.id);
  } catch (e) {
    return {
      triggered: false,
      reason: 'build_failed',
      phases,
      ticker,
      error: 'enterPlanMode failed: ' + (e instanceof Error ? e.message : String(e)),
    };
  }

  return {
    triggered: true,
    plan,
    reason: 'plan_built',
    ticker,
    phases,
  };
}
