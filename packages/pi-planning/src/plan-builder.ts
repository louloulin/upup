/**
 * Investment Research Plan Builder
 *
 * v5 Sprint 1.1.2 — 根据用户意图自动生成 2-10 步研究 plan。
 * 受 plan-builder 启发(同花顺问财 / FinChat 的自然语言 → 结构化方案),
 * UpUp 版本针对投资域，工具绑定到 Pi Finance/Market Data Package。
 *
 * 不调用 LLM(避免循环),使用规则 + 关键词匹配;
 * LLM 仍可在 step 描述细化时介入。
 */

import {
  addStep,
  createPlan,
  type PlanContext,
  type PlanStep,
} from './plan-context';
import type {
  ResearchMarket,
  ResearchPhase,
  ResearchPlan,
  ResearchToolBinding,
} from './research-plan';

/** 投资意图关键词 → phase 优先级映射 */
const PHASE_KEYWORDS: ReadonlyArray<{ phase: ResearchPhase; keywords: ReadonlyArray<string> }> = [
  { phase: 'detect',  keywords: ['分析', '调研', '基本面', '研究', 'analyze', 'research', 'fundamentals'] },
  { phase: 'plan',   keywords: ['估值', '价值', 'DCF', '合理价', '目标价', 'valuation', 'dcf', 'target price'] },
  { phase: 'execute', keywords: ['回测', '策略', '历史表现', '交易', '买入', '卖出', '建仓', '止损', 'backtest', 'strategy', 'historical', 'trade', 'buy', 'sell', 'position'] },
  { phase: 'verify', keywords: ['复盘', '归因', '风险', '校验', 'review', 'attribution', 'performance', 'verify', 'risk'] },
  { phase: 'report', keywords: ['报告', '汇总', '导出', 'report', 'summary', 'export'] },
];

/** 标的代码正则: 美股 NVDA / 港股 0700.HK / A 股 600519.SH / 600519 / 000001.SZ */
// 3 个独立正则,按优先级手动跑
const RE_FULL_A = /\b(\d{6}\.(?:SH|SZ|HK))\b/g;
const RE_DIGIT = /\b(\d{6})\b/g;
const RE_SYMBOL = /\b([A-Z]{1,5})\b/g;

/** 从用户输入里抽取 ticker */
export function extractTicker(input: string): string | undefined {
  // 1) 形如 600519.SH / 000001.SZ / 0700.HK
  RE_FULL_A.lastIndex = 0;
  const full = input.match(RE_FULL_A);
  if (full) return full[0].toUpperCase();
  // 2) 6 位数字 → 默认 SH
  RE_DIGIT.lastIndex = 0;
  const num = input.match(RE_DIGIT);
  if (num) return `${num[0]}.SH`;
  // 3) 1-5 个大写字母(美股 ticker)
  RE_SYMBOL.lastIndex = 0;
  const sym = input.match(RE_SYMBOL);
  return sym ? sym[0].toUpperCase() : undefined;
}


/** 根据关键词抽取相关 phase(去重保序) */
/** phase → 工具绑定模板(每 phase 1-3 步,合计 2-10 步) */
const PHASE_TEMPLATES: Readonly<Record<ResearchPhase, ReadonlyArray<ResearchToolBinding>>> = {
  detect: [
    { tool: 'financial_metrics',     params: {},                 expectedOutput: '市值/PE/PB/收入/EPS/股息' },
    { tool: 'read_filings',          params: { form: '10-K' },   expectedOutput: '最新 10-K 业务风险摘要' },
    { tool: 'research_deep_search',  params: {},                 expectedOutput: '近期新闻 + 管理层指引' },
  ],
  plan: [
    { tool: 'dcf_valuation',         params: {},                 expectedOutput: 'DCF 内在价值 + 敏感性表' },
    { tool: 'comparison',            params: {},                 expectedOutput: '同业 PE/PB/PS 对比表' },
  ],
  execute: [
    { tool: 'backtest_strategy',     params: {},                 expectedOutput: '胜率/收益/Sharpe/MaxDD' },
    { tool: 'risk_check',            params: {},                 expectedOutput: '组合集中度/单股风险' },
  ],
  verify: [
    { tool: 'portfolio_attribution', params: {},                 expectedOutput: 'Brinson 归因 + 贡献' },
    { tool: 'coach_memory',          params: {},                 expectedOutput: '证据和风险校验结果' },
  ],
  report: [
    { tool: 'report_dossier',        params: {},                 expectedOutput: '可审计结构化投研 dossier' },
  ],
};

export function detectPhases(input: string): ResearchPhase[] {
  const lower = input.toLowerCase();
  const seen = new Set<ResearchPhase>();
  const ordered: ResearchPhase[] = [];
  for (const { phase, keywords } of PHASE_KEYWORDS) {
    if (keywords.some(k => lower.includes(k.toLowerCase())) && !seen.has(phase)) {
      seen.add(phase);
      ordered.push(phase);
    }
  }
  // 默认从 detect 开始；完整 /invest 由 workflow 入口显式使用五阶段。
  if (ordered.length === 0) ordered.push('detect');
  return ordered;
}

