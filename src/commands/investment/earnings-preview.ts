/**
 * /earnings-preview <TICKER>
 *
 * v5 Sprint 2.2 — 财报前瞻
 * 优先用 plan-builder 启发式生成"财报前瞻 plan"展示研究框架;
 * 当 .upup/plans/<ticker>.json 缓存存在时,展示历史记录。
 *
 * 模块边界:
 * - 只依赖 src/plan/plan-builder(无 src/tools 依赖) + src/utils/storage-paths
 * - 不依赖 src/tools/*(避免 finance → agent 反向引用循环)
 */

import { existsSync } from 'node:fs';
import { PLANS_DIR } from '../../utils/storage-paths.js';
import { buildResearchPlan, extractTicker } from '../../plan/plan-builder.js';
import { loadPlan } from '../../plan/plan-executor.js';
import type { ResearchPlan } from '../../plan/research-plan.js';

function parseTicker(args: string): string | undefined {
  const raw = args.trim();
  if (!raw) return undefined;
  // 优先用 plan-builder 的 extractTicker(支持 NVDA / 600519.SH / 600519)
  return extractTicker(raw) ?? raw.split(/\s+/)[0]?.toUpperCase();
}

/** 加载该 ticker 的历史 plan(如存在) */
function loadTickerHistory(ticker: string): ResearchPlan[] {
  if (!existsSync(PLANS_DIR)) return [];
  const plans: ResearchPlan[] = [];
  // 简单按 ticker 字符串匹配 plan.ticker(plan-executor 已经有 loadPlan(id))
  // 这里通过遍历 PLANS_DIR 下所有 .json 找 ticker 匹配
  try {
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const files = readdirSync(PLANS_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const id = f.replace(/\.json$/, '');
      const p = loadPlan(id);
      if (p?.ticker === ticker) plans.push(p);
    }
  } catch {
    // ignore
  }
  return plans.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** 渲染一个"财报前瞻"的 plan 框架 */
function renderPlanFramework(plan: ResearchPlan): string {
  const lines: string[] = [
    '',
    '  📋 推荐研究计划(本地生成,无 LLM)',
    `  Plan ID: ${plan.id.slice(0, 8)}  (目标 ticker: ${plan.ticker ?? '?'})`,
    '',
    `  ${'#'.padStart(3)}  ${'Phase'.padEnd(10)} ${'Tool'.padEnd(25)} Expected Output`,
    '  ' + '─'.repeat(80),
  ];
  let i = 1;
  for (const step of plan.steps) {
    const binding = plan.toolBindings[step.id];
    const tool = binding?.tool ?? '?';
    const expected = binding?.expectedOutput ?? '?';
    const phase = plan.phases[Math.min(i - 1, plan.phases.length - 1)] ?? '?';
    lines.push(`  ${String(i).padStart(3)}  ${phase.padEnd(10)} ${tool.padEnd(25)} ${expected.slice(0, 40)}`);
    i += 1;
  }
  return lines.join('\n');
}

/** 渲染该 ticker 的历史 plan 摘要 */
function renderHistory(plans: ResearchPlan[]): string[] {
  if (plans.length === 0) return ['  (无历史 plan)'];
  const lines: string[] = [`  共 ${plans.length} 条:`];
  for (const p of plans.slice(0, 5)) {
    const date = p.createdAt.toISOString().slice(0, 10);
    const phase = p.phase;
    const steps = p.steps.length;
    lines.push(`    • ${date}  [${phase.padEnd(8)}]  ${steps} 步  — ${p.goal.slice(0, 30)}`);
  }
  return lines;
}

/** CLI 入口 */
export function runEarningsPreview(args: string): string {
  const ticker = parseTicker(args);
  if (!ticker) {
    return [
      '',
      '  用法: /earnings-preview <TICKER>',
      '  示例: /earnings-preview NVDA',
      '         /earnings-preview 600519',
      '         /earnings-preview 600519.SH',
      '',
    ].join('\n');
  }

  // 1. 加载该 ticker 历史 plan
  const history = loadTickerHistory(ticker);
  // 2. 用 plan-builder 启发式生成"财报前瞻"plan 框架
  const framework = buildResearchPlan(`分析 ${ticker} 估值与财报`, {
    description: `财报前瞻: 下次财报日期 + 共识预期 + 历史 surprise 平均`,
    ticker,
    phases: ['research', 'valuation'],
  });

  return [
    '',
    '═══════════════════════════════════════',
    `  Earnings Preview — ${ticker}`,
    '═══════════════════════════════════════',
    '',
    '  📊 历史 plan(本地 .upup/plans/)',
    ...renderHistory(history),
    '',
    renderPlanFramework(framework),
    '',
    '  ⚠ 实际财报日期/共识预期需接入 Tushare/FINANCIAL_DATASETS_API',
    '  框架就绪,接入后自动填充数字。',
    '',
  ].join('\n');
}
