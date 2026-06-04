/**
 * Intent → Subagent Router (Sprint v8-1)
 *
 * 高内聚模块:把意图分类结果 (Intent) 映射到具体的投资 subagent ID
 * (v7-7 预定义的 5 个 invest-* subagent),供 SwarmCoordinator / investment-workflow
 * 做自动路由。
 *
 * 设计原则:
 *   1. 复用已有 IntentDetector (LLM / legacy 双模, v5 落地),不重新发明分类器
 *   2. 复用 AgentRegistry (全局 subagent 注册表),不耦合 coordinator 内部
 *   3. 路由表 (INTENT_TO_SUBAGENT) 是纯数据,易测试 / 易扩展
 *   4. DI-friendly: detector 注入,默认 createIntentDetector() (env 控制)
 *
 * 路由映射 (5 种 invest-* subagent):
 *   analysis / stock-selection / compare / tutorial / monitor
 *     → invest-explore   (只读研究, 10-K/行业/新闻/行情)
 *   backtest
 *     → invest-plan      (估值 + 回测, 无 trade)
 *   trade
 *     → invest-trade     (执行 paper trade)
 *
 * invest-risk / invest-review 不在单次 query 直路由表 — 它们是 workflow
 * 第二步 (由主 agent 在收到 explore/plan 结果后显式调度)。
 *
 * 模块边界 (零循环):
 *   intent-router.ts (Layer 4) → agent/intent-detector/ (Layer 4, 同层 OK)
 *                              → agent/registry (Layer 4, 同层 OK)
 *   不 import coordinator 内部实现 (避免反向),coordinator 调本模块即可。
 */

import {
  createIntentDetector,
  type Intent,
  type IntentResult,
  type IntentDetector,
  type IntentScore,
} from '../agent/intent-detector/index.js';
import {
  getAgentRegistry,
  type AgentDefinition,
} from '../agent/registry.js';

// ---------------------------------------------------------------------------
// Routing table (纯数据,易扩展)
// ---------------------------------------------------------------------------

/** 7 种 Intent → 5 种 invest-* subagent 直路由表 */
export const INTENT_TO_SUBAGENT: Readonly<Record<Intent, string>> = {
  'analysis': 'invest-explore',
  'stock-selection': 'invest-explore',
  'compare': 'invest-explore',
  'tutorial': 'invest-explore',
  'monitor': 'invest-explore',
  'backtest': 'invest-plan',
  'trade': 'invest-trade',
};

/** 当主路由命中 subagent 不存在 (e.g. tests without v7-7) 时的兜底 */
export const FALLBACK_SUBAGENT_ID = 'invest-explore';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RouteByIntentOptions {
  /** 注入分类器 (测试/CLI 启动用); 默认 createIntentDetector() */
  detector?: IntentDetector;
  /** 最低置信度,低于则走 fallback subagent (默认 0.4) */
  minConfidence?: number;
  /** 找不到主 subagent 时的兜底 id (默认 FALLBACK_SUBAGENT_ID) */
  fallbackSubagentId?: string;
}

export interface RouteDecision {
  /** 选中的 subagent id */
  subagentId: string;
  /** 对应 IntentDetector 选中的 intent */
  intent: Intent;
  /** 该 intent 的置信度 (0..1) */
  confidence: number;
  /** 是否命中主路由 (true) 还是走了 fallback (false: 命中 subagent 不存在 / 置信度低) */
  primary: boolean;
  /** 完整 IntentResult (供调用方审计/展示) */
  intentResult: IntentResult;
  /** 选中的 subagent 定义 (可能 undefined,当 subagent 未注册) */
  subagent: AgentDefinition | undefined;
}

// ---------------------------------------------------------------------------
// Core: routeByIntent
// ---------------------------------------------------------------------------

/**
 * 给定 query, 返回 subagent 路由决策。
 *
 * 流程:
 *   1. IntentDetector.classify(query) → IntentResult
 *   2. 取 top intent + confidence
 *   3. 查 INTENT_TO_SUBAGENT 表 → subagentId
 *   4. 校验 subagent 在 AgentRegistry 中存在
 *   5. 不存在 或 confidence 低于阈值 → fallback
 *
 * 高内聚: 纯函数 + 注入, 易测试。
 */
export async function routeByIntent(
  query: string,
  opts: RouteByIntentOptions = {},
): Promise<RouteDecision> {
  const detector = opts.detector ?? createIntentDetector();
  const minConfidence = opts.minConfidence ?? 0.4;
  const fallbackId = opts.fallbackSubagentId ?? FALLBACK_SUBAGENT_ID;

  const intentResult = await detector.classify(query);
  const top: IntentScore | undefined = intentResult.scores[0];
  const primary = top && top.confidence >= minConfidence;
  const intent: Intent = top?.intent ?? 'analysis';
  const confidence: number = top?.confidence ?? 0;

  const primarySubagentId = primary ? INTENT_TO_SUBAGENT[intent] : fallbackId;

  // 校验 subagent 是否在 registry 中
  const registry = getAgentRegistry();
  const subagent = registry.get(primarySubagentId);

  return {
    subagentId: subagent ? primarySubagentId : fallbackId,
    intent,
    confidence,
    primary: Boolean(primary && subagent),
    intentResult,
    subagent: subagent ?? registry.get(fallbackId),
  };
}

// ---------------------------------------------------------------------------
// Lightweight sync helper: 给定已知 IntentResult 直接查表 (测试 + 内部用)
// ---------------------------------------------------------------------------

/**
 * 不重新调分类器,直接根据已有 IntentResult 查表 + 校验。
 * 供 SwarmCoordinator 等已经缓存 IntentResult 的调用方使用。
 */
export function routeFromIntentResult(
  intentResult: IntentResult,
  opts: Omit<RouteByIntentOptions, 'detector'> = {},
): RouteDecision {
  const minConfidence = opts.minConfidence ?? 0.4;
  const fallbackId = opts.fallbackSubagentId ?? FALLBACK_SUBAGENT_ID;

  const top: IntentScore | undefined = intentResult.scores[0];
  const primary = top && top.confidence >= minConfidence;
  const intent: Intent = top?.intent ?? 'analysis';
  const confidence: number = top?.confidence ?? 0;

  const primarySubagentId = primary ? INTENT_TO_SUBAGENT[intent] : fallbackId;
  const registry = getAgentRegistry();
  const subagent = registry.get(primarySubagentId);

  return {
    subagentId: subagent ? primarySubagentId : fallbackId,
    intent,
    confidence,
    primary: Boolean(primary && subagent),
    intentResult,
    subagent: subagent ?? registry.get(fallbackId),
  };
}
