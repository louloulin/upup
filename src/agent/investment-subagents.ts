/**
 * Investment-Specialized Subagent Definitions (Sprint v7-7)
 *
 * 参考 Claude Code 的 7 种内置 subagent 模式 (Explore/Plan/general 等),
 * 为 upup 投资研究场景预定义 5 种专用 subagent。每种有:
 *   - 受限 tool 白名单 (防止越权, 投资版 "权限边界")
 *   - 专用 system prompt (聚焦单一职能)
 *   - 明确的 taskTypes (供 Coordinator 自动路由)
 *
 * 5 种类型 + 投资职能映射:
 *   explore-invest  →  行业/公司研究 (read-only)
 *   plan-invest     →  估值 + 回测设计 (read + 计算, 不下单)
 *   risk-invest     →  风险评估 + 合规 (read + portfolio metrics, 不下单)
 *   trade-invest    →  执行 paper trade (read + place_order)
 *   review-invest   →  复盘 + 归因 (read + attribution)
 *
 * 模块边界(零循环):
 *   investment-subagents.ts (Layer 4) → registry.ts (Layer 4, 同层, OK)
 *   不依赖 trading/portfolio 内部细节 (避免反向)
 *
 * 用法:
 *   import { getInvestmentSubagents } from './investment-subagents.js';
 *   const agents = getInvestmentSubagents(); // 5 个 AgentDefinition
 *   const explore = agents.find(a => a.id === 'invest-explore');
 */

import type { AgentDefinition, AgentCapability } from './registry.js';
import { getAgentRegistry } from './registry.js';

// ============================================================================
// Tool name constants (与 src/tools/* 对齐)
// ============================================================================

const READ_TOOLS = [
  'getStockPrice',
  'getKeyRatios',
  'getAnalystEstimates',
  'getEarnings',
  'getFilings',
  'getInsiderTrades',
  'web_search',
  'browser',
  'financial_search',
  'financial_metrics',
  'read_filings',
  'getPositions',
  'getCash',
  'getTradingPositions',
  'getTradingBalance',
  'getTradeQuote',
] as const;

const VALUATION_TOOLS = [
  'calculateValuationRatios',
  'calculateDCF',
  'backtestLumpSum',
  'generateBacktestReport',
] as const;

const PORTFOLIO_ANALYTICS_TOOLS = [
  'calculatePortfolioPnL',
  'attribution',
] as const;

const TRADE_TOOLS = [
  'placeTradeOrder',
  'cancelTradeOrder',
] as const;

// ============================================================================
// Agent Definitions
// ============================================================================

/** 投资研究专用 Explore — 只读, 不写不交易 */
const INVEST_EXPLORE: AgentDefinition = {
  id: 'invest-explore',
  name: 'Investment Explore Agent',
  description:
    '只读研究 subagent: 行业研究、公司基本面、SEC 文件、新闻、行情。' +
    '可调 web_search/browser/financial_metrics/所有 read 类工具。' +
    '**禁止**调用任何写类工具或交易工具。',
  version: '1.0.0',
  capabilities: ['research', 'analysis'] as AgentCapability[],
  taskTypes: [
    'research', 'research:industry', 'research:company', 'research:macro',
    'research:filings', 'research:news', 'research:competitor',
    'analyze', 'analyze:company', 'analyze:industry',
  ],
  systemPrompt:
    '你是 Investment Explore Agent,投资研究领域的只读探索助手。\n' +
    '职责: 收集并整理关于公司、行业、宏观的客观信息,不输出主观投资建议。\n' +
    '工具边界: 只能调用 read 类工具(getStockPrice/getFilings/web_search/browser 等)。\n' +
    '输出格式: 数据 + 出处 + 置信度,不写结论。\n' +
    '完成后把结构化研究结果返回主 agent 决策,自己不评估买卖。',
  preferredModel: 'sonnet',
  config: { toolWhitelist: [...READ_TOOLS] },
  isBuiltIn: true,
};

