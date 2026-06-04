/**
 * /invest [TICKER] [intent]
 *
 * v5 Sprint 3.2 — 5 步研究闭环命令
 * /invest NVDA                 → 5 步全跑(research/valuation/backtest/trade/review)
 * /invest NVDA 估值            → fast lane(只跑估值相关 phase)
 * /invest --resume <planId>    → 从 checkpoint 恢复
 *
 * 调 src/agent/investment-workflow.runInvestmentWorkflow()
 * 纯本地 + phaseHandler stub(无 src/tools/* 依赖,无 LLM,< 1s 框架跑通)
 *
 * 模块边界:
 * - 调 src/agent/investment-workflow(无 src/tools 依赖)
 * - 调 src/plan/plan-executor(读 plan 状态)
 * - 零跨包
 */

import { existsSync, readdirSync } from 'node:fs';
import { PLANS_DIR } from '../../utils/storage-paths.js';
import {
  resumeWorkflow,
  runInvestmentWorkflow,
  WORKFLOW_PHASES,
  type WorkflowResult,
} from '../../agent/investment-workflow.js';
import { createPhaseHandlerMap } from './phase-handlers.js';
import { loadPlan } from '../../plan/plan-executor.js';
import { extractTicker } from '../../plan/plan-builder.js';

export type InvestMode = 'full' | 'fast' | 'resume';

function parseArgs(input: string): { mode: InvestMode; ticker?: string; intent: string; planId?: string } {
  const trimmed = input.trim();
  if (!trimmed) return { mode: 'full', intent: '分析投资机会' };

  // --resume <planId>
  if (trimmed.startsWith('--resume')) {
    const m = trimmed.match(/--resume\s+(\S+)/);
    return { mode: 'resume', intent: 'resume', planId: m?.[1] };
  }

  // --fast
  const isFast = trimmed.startsWith('--fast');
  const rest = isFast ? trimmed.replace('--fast', '').trim() : trimmed;

  // ticker 抽取
  const ticker = extractTicker(rest);
  // 去掉 ticker 后的剩余 = intent
  const intent = ticker
    ? rest.replace(new RegExp(ticker.replace(/\./g, '\\.'), 'i'), '').trim() || '分析'
    : rest;

  return {
    mode: isFast ? 'fast' : 'full',
    ...(ticker ? { ticker } : {}),
    intent: intent || '分析',
  };
}

/** 渲染 WorkflowResult 为可读文本 */
function renderResult(result: WorkflowResult): string {
  const lines: string[] = [
    '',
    '═══════════════════════════════════════',
    `  Investment Workflow`,
    `  ${result.ticker ? `Ticker: ${result.ticker}` : '(无 ticker)'}  Intent: ${result.intent}`,
    `  Plan ID: ${result.planId.slice(0, 8)}`,
    '═══════════════════════════════════════',
    '',
  ];

  if (result.phases.length === 0) {
    lines.push('  (无 phase 结果)');
  } else {
    lines.push(`  5 步 phase 进度:`);
    lines.push('');
    for (const p of result.phases) {
      const icon = p.status === 'completed' ? '✓' : p.status === 'failed' ? '✗' : p.status === 'skipped' ? '⊘' : '○';
      const bar = '█'.repeat(Math.min(Math.round(p.output.length / 4), 10));
      const dur = `${p.durationMs}ms`;
      const err = p.error ? ` ⚠ ${p.error.slice(0, 40)}` : '';
      lines.push(`  ${icon} ${p.phase.padEnd(10)} [${bar.padEnd(10)}] ${dur.padStart(8)}${err}`);
      if (p.output) {
        const out = p.output.split('\n').slice(0, 3).map(l => `      ${l}`).join('\n');
        lines.push(out);
      }
    }
  }
  lines.push('');

  const successCount = result.phases.filter(p => p.status === 'completed').length;
  const failedCount = result.phases.filter(p => p.status === 'failed').length;
  lines.push(`  总耗时:   ${result.totalDurationMs}ms`);
  lines.push(`  成功:     ${successCount}/${result.phases.length}`);
  if (failedCount > 0) lines.push(`  失败:     ${failedCount}`);
  lines.push(`  最终状态: ${result.finalPlanState}  进度: ${result.progress}%`);
  lines.push('');
  lines.push(`  💡 完整执行 /invest --resume ${result.planId} 继续/重跑`);
  lines.push('');

  return lines.join('\n');
}

/** 渲染列表:当前所有 plan 的 5 步状态(给 /invest --list 用) */
function renderList(): string {
  if (!existsSync(PLANS_DIR)) return '\n  (无 plan — /invest NVDA 开始 5 步研究)\n';
  const files = readdirSync(PLANS_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) return '\n  (无 plan — /invest NVDA 开始 5 步研究)\n';

  const lines: string[] = [
    '',
    '═══════════════════════════════════════',
    '  Plans',
    '═══════════════════════════════════════',
    '',
  ];
  for (const f of files.slice(0, 10)) {
    const id = f.replace(/\.json$/, '');
    const p = loadPlan(id);
    if (!p) continue;
    const date = p.createdAt.toISOString().slice(0, 16).replace('T', ' ');
    const t = p.ticker ?? '?';
    const state = p.phase;
    const steps = p.steps.length;
    lines.push(`  ${date}  ${t.padEnd(10)}  [${state.padEnd(8)}]  ${steps} 步  ${id.slice(0, 8)}`);
  }
  lines.push('');
  return lines.join('\n');
}

/** CLI 入口 */
export async function runInvest(args: string): Promise<string> {
  const trimmed = args.trim();

  // --list
  if (trimmed === '--list' || trimmed === '-l') return renderList();

  const { mode, ticker, intent, planId } = parseArgs(trimmed);

  if (mode === 'resume') {
    if (!planId) {
      return [
        '',
        '  用法: /invest --resume <planId>',
        '  或 /invest --list 查看所有 plan',
        '',
      ].join('\n');
    }
    try {
      const result = await resumeWorkflow(planId);
      return renderResult(result);
    } catch (e) {
      return `\n  ✗ Resume 失败: ${e instanceof Error ? e.message : String(e)}\n`;
    }
  }

  const result = await runInvestmentWorkflow(intent, {
    ...(ticker ? { ticker } : {}),
    mode,
    phaseHandlerMap: createPhaseHandlerMap(),
  });
  return renderResult(result);
}

/** 导出 phase 顺序(给 help 用) */
export const INVEST_PHASES = WORKFLOW_PHASES;