/**
 * buildResearchPlan — 根据用户意图生成 2-10 步 ResearchPlan。
 * - 自动从 input 抽取 ticker
 * - 根据关键词决定包含哪些 phase
 * - 每 phase 用模板展开成 1-3 个 step
 * - 每 step 关联一个工具绑定(tool + params + expectedOutput)
 */
export function buildResearchPlan(
  intent: string,
  options?: { description?: string; ticker?: string; market?: ResearchMarket; phases?: ResearchPhase[] },
): ResearchPlan {
  const ticker = options?.ticker ?? extractTicker(intent);
  const phases = options?.phases ?? detectPhases(intent);

  // 从 PlanContext 起步(继承 id/goal/status/createdAt)
  const ctx = createPlan(intent, {
    description: options?.description ?? generateDescription(intent, ticker, phases),
  });

  // 升格为 ResearchPlan(通过 Object.assign + 类型断言;不破坏 plan-context.ts)
  const plan: ResearchPlan = Object.assign(ctx, {
    ...(ticker !== undefined ? { ticker } : {}),
    ...(options?.market !== undefined ? { market: options.market } : {}),
    phase: 'plan' as const,
    currentPhase: phases[0] ?? 'detect',
    phases,
    toolBindings: {} as Record<string, ResearchToolBinding>,
    stepResults: {} as Record<string, string>,
  });

  // 为每个 phase 添加 1-3 个 step(合计 2-10 步)
  for (const phase of phases) {
    const templates = PHASE_TEMPLATES[phase];
    for (const tpl of templates) {
      const step: PlanStep = addStep(plan, describeStep(phase, tpl, ticker), []);
      plan.toolBindings[step.id] = {
        ...tpl,
        params: { ...tpl.params, ...(ticker !== undefined ? { ticker } : {}) },
      };
    }
  }

  // 边界:至少 2 步
  if (plan.steps.length < 2) {
    const extra = addStep(plan, '整理研究结论并生成投资建议', []);
    plan.toolBindings[extra.id] = {
      tool: 'skill',
      params: { skill: 'investment-report', ...(ticker !== undefined ? { ticker } : {}) },
      expectedOutput: '最终投资建议(买/持/卖 + 目标价 + 风险点)',
    };
  }

  // 边界:上限 10 步
  if (plan.steps.length > 10) {
    plan.steps = plan.steps.slice(0, 10);
  }

  return plan;
}

/**
 * modifyPlan — 用户输入修改建议后,调整 plan。
 * 支持操作:
 *  - 加 step("加上 X" / "add X" / "还有 Y")
 *  - 删 step("不要 X" / "remove X")
 *  - 改 ticker("改看 AAPL")
 */
export function modifyPlan(plan: ResearchPlan, userInput: string): ResearchPlan {
  const lower = userInput.toLowerCase();

  // 改 ticker
  const newTicker = extractTicker(userInput);
  if (newTicker && newTicker !== plan.ticker) {
    plan.ticker = newTicker;
    // 同步更新所有 step 的 params
    for (const step of plan.steps) {
      const binding = plan.toolBindings[step.id];
      if (binding) binding.params = { ...binding.params, ticker: newTicker };
    }
  }

  // 删 step
  if (/(不要|remove|删除|去掉|drop)/.test(lower)) {
    plan.steps = plan.steps.filter(s => !lower.includes(s.description.toLowerCase().slice(0, 8)));
  }

  // 加 step
  if (/(加|添加|add|还有|另外|plus)/.test(lower)) {
    const extra = addStep(plan, extractAddedStep(userInput), []);
    plan.toolBindings[extra.id] = {
      tool: 'research_deep_search',
      params: { query: userInput, ...(plan.ticker !== undefined ? { ticker: plan.ticker } : {}) },
      expectedOutput: '补充调研结果',
    };
  }

  plan.updatedAt = new Date();
  return plan;
}

// ---- helpers ----

function generateDescription(intent: string, ticker: string | undefined, phases: ResearchPhase[]): string {
  const t = ticker ? ` ${ticker}` : '';
  return `投资研究 plan${t}:涵盖 ${phases.join(' → ')}。\n意图:${intent}`;
}

function describeStep(phase: ResearchPhase, tpl: ResearchToolBinding, ticker: string | undefined): string {
  const t = ticker ? ` (${ticker})` : '';
  return `[${phase}] ${tpl.tool}${t} → ${tpl.expectedOutput}`;
}

function extractAddedStep(input: string): string {
  // 截取关键词之后的描述
  const m = input.match(/(?:加上|添加|add|还有|另外|plus)\s*(.+)/i);
  return m?.[1]?.trim() || input.trim();
}