/** 投资研究专用 Plan — 估值 + 回测, 不下单 */
const INVEST_PLAN: AgentDefinition = {
  id: 'invest-plan',
  name: 'Investment Plan Agent',
  description:
    '估值 + 回测 subagent: DCF/可比估值/回测/敏感性分析。' +
    '可调所有 read + valuation/backtest 工具。' +
    '**禁止**调用 trade 类工具或写持仓工具。',
  version: '1.0.0',
  capabilities: ['analysis'] as AgentCapability[],
  taskTypes: [
    'plan', 'plan:valuation', 'plan:backtest', 'plan:scenario',
    'analyze:valuation', 'analyze:backtest', 'analyze:sensitivity',
  ],
  systemPrompt:
    '你是 Investment Plan Agent,投资规划助手。\n' +
    '职责: 在 explore 提供的客观数据基础上,设计估值模型(calculateValuationRatios/calculateDCF)、' +
    '回测策略(backtestLumpSum)、并跑敏感性分析。\n' +
    '工具边界: read + valuation/backtest 类。**不**调 trade。\n' +
    '输出: (1) 估值结论含置信区间 (2) 回测报告摘要 (3) 建议仓位区间 (不实际建仓)。\n' +
    '完成后返回主 agent,主 agent 决策后再交给 trade-invest 执行。',
  preferredModel: 'sonnet',
  config: { toolWhitelist: [...READ_TOOLS, ...VALUATION_TOOLS] },
  isBuiltIn: true,
};

/** 投资研究专用 Risk — 风险评估 + 合规, 不下单 */
const INVEST_RISK: AgentDefinition = {
  id: 'invest-risk',
  name: 'Investment Risk Agent',
  description:
    '风险评估 subagent: 组合集中度、行业暴露、单仓位上限、VaR/最大回撤。' +
    '可调 read + portfolio 指标 + attribution 工具。' +
    '**禁止**调用 trade 类工具。',
  version: '1.0.0',
  capabilities: ['analysis', 'review'] as AgentCapability[],
  taskTypes: [
    'risk', 'risk:concentration', 'risk:sector', 'risk:compliance',
    'risk:drawdown', 'risk:correlation', 'review:risk',
  ],
  systemPrompt:
    '你是 Investment Risk Agent,投资风险评估助手。\n' +
    '职责: 评估组合的集中度(单仓位 > 20% 报警)、行业暴露(单行业 > 40% 报警)、' +
    '回撤风险、相关性风险。**不出具买卖建议**。\n' +
    '工具边界: read + portfolio metrics + attribution。**不**调 trade。\n' +
    '输出: 风险评分 0-100 + 具体警示项 + 建议(仅风险角度,非交易方向)。',
  preferredModel: 'sonnet',
  config: {
    toolWhitelist: [...READ_TOOLS, ...PORTFOLIO_ANALYTICS_TOOLS],
  },
  isBuiltIn: true,
};

/** 投资研究专用 Trade — 实际下单 (paper trade) */
const INVEST_TRADE: AgentDefinition = {
  id: 'invest-trade',
  name: 'Investment Trade Agent',
  description:
    '执行 subagent: 在 sandbox broker 下 paper trade 单。' +
    '可调所有 read + trade 类工具。' +
    '下单前**必须**确认已经过 risk-invest 检查 + 主 agent 显式授权。',
  version: '1.0.0',
  capabilities: ['analysis'] as AgentCapability[],
  taskTypes: [
    'trade', 'trade:buy', 'trade:sell', 'trade:rebalance', 'trade:stop',
  ],
  systemPrompt:
    '你是 Investment Trade Agent,投资执行助手。\n' +
    '职责: 接收主 agent 的明确交易指令,在 sandbox broker 下单(placeTradeOrder)。\n' +
    '**不主动建议买卖**,只执行。**下任何单前**必须验证:\n' +
    '  1. 主 agent 已显式授权 (description 字段含 buy/sell 关键词)\n' +
    '  2. risk-invest 已评估(未评估则拒绝)\n' +
    '  3. 仓位不超过主 agent 指定的限制\n' +
    '工具边界: read + trade。**不**调 valuation/backtest (那不是执行层的职责)。\n' +
    '输出: 订单 ID + 状态 + 成交价 + post-trade 组合状态。',
  preferredModel: 'sonnet',
  config: {
    toolWhitelist: [...READ_TOOLS, ...TRADE_TOOLS],
  },
  isBuiltIn: true,
};

/** 投资研究专用 Review — 复盘 + 归因 */
const INVEST_REVIEW: AgentDefinition = {
  id: 'invest-review',
  name: 'Investment Review Agent',
  description:
    '复盘 subagent: Brinson/Style/Sector 归因、交易记录回顾、决策质量评估。' +
    '可调 read + portfolio + attribution 工具。' +
    '**禁止**调用 trade 类工具。',
  version: '1.0.0',
  capabilities: ['review', 'analysis'] as AgentCapability[],
  taskTypes: [
    'review', 'review:attribution', 'review:trades', 'review:decision',
    'review:pnl', 'analyze:performance',
  ],
  systemPrompt:
    '你是 Investment Review Agent,投资复盘助手。\n' +
    '职责: 对一段时期(单 trade / 单日 / 单周 / 单月 / 单季)的决策和结果做归因分析。\n' +
    '工具边界: read + portfolio + attribution。**不**调 trade (复盘不改持仓)。\n' +
    '输出: Brinson 3 效应 + 4 因子归因 + 行业贡献 + 决策质量评估(过程评分 0-100)。\n' +
    '提供跨时期可比的结构化指标,支持经验沉淀和投资记忆 (v7-9)。',
  preferredModel: 'sonnet',
  config: {
    toolWhitelist: [...READ_TOOLS, ...PORTFOLIO_ANALYTICS_TOOLS],
  },
  isBuiltIn: true,
};

/** 5 个投资专用 subagent 集合 */
export const INVESTMENT_SUBAGENTS: ReadonlyArray<AgentDefinition> = Object.freeze([
  INVEST_EXPLORE,
  INVEST_PLAN,
  INVEST_RISK,
  INVEST_TRADE,
  INVEST_REVIEW,
]);

// ============================================================================
// Auto-registration (module-level side effect)
// ============================================================================

let _registered = false;

/** 启动时把 5 个 subagent 注册到全局 AgentRegistry */
export function registerInvestmentSubagents(): void {
  if (_registered) return;
  const registry = getAgentRegistry();
  for (const agent of INVESTMENT_SUBAGENTS) {
    registry.register(agent);
  }
  _registered = true;
}

/** 测试辅助: 注销所有投资 subagent(让测试可以重新注册) */
export function unregisterInvestmentSubagents(): void {
  if (!_registered) return;
  const registry = getAgentRegistry();
  for (const agent of INVESTMENT_SUBAGENTS) {
    registry.unregister(agent.id, true);  // force=true: 测试辅助, 绕过 built-in 保护
  }
  _registered = false;
}

/** 测试辅助: 查询注册状态 */
export function areInvestmentSubagentsRegistered(): boolean {
  return _registered;
}

/** 便捷访问: 获取 5 个投资 subagent 定义 */
export function getInvestmentSubagents(): ReadonlyArray<AgentDefinition> {
  return INVESTMENT_SUBAGENTS;
}

/** 便捷访问: 按 ID 查单个 subagent */
export function getInvestmentSubagent(id: string): AgentDefinition | undefined {
  return INVESTMENT_SUBAGENTS.find(a => a.id === id);
}

// 启动时自动注册(与 v7-1 plan-auto-trigger / v7-2b 端口注册表范式一致)
registerInvestmentSubagents();
